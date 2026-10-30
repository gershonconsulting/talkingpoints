import { json } from '../../_lib.js';
import { crmCompanies, icpReports, icpTexts, matchIcp } from '../../_sources.js';

// Owner only (enforced in functions/_middleware.js).
// GET /api/admin/sources               → client.gershon.ai companies + ICP.gershon.ai reports (for Add a client)
// GET /api/admin/sources?icp=<slug>    → that ICP report as { company, icp } texts
// GET /api/admin/sources?match=<name>  → best ICP report for a client name, as texts
export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  if (q.get('icp')) return json({ icp: await icpTexts(env, q.get('icp')) });
  const reports = await icpReports(env);
  if (q.get('match')) { const m = matchIcp(reports, q.get('match')); return json({ icp: m ? await icpTexts(env, m.slug) : null }); }
  const companies = await crmCompanies(env);
  return json({
    connected: { client: !!env.CRM_KV, icp: !!env.ICP_KV },
    companies: companies.map((c) => ({ ...c, icp_slug: matchIcp(reports, c.name)?.slug || '' })),
    icp_reports: reports,
  });
}
