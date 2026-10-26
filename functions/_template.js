// The structure of a talking-points brief (the PEPperPRINT format), in display order.
// `source` says where each section's content comes from. `required` sections cannot be switched off.
export const SECTIONS = [
  { id: 'header',         label: 'Header',                            source: 'Streak lead',                    desc: 'Company, person and role, meeting time, alerts.', required: true },
  { id: 'grade',          label: 'Social network effectiveness grade', source: 'Public web',                     desc: 'A+ to D grade of the company on social networks.' },
  { id: 'snapshot',       label: 'Snapshot',                          source: 'Streak lead + public web',       desc: 'Key facts at a glance: size, HQ, stage, website.' },
  { id: 'in_common',      label: 'What you have in common',           source: 'Your LinkedIn profile + lead',   desc: 'Best person on your side to reach out, and the overlaps.' },
  { id: 'lead_with',      label: 'Lead with this',                    source: 'Your company & ICP + lead',      desc: 'The 2-3 angles to open the conversation with.' },
  { id: 'person',         label: 'The person',                        source: 'Streak contact + LinkedIn',      desc: 'Who the prospect is and their background.' },
  { id: 'company',        label: 'The company',                       source: 'Public web',                     desc: 'What the prospect company does.' },
  { id: 'financials',     label: 'Financials & ownership',            source: 'Company registries',             desc: 'Revenue, ownership — only when public data exists.' },
  { id: 'history',        label: 'Previous conversation',             source: 'Streak notes & emails',          desc: 'What was already said with this lead.' },
  { id: 'network',        label: 'Network in common',                 source: 'LinkedIn',                       desc: 'Direct connection with your team, shared connections and who could introduce you.' },
  { id: 'posts',          label: 'What they posted recently',         source: 'LinkedIn activity',              desc: 'Their recent posts and reposts, with how to use each one.' },
  { id: 'groups',         label: 'LinkedIn groups',                   source: 'LinkedIn profile',               desc: 'Groups they belong to.' },
  { id: 'events_attended',label: 'Events they attended or spoke at',  source: 'LinkedIn + public web',          desc: 'Conferences, panels and meetings they took part in.' },
  { id: 'hooks',          label: 'Worth using in the call',           source: 'All of the above',               desc: 'The few facts to drop into the conversation.' },
  { id: 'social',         label: 'LinkedIn & social intelligence',    source: 'Public web',                     desc: 'Table of channels, audience, recency.' },
  { id: 'industry',       label: 'Industry pulse',                    source: 'Public web',                     desc: 'Recent news in the prospect\'s industry.' },
  { id: 'talking_points', label: 'Suggested talking points & questions', source: 'AI from all of the above',    desc: 'Questions and points to raise.', required: true },
  { id: 'events',         label: 'Next important US events',          source: 'Public web',                     desc: 'Trade shows where you could meet.' },
  { id: 'attention',      label: 'Needs your attention',              source: 'AI checks',                      desc: 'Missing data or risks before the call.' },
  { id: 'sources',        label: 'Sources',                           source: '—',                              desc: 'What was used to build the brief.' },
];
const IDS = new Set(SECTIONS.map((s) => s.id));
const REQUIRED = new Set(SECTIONS.filter((s) => s.required).map((s) => s.id));

export async function getTemplate(env, clientId) {
  const row = await env.DB.prepare('SELECT * FROM client_templates WHERE client_id = ?').bind(clientId).first().catch(() => null);
  const disabled = String(row?.disabled || '').split(',').filter((id) => IDS.has(id) && !REQUIRED.has(id));
  return { disabled, company: row?.company || '', icp: row?.icp || '' };
}

export async function saveTemplate(env, clientId, { disabled, company, icp }) {
  const cur = await getTemplate(env, clientId);
  const d = Array.isArray(disabled) ? disabled.filter((id) => IDS.has(id) && !REQUIRED.has(id)) : cur.disabled;
  await env.DB.prepare(
    `INSERT INTO client_templates (client_id, disabled, company, icp, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(client_id) DO UPDATE SET disabled = excluded.disabled, company = excluded.company, icp = excluded.icp, updated_at = datetime('now')`
  ).bind(clientId, d.join(','), String(company ?? cur.company).slice(0, 4000), String(icp ?? cur.icp).slice(0, 4000)).run();
}

// Drop switched-off sections from a brief before rendering it.
export function applyTemplate(data, tpl) {
  if (!tpl?.disabled?.length) return data;
  const out = { ...data };
  for (const id of tpl.disabled) delete out[id];
  return out;
}
