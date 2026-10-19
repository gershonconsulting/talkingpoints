// Public financial / registry data for a lead's company, where it exists.
// Returns { country, text, source } or null. Each provider is optional:
//   France  → Pappers           (PAPPERS_API_KEY)
//   UK      → Companies House   (COMPANIES_HOUSE_API_KEY, free)
//   US      → SEC EDGAR         (listed companies only, no key)
// Other EU countries (DE North Data / Handelsregister, IT, ES, BE, NL, CH) are filled by the
// research step until an API key is added; the section is hidden when nothing is found.

const UA = 'talkingpoints.gershon.ai olivier@gershonconsulting.com';
const money = (n, cur = '') => {
  if (n === null || n === undefined || isNaN(n)) return null;
  const a = Math.abs(n);
  const s = a >= 1e9 ? `${(n / 1e9).toFixed(1)}bn` : a >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : a >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n);
  return `${cur}${s}`;
};

export function guessCountry({ company = '', email = '', website = '' }) {
  const name = company.toLowerCase();
  const tld = (email.split('@')[1] || website).split('.').pop()?.toLowerCase();
  if (/\b(sas|sasu|sarl|s\.a\.s)\b/.test(name) || tld === 'fr') return 'FR';
  if (/\b(gmbh|ag|kg|ug)\b/.test(name) || tld === 'de') return 'DE';
  if (/\b(ltd|limited|plc|llp)\b/.test(name) || tld === 'uk') return 'UK';
  if (/\b(srl|s\.r\.l|spa|s\.p\.a)\b/.test(name) || tld === 'it') return 'IT';
  if (/\b(sl|s\.l\.)\b/.test(name) || tld === 'es') return 'ES';
  if (/\b(bv|nv|b\.v\.)\b/.test(name) || tld === 'nl') return 'NL';
  if (tld === 'be') return 'BE';
  if (tld === 'ch') return 'CH';
  if (/\b(inc|llc|corp|corporation)\b/.test(name) || ['com', 'us', 'io', 'net'].includes(tld)) return 'US';
  return '';
}

async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json', ...headers } });
  if (!r.ok) return null;
  return r.json();
}

async function pappers(env, company) {
  if (!env.PAPPERS_API_KEY) return null;
  const s = await getJson(`https://api.pappers.fr/v2/recherche?q=${encodeURIComponent(company)}&par_page=1&api_token=${env.PAPPERS_API_KEY}`);
  const siren = s?.resultats?.[0]?.siren;
  if (!siren) return null;
  const e = await getJson(`https://api.pappers.fr/v2/entreprise?siren=${siren}&api_token=${env.PAPPERS_API_KEY}`);
  if (!e) return null;
  const parts = [
    `SIREN **${e.siren}** · ${e.forme_juridique || ''}${e.capital ? ` · capital ${money(e.capital, '€')}` : ''}${e.siege?.ville ? ` · ${e.siege.ville}` : ''}.`,
  ];
  const fin = (e.finances || [])[0];
  if (fin) parts.push(`Latest accounts (${fin.annee}): revenue **${money(fin.chiffre_affaires, '€') || 'n/a'}**, net result **${money(fin.resultat, '€') || 'n/a'}**${fin.effectif ? `, ${fin.effectif} staff` : ''}.`);
  const owners = (e.beneficiaires_effectifs || []).map((b) => `${b.prenom || ''} ${b.nom || ''}`.trim()).filter(Boolean);
  if (owners.length) parts.push(`Beneficial owners: ${owners.join(', ')}.`);
  const procs = e.procedures_collectives || [];
  parts.push(procs.length ? `**Court proceedings on file: ${procs.map((p) => p.type).join(', ')}** — check before pitching.` : 'No collective proceedings (BODACC) on file.');
  return { country: 'FR', text: parts.join('\n\n'), source: 'Pappers' };
}

async function companiesHouse(env, company) {
  if (!env.COMPANIES_HOUSE_API_KEY) return null;
  const auth = { authorization: 'Basic ' + btoa(`${env.COMPANIES_HOUSE_API_KEY}:`) };
  const base = 'https://api.company-information.service.gov.uk';
  const s = await getJson(`${base}/search/companies?q=${encodeURIComponent(company)}&items_per_page=1`, auth);
  const hit = s?.items?.[0];
  if (!hit) return null;
  const c = await getJson(`${base}/company/${hit.company_number}`, auth);
  const psc = await getJson(`${base}/company/${hit.company_number}/persons-with-significant-control`, auth);
  const owners = (psc?.items || []).map((p) => p.name).filter(Boolean);
  const parts = [
    `Company no. **${hit.company_number}** · ${c?.type || ''} · status **${c?.company_status || hit.company_status}** · incorporated ${c?.date_of_creation || hit.date_of_creation || 'n/a'}.`,
    c?.accounts?.last_accounts?.made_up_to ? `Last accounts made up to ${c.accounts.last_accounts.made_up_to} (${c.accounts.last_accounts.type || 'type n/a'}).` : '',
    owners.length ? `Persons with significant control: ${owners.join(', ')}.` : '',
    c?.has_insolvency_history ? '**Insolvency history on file.**' : 'No insolvency history.',
  ].filter(Boolean);
  return { country: 'UK', text: parts.join('\n\n'), source: 'Companies House' };
}

async function sec(company) {
  const list = await getJson('https://www.sec.gov/files/company_tickers.json');
  if (!list) return null;
  const norm = (s) => s.toLowerCase().replace(/[,.]|\b(inc|corp|corporation|llc|ltd|plc|co)\b/g, '').replace(/\s+/g, ' ').trim();
  const target = norm(company);
  const hit = Object.values(list).find((c) => norm(c.title) === target) || Object.values(list).find((c) => norm(c.title).startsWith(target));
  if (!hit) return null;
  const cik = String(hit.cik_str).padStart(10, '0');
  const facts = await getJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
  const g = facts?.facts?.['us-gaap'] || {};
  const latest = (...keys) => {
    for (const k of keys) {
      const v = (g[k]?.units?.USD || []).filter((x) => x.form === '10-K' || x.form === '10-Q').sort((a, b) => (a.end < b.end ? 1 : -1))[0];
      if (v) return v;
    }
    return null;
  };
  const rev = latest('Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax');
  const ni = latest('NetIncomeLoss');
  const cash = latest('CashAndCashEquivalentsAtCarryingValue');
  const parts = [
    `Listed: **${hit.ticker}** · SEC CIK ${hit.cik_str}.`,
    rev ? `Revenue ${money(rev.val, '$')} (${rev.form}, period to ${rev.end}).` : 'No reported revenue (pre-revenue or not tagged).',
    ni ? `Net result ${money(ni.val, '$')} (${ni.form}, to ${ni.end}).` : '',
    cash ? `Cash ${money(cash.val, '$')} at ${cash.end}.` : '',
  ].filter(Boolean);
  return { country: 'US', text: parts.join(' '), source: 'SEC EDGAR' };
}

export async function lookupFinancials(env, lead) {
  const country = guessCountry({ company: lead.company, email: lead.leadEmail });
  try {
    if (country === 'FR') return await pappers(env, lead.company);
    if (country === 'UK') return await companiesHouse(env, lead.company);
    if (country === 'US' || !country) return await sec(lead.company);
  } catch (e) {
    console.error('financials lookup failed', lead.company, e);
  }
  return null;
}
