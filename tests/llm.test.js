import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatCompletionsAdapter, readLLMConfig } from '../src/llm-adapter.js';
import { LLMAgent, validateDecision } from '../src/llm-agent.js';

const config = { apiKey: 'TEST_ONLY_NOT_A_REAL_KEY', model: 'test-model', baseURL: 'https://example.invalid/v1', enableThinking: false };
test('transport sends instruction, current observation and history; strips hidden reasoning', async () => {
  let request;
  const adapter = new ChatCompletionsAdapter(config, async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: {
      content: JSON.stringify({ action: 'finish', target: '', reasoning_summary: 'The cart now contains the selected item.' }),
      reasoning_content: 'HIDDEN_TEST_SENTINEL',
    } }], usage: { prompt_tokens: 20, completion_tokens: 10 } }) };
  });
  const agent = new LLMAgent(adapter);
  const history = [{ action: 'add_to_cart', target: 'product_01', result: { view: 'detail' } }];
  const decision = await agent.next({ task: { instruction: 'Find a keyboard.', success_conditions: 'PRIVATE_TEST_SENTINEL' },
    observation: { view: 'cart', cart: [{ product_id: 'product_01', quantity: 1 }] }, history, remaining_steps: 10 });
  const sent = JSON.parse(request.body.messages[1].content);
  assert.deepEqual(sent.history, history);
  assert.equal(sent.observation.view, 'cart');
  assert.equal(sent.instruction, 'Find a keyboard.');
  assert.equal(request.url, 'https://example.invalid/v1/chat/completions');
  assert.equal(request.body.enable_thinking, false);
  assert.equal(request.body.response_format.type, 'json_object');
  assert.ok(!JSON.stringify(request.body).includes('PRIVATE_TEST_SENTINEL'));
  assert.ok(!JSON.stringify(decision).includes('HIDDEN_TEST_SENTINEL'));
  assert.equal(decision.action, 'finish');
});

test('invalid actions cannot access JS, arbitrary URLs, invisible IDs, or wrong-page controls', () => {
  const observation = { view: 'catalog', products: [{ id: 'product_01' }] };
  for (const d of [
    { action: 'evaluate', target: 'localStorage.clear()' },
    { action: 'open', target: 'https://example.com' },
    { action: 'click_product', target: 'product_99' },
    { action: 'add_to_cart', target: 'product_01' },
    { action: 'search', target: {} },
  ]) assert.throws(() => validateDecision({ ...d, reasoning_summary: 'test' }, observation), /invalid_llm_action/);
  assert.equal(validateDecision({ action: 'click_product', target: 'product_01', reasoning_summary: 'Check this candidate.' }, observation).action, 'click_product');
});

test('missing credentials/model stop explicitly; provider failures never become baseline decisions', async () => {
  assert.throws(() => readLLMConfig({}), /missing_api_key/);
  assert.throws(() => readLLMConfig({ LLM_API_KEY: 'test' }), /missing_model/);
  const failed = new ChatCompletionsAdapter(config, async () => ({ ok: false, status: 401 }));
  await assert.rejects(failed.decide([]), /^Error: llm_http_401$/);
  for (const [content, reason, expected] of [['not JSON', 'stop', /llm_invalid_json/], ['{}', 'length', /llm_incomplete/]]) {
    const adapter = new ChatCompletionsAdapter(config, async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: reason, message: { content } }] }) }));
    await assert.rejects(adapter.decide([]), expected);
  }
});
