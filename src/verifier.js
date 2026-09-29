export function validateTask(task) {
  const keys = ['category', 'max_price', 'min_rating', 'delivery'];
  if (!task || !/^[a-z0-9_]+$/.test(task.task_id) || typeof task.instruction !== 'string' || !task.instruction.trim()) throw new Error('invalid_task');
  const c = task.success_conditions;
  if (!c || !task.constraints || Object.keys(c).some(k => ![...keys, 'cart_quantity'].includes(k)) || Object.keys(task.constraints).some(k => !keys.includes(k))) throw new Error('unsupported_conditions');
  if (!['mechanical_keyboard', 'mouse', 'headphones', 'monitor'].includes(c.category) || !Number.isFinite(c.max_price) || c.max_price < 0 || !Number.isFinite(c.min_rating) || c.min_rating < 0 || c.min_rating > 5 || !['next_day', 'standard'].includes(c.delivery) || c.cart_quantity !== 1) throw new Error('invalid_conditions');
  if (keys.some(key => c[key] !== task.constraints[key])) throw new Error('task_conditions_mismatch');
  return task;
}

// Trusted catalog + observed cart IDs; never trust agent-reported attributes.
export function verify(task, cart, products) {
  validateTask(task);
  const reasons = [];
  if (!Array.isArray(cart)) return { status: 'FAIL', reasons: ['invalid_cart_state'], products: [] };
  if (cart.length === 0) reasons.push('cart_empty');
  if (cart.length !== 1 || cart.some(row => !row || row.quantity !== 1)) reasons.push('cart_quantity_failed');
  const selected = [];
  const c = task.success_conditions;
  for (const row of cart) {
    const p = products.find(p => p.id === row?.product_id);
    if (!p) { reasons.push('unknown_product'); continue; }
    selected.push(p);
    if (p.category !== c.category) reasons.push('category_constraint_failed');
    if (!Number.isFinite(p.price) || p.price > c.max_price) reasons.push('price_constraint_failed');
    if (!Number.isFinite(p.rating) || p.rating < c.min_rating) reasons.push('rating_constraint_failed');
    if (p.delivery !== c.delivery) reasons.push('delivery_constraint_failed');
  }
  return { status: reasons.length ? 'FAIL' : 'PASS', reasons: [...new Set(reasons)], products: selected };
}
