// Talking-point writer (v1.16.0). Takes the research pass (functions/_research.js), the Streak record,
// the lead's website and the client's knowledge base / ICP / team, and writes the brief JSON in the
// agreed structure (the Ansana / PEPperPRINT format, functions/_render.js):
//   header (+ context alert) · grade · snapshot · lead with this · person · company · financials &
//   ownership · previous conversation · LinkedIn & social · industry pulse · talking points & questions ·
//   next US events · needs your attention · sources
// "Lead with this" is about the PROSPECT (facts from research tied to what the client sells), never a
// recital of the client's own proof points — the Phytokana failure of 2026-11-25.

import { verifyNumbers, searchProvider } from './_research.js';
import { computeIcpGrade, icpChip, ICP_JSON, ICP_RULE } from './_icp.js';

// Strongest Workers AI model first; the next one is used if a model fails or returns no JSON.
export const MODELS = ['@cf/openai/gpt-oss-120b', '@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'];

export function textOf(out) {
  if (out == null) return '';
  if (typeof out === 'string') return out;
  if (typeof out.response === 'string') return out.response;
  if (out.response && typeof out.response === 'object') return JSON.stringify(out.response);
  if (Array.isArray(out.output)) {
    return out.output.filter((o) => o.type === 'message').flatMap((o) => o.content || []).map((c) => c.text || '').join('\n');
  }
  if (out.choices?.[0]?.message?.content) return out.choices[0].message.content;
  if (typeof out.output_text === 'string') return out.output_text;
  return JSON.stringify(out);
}
export function firstJson(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}' && --depth === 0) {
      try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

export async function aiJson(env, system, prompt) {
  const errors = [];
  for (const model of MODELS) {
    try {
      const out = /gpt-oss/.test(model)
        ? await env.AI.run(model, { instructions: system, input: prompt, reasoning: { effort: 'medium' }, max_output_tokens: 6000 })
        : await env.AI.run(model, { messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], max_tokens: 4000, temperature: 0.2 });
      const j = firstJson(textOf(out));
      if (j && (j.lead_with || j.company)) return { json: j, model };
      errors.push(`${model}: no JSON`);
    } catch (e) { errors.push(`${model}: ${e.message || e}`); }
  }
  return { json: {}, model: '', errors };
}

const arr = (x) => (Array.isArray(x) ? x : []);
// The model sometimes returns the label template as one row ("Industry|HQ|…" / "Food|Calgary|…").
export function splitRows(rows) {
  return rows.flatMap((r) => {
    const l = String(r?.label || '').split('|'), v = String(r?.value || '').split('|');
    return l.length > 1 && l.length === v.length ? l.map((x, i) => ({ label: x.trim(), value: v[i].trim() })) : [r];
  });
}
const str = (x) => (typeof x === 'string' ? x.trim() : '');

// Does this text talk about the prospect (a distinctive word from the research or website that is not
// in the client's own knowledge base)? Generic "we can help them expand" lines fail.
export function prospectSpecific(text, prospectCorpus, clientKb) {
  const words = (s) => new Set(String(s || '').toLowerCase().normalize('NFKD').match(/[a-z][a-z0-9-]{4,}/g) || []);
  const kb = words(clientKb);
  const pc = words(prospectCorpus);
  const common = new Set(['company', 'market', 'their', 'which', 'would', 'about', 'through', 'support', 'business', 'growth', 'expand', 'expansion', 'strategy', 'customers', 'buyers', 'consulting', 'leverage', 'opportunity', 'products', 'services', 'should', 'could', 'state', 'states', 'united', 'american', 'america']);
  return [...words(text)].filter((w) => pc.has(w) && !kb.has(w) && !common.has(w)).length >= 2;
}

