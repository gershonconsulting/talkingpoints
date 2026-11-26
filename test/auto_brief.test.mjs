// node --test test/auto_brief.test.mjs — Cloudflare AI talking point for a new Streak lead (v1.13.0)
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAutoBrief } from '../functions/_auto.js';
import { renderBrief } from '../functions/_render.js';

const PIPE = 'pipeline:owner:123';
function setup() {
  const saved = [];
  const DB = { prepare: (sql) => {
    const b = (...a) => ({
      async first() {
        if (/FROM briefs WHERE box_key/.test(sql)) return saved.length ? { ...saved.at(-1), data: JSON.stringify(saved.at(-1).data) } : null;
        if (/client_templates/.test(sql)) return { company: 'Acme sells lab robots', icp: 'US pharma, 200+ staff' };
        return null;
      },
      async all() { return { results: [{ name: 'Dmitri', title: 'CEO', background: 'ex-Pfizer' }] }; },
      async run() { if (/INSERT INTO briefs/.test(sql)) saved.push({ client_id: a[0], box_key: a[1], company: a[2], lead_name: a[3], lead_role: a[4], stage: a[5], status: a[6], data: JSON.parse(a[7]) }); return {}; },
    });
    return { bind: b, ...b() };
  } };
  const prompts = [];
  const env = { STREAK_API_KEY: 'k', DB, AI: { run: async (m, a) => { const text = a.input || a.messages.at(-1).content; if (/In 3 to 6 words/.test(text)) return { response: 'clinical assays' }; prompts.push(text); return { response: JSON.stringify({
    company_name: 'Bio Inc', person: { name: 'Jane Doe', role: '', text: 'Head of ops.' }, snapshot: [{ label: 'Industry', value: 'Biotech' }],
    company: 'Bio Inc makes assays.', icp_fit: { verdict: 'Strong fit', why: 'US pharma.' }, lead_with: [{ title: 'Automation', text: 'They scale.' }],
    hooks: ['New site in Boston'], talking_points: ['How do you scale?'], attention: [] }) }; } } };
  globalThis.fetch = async (url) => {
    const u = String(url);
    const j = (o) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });
    if (u.includes('/v1/boxes/BOX')) return j({ pipelineKey: PIPE, stageKey: 's1', name: 'Bio Inc', notes: 'Replied yes', contacts: [{ key: 'c1' }] });
    if (u.includes('/v1/pipelines/')) return j({ stages: { s1: { name: 'Engaged' } }, fields: [] });
    if (u.includes('/v2/contacts/')) return j({ givenName: 'Jane', familyName: 'Doe', title: 'VP Operations', emailAddresses: ['jane@bioinc.com'] });
    if (u.includes('bioinc.com')) { const r = new Response('<html><title>Bio Inc</title><body>Assays for pharma</body></html>', { headers: { 'content-type': 'text/html' } }); Object.defineProperty(r, 'url', { value: u }); return r; }
    return new Response('', { status: 404 });
  };
  return { env, saved, prompts };
}
const client = { id: 7, slug: 'valos', name: '#233 Valos (Dmitri)', pipeline_key: PIPE };

test('builds a ready talking point in the brief format from Streak + website + ICP', async () => {
  const { env, saved, prompts } = setup();
  const brief = await buildAutoBrief(env, client, 'BOX');
  assert.equal(saved[0].status, 'ready');
  assert.equal(brief.data.header.company, 'Bio Inc');
  assert.equal(brief.data.header.person, 'Jane Doe');
  assert.equal(brief.data.header.role, 'VP Operations');
  assert.ok(brief.data.auto);
  assert.equal(brief.data.engine, 'research-v2');
  assert.ok(brief.data.grade.letter);                  // grade is always there (D when nothing is found)
  assert.ok(!brief.data.attention.some((a) => a.title === 'Quick talking point'));
  assert.match(prompts[0], /US pharma, 200\+ staff/);   // client ICP
  assert.match(prompts[0], /Assays for pharma/);        // lead website
  assert.match(prompts[0], /CRM STAGE: Engaged/);       // Streak record
  assert.match(prompts[0], /Replied yes/);              // Streak notes
  assert.match(prompts[0], /=== RESEARCH/);             // research pass fed to the writer
  assert.ok(renderBrief(brief.data).length > 500);
});

test('refuses a lead from another client pipeline', async () => {
  const { env, saved } = setup();
  await assert.rejects(buildAutoBrief(env, { ...client, pipeline_key: 'pipeline:owner:999' }, 'BOX'), /wrong_client/);
  assert.equal(saved.length, 0);
});

test('test mode writes nothing to D1', async () => {
  const { env, saved } = setup();
  const brief = await buildAutoBrief(env, client, 'BOX', { save: false });
  assert.equal(saved.length, 0);
  assert.equal(brief.status, 'test');
  assert.equal(brief.data.header.person, 'Jane Doe');
});

test('feeds the Streak conversation and the client knowledge base to the engine, and adds a quality check', async () => {
  const { env, prompts } = setup();
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/v1/boxes/BOX/comments')) return new Response(JSON.stringify([{ creatorName: 'Juliana R', timestamp: 1795016215872, message: 'She asked for a one-pager' }]), { headers: { 'content-type': 'application/json' } });
    return orig(url);
  };
  const brief = await buildAutoBrief(env, client, 'BOX');
  assert.match(prompts[0], /She asked for a one-pager/);
  assert.match(prompts[0], /knowledge base/);
  assert.match(prompts[0], /Acme sells lab robots/);
  assert.equal(typeof brief.data.quality.ok, 'boolean');
  assert.equal(brief.data.quality.ok, false); // mock AI returns only 1 angle and 1 question
});
