import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { verify } from './verifier.js';

// Recheck recorded final state, or a clearly labeled counterfactual cart.
// This never changes evidence files, invokes a model, or controls a browser.
try {
  const [directory, flag, productId, ...extra] = process.argv.slice(2);
  if (!directory || extra.length || (flag && flag !== '--product') || (flag && !productId)) {
    throw new Error('Usage: npm run verify:run -- <run-directory> [--product product_02]');
  }
  const read = async name => JSON.parse(await readFile(path.join(directory, name), 'utf8'));
  const [task, products, saved] = await Promise.all([read('task.json'), read('products.json'), read('result.json')]);
  const cart = productId ? [{ product_id: productId, quantity: 1 }] : saved.final_cart;
  const result = verify(task, cart, products);
  console.log(JSON.stringify({ mode: productId ? 'counterfactual_cart_not_agent_run' : 'recorded_cart_state_only',
    task_id: task.task_id, cart, status: result.status, reasons: result.reasons }, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