export function prompt({ clientName, company, icp, team, lead, site, research, financialsText, domain }) {
  const teamText = team.map((m) => `- ${m.name || 'team member'} (${m.title || ''}): ${m.background || 'no background on file'}`).join('\n') || '(none on file)';
  return `PROSPECT: ${lead.company} — ${lead.leadName || 'unknown person'}${lead.leadRole ? `, ${lead.leadRole}` : ''}${lead.leadEmail ? ` <${lead.leadEmail}>` : ''}
WEBSITE: ${domain || 'not found'}
CRM STAGE: ${lead.stage || 'n/a'}

=== STREAK NOTES ===
${String(lead.notes || '(none)').slice(0, 3000)}

=== CONVERSATION SO FAR (emails / LinkedIn, newest last) ===
${String(lead.conversation || '(none)').slice(0, 6000)}

=== PROSPECT WEBSITE (public text) ===
${site.ok ? site.text.slice(0, 9000) : '(could not be read)'}

=== RESEARCH (web search, news, registries, social audit) ===
${research.corpus.slice(0, 12000)}

=== PUBLIC FINANCIALS ===
${financialsText || '(none found)'}

=== ${clientName.toUpperCase()} — WHAT THEY SELL (knowledge base) ===
${String(company || '(none)').slice(0, 4000)}

=== ${clientName.toUpperCase()} — IDEAL CUSTOMER PROFILE ===
${String(icp || '(none)').slice(0, 3000)}

=== ${clientName.toUpperCase()} TEAM ===
${teamText}

TODAY: ${new Date().toISOString().slice(0, 10)}

Write the talking-points brief ${clientName}'s team reads before calling this prospect. Return ONLY this JSON:
{"context":"<1-2 sentences: where things stand right now (stage, last exchange, what is expected from this call)>",
 "snapshot":[{"label":"Industry","value":"..."},{"label":"HQ","value":"..."},{"label":"Founded","value":"..."},{"label":"Size","value":"..."},{"label":"Funding","value":"..."},{"label":"What they sell","value":"..."},{"label":"Sells to","value":"..."},{"label":"US presence","value":"..."}],
 ${ICP_JSON},
 "lead_with":[{"title":"<short heading>","text":"<2-3 sentences: a SPECIFIC fact about the prospect from the research/website/conversation, and how ${clientName}'s offer answers it>"}],
 "person":"<4-6 sentences: role, background, prior companies, public talks or posts — from the person search results and website>",
 "in_common":{"best_match":{"name":"<team member or empty>","reason":"<one sentence>"},"items":["<real overlap between a team member and the lead>"]},
 "company":"<5-7 sentences: what they do, products, customers, locations, funding, recent news, US activity>",
 "history":{"said":"<what the prospect said or asked>","proposed":"<what ${clientName} proposed>","open_items":["<open action item>"]},
 "hooks":["<a concrete fact worth dropping into the call>"],
 "industry":[{"title":"<trend>","text":"<2 sentences: why it matters for THIS call — prospect's home market and the US>"}],
 "talking_points":["<question or point specific to this prospect>"],
 "events":[{"name":"<event>","when_where":"<dates and city exactly as in the US EVENTS SEARCH>","note":"<why it fits this prospect>","from_search":true}],
 "attention":[{"title":"<CRM gap, missing data or risk>","text":"<what to do before the call>"}]}

Rules:
1. Facts only from the material above. Never invent people, clients, figures, dates, funding or news. Unknown = leave it out.
2. Every number you write must appear in the material above. Never compute market sizes, ROI or revenue estimates.
3. lead_with: exactly 3 angles, each built on a DIFFERENT fact about the prospect (a product, a raise, a market move, a hire, a statement in the conversation…). Do NOT restate ${clientName}'s generic proof points; mention them only as the answer to the prospect fact.
4. talking_points: 7 to 9 items, each naming something specific to this prospect. No generic discovery questions.
5. events: 2-4 US events relevant to the prospect's sector. Prefer the US EVENTS SEARCH (from_search true, its dates). If none fit, name only famous recurring US events you are certain exist (e.g. for food: IFT FIRST, Natural Products Expo West; for medtech: AAMI eXchange, AORN Global Surgical Conference), with usual month and city and from_search false. Omit a field (Founded, Size…) in the snapshot when unknown.
9. events must take place AFTER TODAY and be real industry conferences or trade shows (never a webinar, a payer program or an event already past).
8. industry: exactly 2 trends — one in the prospect's home market, one in the US.
6. attention: list real gaps (missing priority/stage data, no reply since…, duplicate records, unreadable social audiences, facts to verify).
10. ${ICP_RULE}
7. Use **bold** for the key fact in a sentence. English.`;
}

