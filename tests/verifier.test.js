import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { verify, validateTask } from '../src/verifier.js';

const products = JSON.parse(readFileSync(new URL('../data/products.json', import.meta.url), 'utf8'));
const task = JSON.parse(readFileSync(new URL('../tasks/keyboard_001.json', import.meta.url), 'utf8'));
const cart = (id, quantity = 1) => [{ product_id: id, quantity }];
test('inclusive price and rating boundaries pass', () => {
  assert.equal(verify(task, cart('product_05'), products).status, 'PASS');
});
for (const [name, state, reason] of [
  ['empty cart', [], 'cart_empty'],
  ['over budget', cart('product_02'), 'price_constraint_failed'],
  ['low rating', cart('product_03'), 'rating_constraint_failed'],
  ['wrong delivery', cart('product_04'), 'delivery_constraint_failed'],
  ['wrong category', cart('product_06'), 'category_constraint_failed'],
  ['unknown ID', cart('fabricated'), 'unknown_product'],
  ['duplicate quantity', cart('product_01', 2), 'cart_quantity_failed'],
  ['extra product', [...cart('product_01'), ...cart('product_05')], 'cart_quantity_failed'],
  ['malformed state', null, 'invalid_cart_state'],
  ['malformed row', [null], 'unknown_product'],
  ['string quantity', cart('product_01', '1'), 'cart_quantity_failed'],
]) test(name, () => {
  const result = verify(task, state, products);
  assert.equal(result.status, 'FAIL'); assert.ok(result.reasons.includes(reason));
});
test('agent-supplied product attributes cannot bypass catalog', () => {
  const forged = [{ product_id: 'product_02', quantity: 1, price: 1, rating: 5, delivery: 'next_day' }];
  assert.ok(verify(task, forged, products).reasons.includes('price_constraint_failed'));
});
test('strict numeric inequalities reject just beyond boundary', () => {
  for (const patch of [{ price: 500.01 }, { rating: 4.49 }]) {
    const p = { ...products[4], ...patch };
    assert.equal(verify(task, cart(p.id), [p]).status, 'FAIL');
  }
});
test('task mistakes fail closed instead of silently ignoring conditions', () => {
  for (const mutate of [
    t => { t.success_conditions.max_price = 600; },
    t => { t.success_conditions.unknown = true; },
    t => { t.success_conditions.cart_quantity = 0; },
    t => { t.success_conditions.min_rating = '4.5'; },
    t => { delete t.success_conditions.delivery; },
  ]) { const t = structuredClone(task); mutate(t); assert.throws(() => validateTask(t)); }
});
test('catalog schema and all checked-in tasks have real satisfying candidates', () => {
  assert.equal(new Set(products.map(p => p.id)).size, products.length);
  for (const p of products) {
    assert.match(p.id, /^product_\d+$/); assert.ok(p.name);
    assert.ok(Number.isFinite(p.price) && p.price >= 0);
    assert.ok(Number.isFinite(p.rating) && p.rating >= 0 && p.rating <= 5);
    assert.ok(['next_day', 'standard'].includes(p.delivery));
    assert.ok(p.specifications && Object.keys(p.specifications).length);
  }
  for (const file of readdirSync(new URL('../tasks/', import.meta.url))) {
    const t = validateTask(JSON.parse(readFileSync(new URL(`../tasks/${file}`, import.meta.url), 'utf8')));
    assert.equal(`${t.task_id}.json`, file);
    assert.ok(products.some(p => verify(t, cart(p.id), products).status === 'PASS'), file);
  }
});
