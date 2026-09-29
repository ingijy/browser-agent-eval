import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, startServer } from './server.js';
import { validateTask, verify } from './verifier.js';
import { BaselineAgent } from './baseline.js';
import { act, observe } from './browser.js';

export async function run({ args = process.argv.slice(2), createAgent = () => new BaselineAgent(), agentName = 'rule-based-baseline', model = null } = {}) {
  const budgetArg = args.find(a => a.startsWith('--max-steps='));
  const maxSteps = budgetArg ? Number(budgetArg.split('=')[1]) : 20;
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 20) throw new Error('max_steps_must_be_1_to_20');
  if (args.some(a => a.startsWith('--') && !['--all', '--edge', '--headed'].includes(a) && a !== budgetArg)) throw new Error('unknown_option');
  const taskArg = args.find(a => !a.startsWith('--')) || 'keyboard_001';
  if (!/^[a-z0-9_]+$/.test(taskArg)) throw new Error('Invalid task ID');
  const ids = args.includes('--all') ? (await readdir(path.join(ROOT, 'tasks'))).filter(f => f.endsWith('.json')).sort().map(f => f.slice(0, -5)) : [taskArg];
  const { server, url } = await startServer();
  const results = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: !args.includes('--headed'), ...(args.includes('--edge') ? { channel: 'msedge' } : {}) });
    for (const taskId of ids) {
      const task = validateTask(JSON.parse(await readFile(path.join(ROOT, 'tasks', `${taskId}.json`), 'utf8')));
      const catalogText = await readFile(path.join(ROOT, 'data/products.json'), 'utf8');
      const products = JSON.parse(catalogText);
      const directory = path.join(ROOT, 'runs', `${taskId}_${agentName}_${new Date().toISOString().replace(/[:.]/g, '-')}`);
      await mkdir(directory, { recursive: true });
      const context = await browser.newContext({ viewport: { width: 1365, height: 960 } });
      const page = await context.newPage(); page.setDefaultTimeout(8000);
      const trajectory = [], errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const agent = createAgent();
      let finished = false, runtimeError = null, finalCart = null, visibleCart = null;
      try {
        for (let step = 1; step <= maxSteps; step++) {
          const observation = await observe(page);
          const history = trajectory.map(({ step, action, target, reasoning_summary, result, error }) => ({ step, action, target, reasoning_summary, result, error }));
          const entry = { step, timestamp: new Date().toISOString(), observation, reasoning_summary: null, action: null, target: null, arguments: null, result: null };
          trajectory.push(entry);
          try {
            const taskInput = agentName === 'llm' ? { instruction: task.instruction } : { instruction: task.instruction, constraints: task.constraints };
            const decision = await agent.next({ task: structuredClone(taskInput), observation: structuredClone(observation), history: structuredClone(history), remaining_steps: maxSteps - step + 1 });
            Object.assign(entry, decision);
            entry.arguments = { target: structuredClone(decision.target) };
            try { await act(page, url, decision); }
            catch (error) {
              entry.error = error.message;
              if (agentName !== 'llm') throw error;
            }
            entry.result = await observe(page);
            entry.screenshot = `${String(step).padStart(2, '0')}.png`;
            await page.screenshot({ path: path.join(directory, entry.screenshot), fullPage: true });
          } catch (error) {
            entry.error = error.message;
            if (error.model_call) entry.model_call = error.model_call;
            if (error.decision_shape) entry.decision_shape = error.decision_shape;
            throw error;
          }
          finally { await writeFile(path.join(directory, 'trajectory.json'), JSON.stringify(trajectory, null, 2)); }
          if (entry.action === 'finish') { finished = true; break; }
        }
        if (!finished) throw new Error('step_limit_exceeded');
      } catch (error) { runtimeError = error.message; }
      // Harness inspection after agent execution; not counted as agent actions.
      try {
        finalCart = page.url() === 'about:blank' ? [] : await page.evaluate(() => JSON.parse(localStorage.getItem('shopping-benchmark-cart') || '[]'));
        await page.goto(`${url}/#/cart`); await page.locator('.cart-list').waitFor();
        visibleCart = (await observe(page)).cart.map(({ product_id, quantity }) => ({ product_id, quantity }));
      } catch (error) { runtimeError ||= `state_read_failed:${error.message}`; }
      const verdict = verify(task, finalCart, products);
      if (JSON.stringify(finalCart) !== JSON.stringify(visibleCart)) verdict.reasons.push('cart_ui_state_mismatch');
      if (runtimeError) verdict.reasons.push('runner_error');
      if (errors.length) verdict.reasons.push('environment_error');
      verdict.status = verdict.reasons.length ? 'FAIL' : 'PASS';
      const result = { task_id: taskId, agent: agentName, model, status: verdict.status, max_steps: maxSteps,
        reasons: verdict.reasons, steps: trajectory.length, final_products: verdict.products.map(p => p.id),
        final_cart: finalCart, visible_cart: visibleCart, runtime_error: runtimeError, page_errors: errors,
        catalog_sha256: createHash('sha256').update(catalogText).digest('hex'),
        trajectory: 'trajectory.json', timestamp: new Date().toISOString() };
      await Promise.all([
        writeFile(path.join(directory, 'trajectory.json'), JSON.stringify(trajectory, null, 2)),
        writeFile(path.join(directory, 'result.json'), JSON.stringify(result, null, 2)),
        writeFile(path.join(directory, 'task.json'), JSON.stringify(task, null, 2)),
        writeFile(path.join(directory, 'products.json'), catalogText),
      ]);
      console.log(`Task: ${taskId}\nResult: ${result.status}\nReasons: ${result.reasons.join(', ') || 'none'}\nSteps: ${result.steps}\nFinal product: ${result.final_products.join(', ') || 'none'}\nTrajectory: ${path.relative(ROOT, directory)}/trajectory.json\n`);
      if (runtimeError) console.error(`Run error: ${runtimeError}`);
      results.push({ ...result, directory });
      await context.close();
    }
  } finally { await browser?.close(); server.close(); }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const results = await run();
    if (results.some(r => r.status !== 'PASS')) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