export const SYSTEM = 'You are a senior B2B sales researcher at Gershon Consulting. You write precise, fact-dense call briefs. You never invent facts or figures; everything you state comes from the material provided. You answer with one JSON object only.';

// Assemble the brief JSON (render format) from the AI answer + research. Removes any sentence whose
// figure is not in the material, and records what was removed.
export function assemble({ ai, research, lead, site, domain, clientName, financials, corpusAll, how, kb, model }) {
  const removed = [];
  const clean = (t) => { const r = verifyNumbers(str(t), corpusAll); removed.push(...r.removed); return r.text; };
  const g = research.grade;
  // ICP Match Grade (2026-11-26, priority): letter computed from the criteria the AI judged.
  const icpFit = ai.icp_fit || {};
  const icpGrade = computeIcpGrade(arr(icpFit.criteria).map((c) => {
    // Evidence carrying an unsourced figure is dropped — and the criterion is then not verified.
    const e = clean(c?.evidence);
    return { ...c, evidence: e || 'not in the material', status: str(c?.evidence) && !e ? 'unknown' : c?.status };
  }), { verdict: str(icpFit.verdict), why: clean(icpFit.why), icpOnFile: !!str(kb) });
  const prospectCorpus = `${research.corpus}\n${site.text || ''}\n${lead.conversation || ''}\n${lead.notes || ''}`;

  const leadWith = arr(ai.lead_with).map((x) => ({ title: clean(x?.title), text: clean(x?.text) }))
    .filter((x) => x.title && x.text && prospectSpecific(`${x.title} ${x.text}`, prospectCorpus, kb));
  const fmtN = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US') : 'not readable');
  const unit = (c) => (c === 'YouTube' ? 'subscribers' : 'followers');
  const hist = ai.history || {};
  const historyText = [
    str(hist.said) && `**What they said:** ${clean(hist.said)}`,
    str(hist.proposed) && `**What was proposed:** ${clean(hist.proposed)}`,
    arr(hist.open_items).length && `**Open action items:** ${arr(hist.open_items).map(clean).filter(Boolean).join('; ')}`,
  ].filter(Boolean).join('\n');

  const attention = arr(ai.attention).filter((a) => a && str(a.title)).map((a) => ({ title: clean(a.title), text: clean(a.text) }));
  if (!icpGrade) attention.unshift({ title: 'ICP match not graded', text: 'The engine could not judge the lead against the ICP — check the ICP in Settings and rebuild.' });
  else if (icpGrade.provisional) attention.unshift({ title: 'ICP grade is provisional', text: 'Most ICP criteria could not be verified from public sources — confirm them on the call.' });
  if (g.provisional) attention.push({ title: 'Social grade is provisional', text: 'Some follower counts could not be read this run — check them on the company pages before quoting the grade.' });
  attention.push({ title: 'LinkedIn — to check before the call', text: `mutual connections, ${lead.leadName || 'the lead'}'s recent posts, groups and DM history (not readable without a signed-in LinkedIn session).` });
  if (removed.length) attention.push({ title: 'Figures removed', text: `The engine dropped ${removed.length} figure${removed.length > 1 ? 's' : ''} it could not source (${[...new Set(removed)].slice(0, 4).join(', ')}).` });

  const finText = [financials?.text, ...research.registry.map((r) => r.text)].filter(Boolean).join('\n\n');
  const events = arr(ai.events).filter((e) => e && str(e.name)).slice(0, 4).map((e) => ({
    name: str(e.name), when_where: str(e.when_where), note: [clean(e.note), e.from_search === false ? '(usual timing — confirm the dates)' : ''].filter(Boolean).join(' '),
  }));

  const sources = [
    { used: true, text: lead.conversation ? 'Streak: pipeline record and conversation' : 'Streak: pipeline record' },
    { used: !!site.ok, text: site.ok ? `Website: ${domain}${how ? ` (found from ${how})` : ''}` : 'Website: not found' },
    { used: research.facts > 0, text: `Web search & news (${research.provider}): ${research.about.length + research.person.length} results, ${research.news.length} news items` },
    ...research.news.slice(0, 3).map((n) => ({ used: true, text: `News: ${n.title}${n.date ? ` (${String(n.date).slice(0, 16)})` : ''} — ${n.url}` })),
    { used: research.social.length > 0, text: `Social audit: ${research.social.length ? research.social.map((s) => `${s.channel} ${fmtN(s.audience)}`).join(' · ') : 'no channel found'}` },
    ...(financials ? [{ used: true, text: `${financials.source}: company registry` }] : []),
    ...research.registry.map((r) => ({ used: true, text: `${r.source} — ${r.url}` })),
    ...(!financials && !research.registry.length ? [{ used: false, text: 'Company registries: nothing public found' }] : []),
    { used: true, text: `${clientName}: knowledge base and ICP` },
    { used: false, text: 'LinkedIn (signed-in data: mutuals, posts, DMs): not read by the engine' },
  ];

  return {
    header: {
      company: lead.company,
      person: lead.leadName,
      role: lead.leadRole,
      chips: [icpChip(icpGrade), { label: (lead.stage || 'New lead').toUpperCase(), tone: 'brand' }],
      ...(str(ai.context) ? { alert: { title: 'Where things stand.', text: clean(ai.context) } } : {}),
      source_line: [lead.leadEmail && `Email: ${lead.leadEmail}`, site.ok && `Website: ${domain}`].filter(Boolean).join(' · '),
    },
    icp_grade: icpGrade,
    grade: { letter: g.letter + (g.provisional ? '*' : ''), headline: g.headline, detail: g.detail, context: g.provisional ? '* provisional.' : '' },
    snapshot: [
      ...splitRows(arr(ai.snapshot)).filter((s) => s && str(s.label) && str(s.value) && !/^(web\s*site|domain|url)$/i.test(str(s.label)) && !/^[—–-]$/.test(str(s.value)))
        .map((s) => ({ label: str(s.label), value: clean(s.value) })).filter((s) => s.value).slice(0, 7),
      { label: 'Website', value: site.ok ? domain : 'not found — check before the call', ...(site.ok ? {} : { tone: 'warn' }) },
    ],
    lead_with: leadWith.slice(0, 4),
    person: clean(ai.person) ? { name: lead.leadName, text: clean(ai.person) } : null,
    in_common: ai.in_common?.best_match?.name || arr(ai.in_common?.items).length ? ai.in_common : null,
    company: clean(ai.company) ? { text: clean(ai.company) } : null,
    financials: finText ? { country: financials?.country || '', text: finText } : null,
    history: historyText ? { text: historyText } : null,
    hooks: arr(ai.hooks).map(clean).filter(Boolean),
    social: {
      rows: research.social.length
        ? research.social.map((s) => ({ channel: s.channel, audience: Number.isFinite(s.audience) ? `${fmtN(s.audience)} ${unit(s.channel)}` : 'not readable', recency: s.how ? `read from ${s.how}` : '—', read: s.url, ...(Number.isFinite(s.audience) ? {} : { tone: 'warn' }) }))
        : [{ channel: 'All networks', audience: 'none found', recency: '—', read: 'No social channel linked from the website or found in search.', tone: 'warn' }],
      note: `Audit run ${new Date().toISOString().slice(0, 10)} from public pages and search (${research.provider}).`,
    },
    industry: arr(ai.industry).filter((x) => x && str(x.title) && str(x.text)).map((x) => ({ title: clean(x.title), text: clean(x.text) })).filter((x) => x.text).slice(0, 3),
    talking_points: arr(ai.talking_points).map(clean).filter(Boolean).slice(0, 10),
    events,
    attention,
    sources,
    research_stats: { facts: research.facts, news: research.news.length, events_found: research.events.length, provider: research.provider, model, removed: [...new Set(removed)], ...(research.diagnostics || {}) },
  };
}

export const providerNote = (env) => searchProvider(env);
