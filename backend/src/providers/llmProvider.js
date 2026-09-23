import { env } from '../config/env.js';
import { fetchJson } from './http.js';

/**
 * LLMProvider interface: { name, isLive, generate({ system, prompt, maxTokens }) → string }
 * The LLM is only used to rephrase/translate facts and approved recommendations produced
 * by the backend. It never decides farming actions. If no key is configured (or a call fails),
 * callers fall back to deterministic templates.
 */
export class TemplateLLMProvider {
  name = 'template';
  isLive = false;
  async generate() { return null; } // signals "use deterministic template"
}

export class AnthropicLLMProvider {
  name = 'anthropic';
  isLive = true;
  constructor(apiKey, model) { this.apiKey = apiKey; this.model = model || 'claude-sonnet-5'; }
  async generate({ system, prompt, maxTokens = 400 }) {
    const d = await fetchJson('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      timeoutMs: 20000,
      headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: this.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }),
    });
    return (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim() || null;
  }
}

export class OpenAILLMProvider {
  name = 'openai';
  isLive = true;
  constructor(apiKey, model) { this.apiKey = apiKey; this.model = model || 'gpt-4o-mini'; }
  async generate({ system, prompt, maxTokens = 400 }) {
    const d = await fetchJson('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      timeoutMs: 20000,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
    });
    return d.choices?.[0]?.message?.content?.trim() || null;
  }
}

export function createLLMProvider(config = env) {
  const { provider, apiKey, model } = config.llm;
  if (!apiKey) return new TemplateLLMProvider();
  if (provider === 'anthropic') return new AnthropicLLMProvider(apiKey, model);
  if (provider === 'openai') return new OpenAILLMProvider(apiKey, model);
  return new TemplateLLMProvider();
}
