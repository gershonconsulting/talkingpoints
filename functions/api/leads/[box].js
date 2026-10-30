import { currentUser, json, rowToBrief } from '../../_lib.js';
import { buildDraft, clientForPipeline } from '../../_brief.js';
import { renderBrief } from '../../_render.js';
import { getTemplate, applyTemplate } from '../../_template.js';

// GET  /api/leads/:box → stored brief + rendered HTML
// POST /api/leads/:box → build a draft now (no email)
export async function onRequestGet({ request, env, params }) {
  const box = decodeURIComponent(params.box);
  const u = await currentUser(env, request);
  if (!u) return json({ error: 'signed_out' }, 401);
  const row = rowToBrief(await env.DB.prepare('SELECT * FROM briefs WHERE box_key = ? AND client_id = ?').bind(box, u.client_id).first());
  const tpl = await getTemplate(env, u.client_id);
  return json({ brief: row ? { ...row, html: renderBrief(applyTemplate(row.data, tpl)) } : null });
}

export async function onRequestPost({ request, env, params }) {
  const box = decodeURIComponent(params.box);
  const u = await currentUser(env, request);
  if (!u) return json({ error: 'signed_out' }, 401);
  const client = await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(u.client_id).first();
  try {
    let brief;
    try {
      brief = await buildDraft(env, client, box);
    } catch (e) {
      if (e.code !== 'wrong_client') throw e;
      // The lead is not in this campaign's pipeline (e.g. the campaign was switched in another tab).
      // Never brief it for the wrong client.
      const owner = await clientForPipeline(env, e.pipelineKey);
      return json({ error: 'wrong_client', owner: owner ? { id: owner.id, name: owner.name } : null,
        detail: owner ? `This lead belongs to ${owner.name}. Switch to that campaign and create the draft there.` : 'This lead is not in this campaign\'s pipeline.' }, 409);
    }
    if (!brief || brief.client_id !== u.client_id) return json({ error: 'not_found' }, 404);
    const tpl = await getTemplate(env, u.client_id);
    return json({ brief: { ...brief, html: renderBrief(applyTemplate(brief.data, tpl)) } });
  } catch (e) {
    return json({ error: 'generate_failed', detail: String(e.message || e) }, 502);
  }
}
