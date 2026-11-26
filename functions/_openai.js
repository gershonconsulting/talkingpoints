// OpenAI writer (v1.17.0). Used first when the OPENAI_API_KEY secret is set on the Pages project;
// every caller falls back to Workers AI when the key is missing or OpenAI fails.
// Model: OPENAI_MODEL (text variable, optional) or the defaults below, tried in order.

export const OPENAI_MODELS = ['gpt-5', 'gpt-4.1'];

export const hasOpenAI = (env) => typeof env?.OPENAI_API_KEY === 'string' && env.OPENAI_API_KEY.trim().length > 0;

export function openaiModels(env) {
  const custom = String(env?.OPENAI_MODEL || '').trim();
  return custom ? [custom, ...OPENAI_MODELS.filter((m) => m !== custom)] : OPENAI_MODELS;
}

// Body for the Chat Completions API. gpt-5 / o-series reject a custom temperature and use
// max_completion_tokens; older models take temperature.
export function chatBody(model, system, user, { maxTokens = 6000, json = true, temperature = 0.2 } = {}) {
  const reasoning = /^(gpt-5|o\d)/.test(model);
  const body = {
    model,
    messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: user }],
    max_completion_tokens: reasoning ? maxTokens + 4000 : maxTokens,
  };
  if (json) body.response_format = { type: 'json_object' };
  if (!reasoning) body.temperature = temperature;
  return body;
}

// Returns { text, model } or throws with every model's error.
export async function openaiText(env, system, user, opts = {}, fetchImpl = fetch) {
  const errors = [];
  for (const model of openaiModels(env)) {
    try {
      const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.OPENAI_API_KEY.trim()}`, 'content-type': 'application/json' },
        body: JSON.stringify(chatBody(model, system, user, opts)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { errors.push(`openai/${model}: ${res.status} ${data?.error?.message || ''}`.trim()); continue; }
      const text = data?.choices?.[0]?.message?.content || '';
      if (text) return { text, model: `openai/${model}` };
      errors.push(`openai/${model}: empty answer`);
    } catch (e) { errors.push(`openai/${model}: ${e.message || e}`); }
  }
  const err = new Error(errors.join(' | '));
  err.errors = errors;
  throw err;
}
