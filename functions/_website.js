// Finding the lead's company and checking who the lead is (v1.16.1, 2026-11-26).
// The Kingdee International Holdings talking point (Nov 24) came out empty: the lead booked with a
// personal Gmail, the guessed site kingdee.com was rejected because the page does not contain the exact
// words "Kingdee International", and there was no search fallback — so the AI wrote three paragraphs
// about Gershon instead of the prospect. Olivier: "One of the worst possible talking point."
// This module has no imports so it can be tested on its own (node --test test/website_identity.test.mjs).

const NAME_NOISE = /\b(inc|llc|ltd|gmbh|sa|sas|ag|co|corp|corporation|company|group|holdings?|plc|bv|nv|srl|spa|limited|the|international|global|technologies|technology|software)\b\.?/gi;
const norm = (x) => String(x || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

// Distinctive words of a company name: "Kingdee International Holdings" → ["kingdee"].
export function distinctiveWords(company = '') {
  const base = String(company).split(/\s+[-–—|/(]\s*|\s*\(/)[0];
  return norm(base.replace(NAME_NOISE, ' ')).split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
}

// A site belongs to the company when it names it in full, or when its own domain carries the company's
// distinctive word and the page names that word too (kingdee.com + "Kingdee" on the page).
export function namesCompany(site = {}, company = '', domain = '') {
  const flat = (x) => norm(x).replace(/[^a-z0-9]/g, '');
  const page = flat(`${site.name || ''} ${String(site.text || '').slice(0, 5000)}`);
  const full = flat(String(company).split(/\s+[-–—|/(]/)[0].replace(/\b(inc|llc|ltd|gmbh|sa|sas|ag|co|corp|plc|bv|nv|srl|spa|limited|the)\b\.?/gi, ' '));
  if (full.length >= 3 && page.includes(full)) return true;
  const host = flat(String(domain).split('.').slice(0, -1).join(''));
  return distinctiveWords(company).some((w) => w.length >= 5 && host.includes(w) && page.includes(w));
}

// Directories, social networks, news and finance sites are never the company's own website.
const NOT_OWN_SITE = /(^|\.)(linkedin|wikipedia|wikiwand|facebook|twitter|x|instagram|youtube|tiktok|crunchbase|bloomberg|reuters|zoominfo|dnb|glassdoor|indeed|baidu|google|bing|duckduckgo|yahoo|marketscreener|investing|wsj|ft|cnbc|forbes|hkex|hkexnews|sec|gleif|opencorporates|pitchbook|cbinsights|owler|rocketreach|apollo|signalhire|craft|globaldata|tracxn|amazon|apple|github|medium|reddit|quora|zhihu|sina|sohu)\.[a-z.]+$/i;

// From web-search results, the first one whose host carries the company's distinctive word.
export function pickOfficialSite(results = [], company = '') {
  const words = distinctiveWords(company);
  if (!words.length) return null;
  for (const r of results) {
    let u;
    try { u = new URL(r.url); } catch { continue; }
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (NOT_OWN_SITE.test(host)) continue;
    if (words.some((w) => host.split('.').slice(0, -1).join('').replace(/-/g, '').includes(w))) {
      return { kind: 'website', domain: host, url: `${u.protocol}//${u.hostname}`, searched: true };
    }
  }
  return null;
}

export async function searchOfficialSite(search, company) {
  const name = String(company).split(/\s+[-–—|(]/)[0].trim();
  for (const q of [`"${name}" official website`, `${distinctiveWords(company)[0] || name} company official site`]) {
    const hit = pickOfficialSite(await search(q, { n: 8 }).catch(() => []), company);
    if (hit) return hit;
  }
  return null;
}

// Who is the lead? A personal mailbox with nothing public tying the person to the company is a risk
// the caller must hear about before the call, not after (anyone can type a company name in a booking form).
export function identityCheck({ leadName = '', company = '', freeMail = false, personResults = [], phone = '' } = {}) {
  if (!freeMail) return null;
  const words = distinctiveWords(company);
  const last = norm(leadName).split(/\s+/).filter((w) => w.length >= 2).pop() || '';
  const tied = personResults.some((r) => {
    const t = norm(`${r.title} ${r.snippet}`);
    return last && t.includes(last) && words.some((w) => t.includes(w));
  });
  if (tied) return null;
  const who = leadName || 'The lead';
  return {
    title: 'Who is this person? Not verified',
    text: `${who} booked with a personal mailbox and no public source found ties ${who.split(' ')[0]} to ${company}${phone ? ` (phone given: ${phone})` : ''}. In the first minute, ask their role, team and who else is involved — and whether they speak for ${company} or for a smaller entity or project.`,
  };
}
