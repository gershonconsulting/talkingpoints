// Quick talking point (v1.10.0, 2026-11-12): built on the fly from a website or a professional email,
// with Cloudflare Workers AI. It reads the company's public website (home + a few standard pages),
// then the AI writes the brief against the client's company, ICP and team.
// Quick talking points are labelled as such and kept apart from the researched Streak briefs:
// they never appear in the Leads list, the daily run or the Friday run.

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// Free / personal mailboxes: no company website behind them.
const FREE_MAIL = new Set(('gmail.com googlemail.com yahoo.com yahoo.fr yahoo.co.uk ymail.com hotmail.com hotmail.fr outlook.com ' +
  'outlook.fr live.com live.fr msn.com icloud.com me.com mac.com aol.com proton.me protonmail.com gmx.com gmx.de gmx.fr ' +
  'web.de orange.fr free.fr laposte.net sfr.fr wanadoo.fr yandex.com mail.com zoho.com qq.com 163.com naver.com').split(' '));

const EMAIL = /^[^@\s<>]+@([^@\s<>]+\.[^@\s<>]+)$/;

// "jane.doe@acme.com" | "Jane Doe <jane@acme.com>" | "acme.com" | "https://www.acme.com/about"
export function parseInput(raw) {
  const t = String(raw || '').trim();
  if (!t) return { error: 'Paste a website or a professional email.' };
  const angle = t.match(/<([^>]+)>/);
  const candidate = (angle ? angle[1] : t).trim().replace(/^mailto:/i, '');
  const m = candidate.match(EMAIL);
  if (m) {
    const email = candidate.toLowerCase();
    const domain = m[1].toLowerCase().replace(/\.$/, '');
    if (FREE_MAIL.has(domain)) return { error: `${domain} is a personal mailbox. Use a professional email or the company website.` };
    const local = email.split('@')[0];
    const display = angle ? t.slice(0, t.indexOf('<')).replace(/["']/g, '').trim() : '';
    const parts = local.split(/[._-]+/).filter((p) => /^[a-z]{2,}$/.test(p));
    const guess = display || (parts.length >= 2 ? parts.slice(0, 2).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ') : '');
    return { kind: 'email', email, domain: domain.replace(/^www\./, ''), url: `https://${domain.replace(/^www\./, '')}`, personGuess: guess };
  }
  let url;
  try { url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`); } catch { url = null; }
  if (!url || !/\.[a-z]{2,}$/i.test(url.hostname)) return { error: 'That is not a website or an email address.' };
  const domain = url.hostname.toLowerCase().replace(/^www\./, '');
  return { kind: 'website', domain, url: `${url.protocol}//${url.hostname}${url.pathname === '/' ? '' : url.pathname}` };
}

const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

function readPage(html, base) {
  const meta = (name) => (html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)`, 'i')) ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i')) || [])[1] || '';
  const title = decode(((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim());
  const description = decode(meta('description') || meta('og:description'));
  const siteName = decode(meta('og:site_name'));
  const links = [...html.matchAll(/href=["']([^"'#]+)["']/gi)].map((x) => { try { return new URL(x[1], base).href; } catch { return ''; } }).filter(Boolean);
  const text = decode(html
    .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h\d|br|tr|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\r]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  return { title, description, siteName, links, text };
}

async function get(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; GershonTalkingPoints/1.10; +https://talkingpoints.gershon.ai)', accept: 'text/html,*/*' },
    });
    if (!res.ok || !String(res.headers.get('content-type') || '').includes('html')) return null;
    return { url: res.url, html: (await res.text()).slice(0, 600000) };
  } catch { return null; }
}

const SOCIAL = [
  ['LinkedIn', /linkedin\.com\/(company|school|in)\//i], ['X / Twitter', /(twitter|x)\.com\/[^/]+$/i],
  ['Facebook', /facebook\.com\//i], ['Instagram', /instagram\.com\//i], ['YouTube', /youtube\.com\//i], ['TikTok', /tiktok\.com\//i],
];

// Reads the public website: home page, then the first "about / team / company / contact" pages it links to.
export async function readWebsite(target) {
  const home = (await get(target.url)) || (await get(`https://www.${target.domain}`)) || (await get(`http://${target.domain}`));
  if (!home) return { ok: false, pages: [], social: [], text: '' };
  const first = readPage(home.html, home.url);
  const host = new URL(home.url).hostname;
  const wanted = /(about|a-propos|qui-sommes|company|team|equipe|leadership|management|who-we|contact|products|solutions|services)/i;
  const extra = [...new Set(first.links.filter((l) => { try { const u = new URL(l); return u.hostname === host && wanted.test(u.pathname); } catch { return false; } }))].slice(0, 4);
  const pages = [{ url: home.url, ...first }];
  for (const p of await Promise.all(extra.map(get))) if (p) pages.push({ url: p.url, ...readPage(p.html, p.url) });

  const social = [];
  for (const [name, re] of SOCIAL) {
    const hit = pages.flatMap((p) => p.links).find((l) => re.test(l) && !/share|intent|sharer/i.test(l));
    if (hit) social.push({ channel: name, url: hit.split('?')[0] });
  }
  let budget = 9000;
  const text = pages.map((p) => {
    const chunk = `PAGE ${p.url}\nTitle: ${p.title}\n${p.description ? `Description: ${p.description}\n` : ''}${p.text.slice(0, Math.max(0, Math.min(budget, 4000)))}`;
    budget -= chunk.length;
    return budget > -4000 ? chunk : '';
  }).filter(Boolean).join('\n\n');
  return { ok: true, name: first.siteName || first.title.split(/[|\-–—:]/)[0].trim(), pages: pages.map((p) => p.url), social, text };
}

const today = () => new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/New_York' });

// Builds the brief JSON (functions/_render.js format).
export async function buildQuickBrief(env, { target, site, clientName, company, icp, team }) {
  const teamText = team.map((m) => `- ${m.name || 'team member'} (${m.title || ''}): ${m.background || 'no background on file'}`).join('\n') || '(no team background on file)';
  const prompt = `You prepare a talking-points brief for ${clientName}'s team before they contact a prospect.

INPUT GIVEN BY THE USER: ${target.kind === 'email' ? `professional email ${target.email}${target.personGuess ? ` (name likely: ${target.personGuess})` : ''}` : `website ${target.url}`}
PROSPECT DOMAIN: ${target.domain}

PROSPECT WEBSITE (public text, may be partial)
${site.ok ? site.text : '(the website could not be read)'}

${clientName.toUpperCase()} — THE COMPANY
${company || '(no company description yet)'}

${clientName.toUpperCase()} — IDEAL CUSTOMER PROFILE (ICP)
${icp || '(no ICP yet)'}

${clientName.toUpperCase()} TEAM
${teamText}

Rules: never invent facts, numbers, clients, people or news. Use only what is above. If something is unknown, leave it out
or say it is unknown. Judge honestly whether the prospect fits the ICP. "Lead with this" ties what ${clientName} sells to
what this prospect does. If an email was given, the person is the email owner: only state their role if the website says it.
Use **bold** for the key fact in a sentence. Write in English.

Return ONLY JSON:
{"company_name":"<prospect company name>",
 "person":{"name":"<name or empty>","role":"<role if found on the website, else empty>","text":"<what we know about this person, or empty>"},
 "snapshot":[{"label":"<e.g. Industry, HQ, Size, Offer, Markets>","value":"<short>"}],
 "company":"<3-5 sentences: what the company does, for whom, where>",
 "icp_fit":{"verdict":"Strong fit|Possible fit|Weak fit|Unknown","why":"<one or two sentences>"},
 "in_common":{"best_match":{"name":"<team member or empty>","reason":"<one sentence>"},"items":["<real overlap>"]},
 "lead_with":[{"title":"<short heading>","text":"<1-3 sentences>"}],
 "hooks":["<fact from the website worth dropping into the call>"],
 "talking_points":["<question or point>"],
 "attention":[{"title":"<missing data or risk>","text":"<what to check before the call>"}]}`;

  const out = await env.AI.run(MODEL, { messages: [{ role: 'user', content: prompt }], max_tokens: 2000, temperature: 0.2 });
  const raw = typeof out === 'string' ? out : out?.response ?? JSON.stringify(out);
  let ai = {};
  if (raw && typeof raw === 'object') ai = raw;
  else { const m = String(raw).match(/\{[\s\S]*\}/); try { ai = m ? JSON.parse(m[0]) : {}; } catch { ai = {}; } }

  const arr = (x) => (Array.isArray(x) ? x : []);
  const str = (x) => (typeof x === 'string' ? x.trim() : '');
  const companyName = str(ai.company_name) || site.name || target.domain;
  const personName = str(ai.person?.name) || target.personGuess || '';
  const role = str(ai.person?.role);
  const fit = ai.icp_fit && str(ai.icp_fit.verdict) ? ai.icp_fit : null;
  const fitTone = fit && /strong/i.test(fit.verdict) ? 'brand' : 'warn';

  const attention = arr(ai.attention).filter((a) => a && str(a.title));
  if (!site.ok) attention.unshift({ title: 'Website could not be read', text: `Nothing could be read from ${target.domain}. Check the address, or research the company before the call.` });
  if (!icp) attention.unshift({ title: 'No ICP on file', text: 'Add your ideal customer profile in Settings → Talking points template so the fit check means something.' });
  attention.push({ title: 'Quick talking point', text: 'Built in seconds by AI from the public website only (no LinkedIn, CRM history or registry data). Verify before relying on it.' });

  return {
    header: {
      company: companyName,
      person: personName,
      role,
      when: `Quick talking point · ${today()}`,
      chips: [
        { label: 'QUICK — AI FROM ' + (target.kind === 'email' ? 'EMAIL' : 'WEBSITE'), tone: 'warn' },
        ...(fit ? [{ label: `ICP: ${String(fit.verdict).toUpperCase()}`, tone: fitTone }] : []),
      ],
      source_line: target.kind === 'email' ? `Email: ${target.email} · Website: ${target.domain}` : `Website: ${target.domain}`,
    },
    snapshot: [
      ...arr(ai.snapshot).filter((s) => s && str(s.label) && str(s.value)).slice(0, 6),
      { label: 'Website', value: target.domain },
      ...(fit ? [{ label: 'ICP fit', value: `${fit.verdict}${str(fit.why) ? ` — ${str(fit.why)}` : ''}`, tone: fitTone === 'brand' ? undefined : 'warn' }] : []),
    ],
    in_common: ai.in_common?.best_match?.name || arr(ai.in_common?.items).length ? ai.in_common : null,
    lead_with: arr(ai.lead_with).filter((x) => x && str(x.title)),
    person: personName && str(ai.person?.text) ? { name: personName, text: str(ai.person.text) } : null,
    company: str(ai.company) ? { text: str(ai.company) } : null,
    hooks: arr(ai.hooks).map(str).filter(Boolean),
    social: site.social.length ? { rows: site.social.map((s) => ({ channel: s.channel, audience: '—', recency: '—', read: s.url })), note: 'Channels linked from the website. Audience and activity not checked in a quick talking point.' } : null,
    talking_points: arr(ai.talking_points).map(str).filter(Boolean),
    attention,
    sources: [
      ...site.pages.map((u) => ({ used: true, text: `Website: ${u}` })),
      ...(site.ok ? [] : [{ used: false, text: `Website: ${target.domain} could not be read` }]),
      { used: !!icp, text: icp ? `${clientName}: company & ICP (Settings)` : `${clientName}: no ICP on file` },
      { used: false, text: 'LinkedIn, Streak history and company registries: not used in a quick talking point' },
    ],
    footer: `Gershon Consulting · Quick talking point (Cloudflare Workers AI) · prepared ${today()}`,
  };
}
