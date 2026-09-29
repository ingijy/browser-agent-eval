// Transport only. No browser access, shopping rules, or fallback policy.
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

export function readLLMConfig(env = process.env) {
  const apiKey = env.LLM_API_KEY || env.OPENAI_API_KEY;
  if (!apiKey?.trim()) throw new Error('missing_api_key: Copy .env.example to .env and set LLM_API_KEY locally. Never paste a key into chat. No baseline fallback.');
  const model = env.LLM_MODEL?.trim();
  if (!model) throw new Error('missing_model: Set LLM_MODEL in .env to a model available from your provider.');
  let base;
  try { base = new URL(env.LLM_BASE_URL || 'https://api.openai.com/v1'); }
  catch { throw new Error('invalid_base_url'); }
  if (base.username || base.password || base.search || base.hash || !['https:', 'http:'].includes(base.protocol)) throw new Error('invalid_base_url');
  if (base.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('https_required_for_remote_api');
  if (env.LLM_ENABLE_THINKING && !['true', 'false'].includes(env.LLM_ENABLE_THINKING)) throw new Error('invalid_enable_thinking');
  return { apiKey, model, baseURL: base.href.replace(/\/$/, ''),
    ...(env.LLM_ENABLE_THINKING ? { enableThinking: env.LLM_ENABLE_THINKING === 'true' } : {}) };
}

export function loadLocalEnv() {
  const file = fileURLToPath(new URL('../.env', import.meta.url));
  if (existsSync(file)) loadEnvFile(file);
}

export class ChatCompletionsAdapter {
  constructor(config, fetchImpl = fetch) { this.config = config; this.fetch = fetchImpl; }
  async decide(messages) {
    let response, payload;
    const started = Date.now();
    try {
      response = await this.fetch(`${this.config.baseURL}/chat/completions`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
        headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.config.model, messages, response_format: { type: 'json_object' }, stream: false,
          ...(this.config.enableThinking !== undefined ? { enable_thinking: this.config.enableThinking } : {}) }),
      });
      // Never log raw provider errors: they can echo credentials or request bodies.
      if (!response.ok) throw new Error(`llm_http_${response.status}`);
      payload = await response.json();
    } catch (error) {
      if (/^llm_http_\d+$/.test(error.message)) throw error;
      throw new Error(error.name === 'TimeoutError' ? 'llm_timeout' : 'llm_transport_error');
    }
    const choice = payload.choices?.[0];
    if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string') throw new Error('llm_incomplete_or_refused_response');
    let decision;
    try { decision = JSON.parse(choice.message.content); }
    catch { throw new Error('llm_invalid_json'); }
    // Explicitly discard reasoning_content and all other provider-specific fields.
    return { decision, metadata: { model: this.config.model, latency_ms: Date.now() - started,
      usage: { prompt_tokens: payload.usage?.prompt_tokens ?? null, completion_tokens: payload.usage?.completion_tokens ?? null } } };
  }
}
