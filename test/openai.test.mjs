// node --test test/openai.test.mjs — v1.17.0 OpenAI writer with Workers AI fallback
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasOpenAI, openaiModels, chatBody, openaiText } from '../functions/_openai.js';
import { aiJson } from '../functions/_engine.js';

test('OpenAI is used only when the secret is set', () => {
  assert.equal(hasOpenAI({}), false);
  assert.equal(hasOpenAI({ OPENAI_API_KEY: '  ' }), false);
  assert.equal(hasOpenAI({ OPENAI_API_KEY: 'sk-test' }), true);
});

test('OPENAI_MODEL goes first, defaults follow without duplicates', () => {
  assert.deepEqual(openaiModels({}), ['gpt-5', 'gpt-4.1']);
  assert.deepEqual(openaiModels({ OPENAI_MODEL: 'gpt-4.1' }), ['gpt-4.1', 'gpt-5']);
});

test('request body: reasoning models get no temperature, JSON mode on', () => {
  const a = chatBody('gpt-5', 'sys', 'hi');
  assert.equal(a.temperature, undefined);
  assert.equal(a.response_format.type, 'json_object');
  assert.equal(a.messages[0].role, 'system');
  const b = chatBody('gpt-4.1', '', 'hi', { maxTokens: 100 });
  assert.equal(b.temperature, 0.2);
  assert.equal(b.max_completion_tokens, 100);
  assert.equal(b.messages.length, 1);
});

test('openaiText falls through to the next model on an error', async () => {
  const calls = [];
  const fakeFetch = async (_url, init) => {
    const m = JSON.parse(init.body).model; calls.push(m);
    if (m === 'gpt-5') return { ok: false, status: 404, json: async () => ({ error: { message: 'no access' } }) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"company":"Acme"}' } }] }) };
  };
  const r = await openaiText({ OPENAI_API_KEY: 'sk-test' }, 's', 'u', {}, fakeFetch);
  assert.deepEqual(calls, ['gpt-5', 'gpt-4.1']);
  assert.equal(r.model, 'openai/gpt-4.1');
});

test('aiJson uses OpenAI first and never calls Workers AI when it answers', async () => {
  const env = { OPENAI_API_KEY: 'sk-test', AI: { run: async () => { throw new Error('should not be called'); } } };
  const r = await aiJson(env, 's', 'p', async () => ({ text: '{"company":"Acme","lead_with":[]}', model: 'openai/gpt-5' }));
  assert.equal(r.model, 'openai/gpt-5');
  assert.equal(r.json.company, 'Acme');
});

test('aiJson falls back to Workers AI when OpenAI fails', async () => {
  const env = { OPENAI_API_KEY: 'sk-test', AI: { run: async () => ({ response: '{"company":"Acme"}' }) } };
  const r = await aiJson(env, 's', 'p', async () => { const e = new Error('x'); e.errors = ['openai/gpt-5: 401']; throw e; });
  assert.equal(r.model, '@cf/openai/gpt-oss-120b');
});

test('aiJson without a key behaves as before (Workers AI only)', async () => {
  let called = false;
  const env = { AI: { run: async () => ({ response: '{"company":"Acme"}' }) } };
  const r = await aiJson(env, 's', 'p', async () => { called = true; return { text: '' }; });
  assert.equal(called, false);
  assert.equal(r.json.company, 'Acme');
});
