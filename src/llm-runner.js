import { run } from './runner.js';
import { LLMAgent } from './llm-agent.js';
import { ChatCompletionsAdapter, loadLocalEnv, readLLMConfig } from './llm-adapter.js';

try {
  loadLocalEnv();
  const config = readLLMConfig(); // Fail before browser startup; never substitute baseline.
  const results = await run({ createAgent: () => new LLMAgent(new ChatCompletionsAdapter(config)),
    agentName: 'llm', model: config.model });
  if (results.some(r => r.status !== 'PASS')) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
