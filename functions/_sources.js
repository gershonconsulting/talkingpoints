// Read-only access to the other Gershon platforms, for Admin → Add a client (2026-10-30).
//   CRM_KV = client.gershon.ai (gershoncrm-companies KV): company:<key> records + v3:settings (client report emails)
//   ICP_KV = ICP.gershon.ai (icp-gershon-ai-store KV): report:<slug> records
// Never written to from here.

// Client numbers by client.gershon.ai company key (copy of CLIENT_REGISTRY in gershonconsulting/client src/v3-data.ts).
export const CLIENT_NUMBERS = {
  'finance-montreal': 175, 'finance-montreal-noza': 175, mabsilico: 200, wallix: 212, altavia: 229, valos: 233,
  'phitech-bioinformatics': 245, 'enzymicals-ag': 246, 'flying-secoya': 247, 'meteor-biotech': 248,
};

const emailsIn = (s) => [...new Set(String(s || '').split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))];

async function listAll(kv, prefix) {
  const keys = []; let cursor;
  do { const r = await kv.list({ prefix, cursor }); keys.push(...r.keys.map((k) => k.name)); cursor = r.list_complete ? null : r.cursor; } while (cursor);
  return keys;
}

// Companies from client.gershon.ai, with their client number, Streak pipeline and client report emails.
export async function crmCompanies(env) {
  if (!env.CRM_KV) return [];
  let settings = {};
  try { settings = JSON.parse((await env.CRM_KV.get('v3:settings')) || '{}'); } catch { /* none */ }
  const clientEmails = settings.clientEmails || {};
  const out = [];
  for (const k of await listAll(env.CRM_KV, 'company:')) {
    let c; try { c = JSON.parse(await env.CRM_KV.get(k)); } catch { continue; }
    if (!c?.name) continue;
    const key = c.key || k.slice('company:'.length);
    const no = CLIENT_NUMBERS[key] || null;
    out.push({ key, name: c.name, no, pipeline_key: c.pipelineKey || '', report_emails: no ? emailsIn(clientEmails[String(no)]) : [] });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ICP reports from ICP.gershon.ai (list only).
export async function icpReports(env) {
  if (!env.ICP_KV) return [];
  const out = [];
  for (const k of await listAll(env.ICP_KV, 'report:')) {
    let r; try { r = JSON.parse(await env.ICP_KV.get(k)); } catch { continue; }
    if (r?.slug) out.push({ slug: r.slug, company: r.company || r.slug, url: r.url || '', created_at: r.createdAt || '' });
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// One ICP report turned into the two texts the brief template uses.
// Sections (ICP app): 1 pitches, 2 problem, 3 ideal customer profiles, 4 market opportunity, 6 at a glance, 10 Sales Navigator titles.
export async function icpTexts(env, slug) {
  if (!env.ICP_KV || !slug) return null;
  let r; try { r = JSON.parse(await env.ICP_KV.get('report:' + slug)); } catch { return null; }
  if (!r) return null;
  const s = r.sections || {};
  const part = (title, n) => (s[n] ? `## ${title}\n${String(s[n]).trim()}` : '');
  const company = [part('Pitch', 1), part('Problem we solve', 2), part('At a glance', 6)].filter(Boolean).join('\n\n');
  const icp = [part('Ideal customer profiles', 3), part('Market opportunity', 4), part('Who to target (titles)', 10)].filter(Boolean).join('\n\n');
  return { slug: r.slug, company_name: r.company || '', url: r.url || '', created_at: r.createdAt || '', company: company.slice(0, 4000), icp: icp.slice(0, 4000) };
}

// Best ICP report for a client name (same words in the company name, or in the website domain).
export function matchIcp(reports, name) {
  const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const n = norm(name).replace(/\b(srl|sas|sa|ag|gmbh|inc|llc|ltd|corp|co|bioinformatics)\b/g, '').trim();
  if (!n) return null;
  const first = n.split(' ')[0];
  return reports.find((r) => norm(r.company).includes(n) || n.includes(norm(r.company)))
    || reports.find((r) => norm(r.company).split(' ')[0] === first || norm(r.url).includes(first) || norm(r.slug).includes(first)) || null;
}

export { emailsIn };
