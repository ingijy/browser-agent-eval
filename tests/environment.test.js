import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { startServer, ROOT } from '../src/server.js';
import { observe, act } from '../src/browser.js';
import { verify } from '../src/verifier.js';
import path from 'node:path';

test('browser data consistency, filter, cart persistence, and genuine failing final state', async () => {
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const products = JSON.parse(await readFile(path.join(ROOT, 'data/products.json'), 'utf8'));
    const task = JSON.parse(await readFile(path.join(ROOT, 'tasks/keyboard_001.json'), 'utf8'));
    await act(page, url, { action: 'open', target: '/' });
    assert.equal((await observe(page)).products.length, products.length);
    for (const expected of products) {
      await act(page, url, { action: 'click_product', target: expected.id });
      const { product } = await observe(page);
      for (const key of ['id', 'name', 'category', 'price', 'rating', 'delivery']) assert.equal(product[key], expected[key], `${expected.id}.${key}`);
      for (const value of Object.values(expected.specifications)) assert.ok(product.specifications.includes(value));
      await act(page, url, { action: 'go_back', target: '/' });
    }
    await act(page, url, { action: 'search', target: '机械键盘' });
    await act(page, url, { action: 'filter', target: task.constraints });
    assert.deepEqual((await observe(page)).products.map(p => p.id), ['product_01', 'product_05']);
    await act(page, url, { action: 'search', target: '不存在的商品' });
    assert.equal((await observe(page)).products.length, 0);
    await page.reload(); // filters intentionally reset on full reload
    await page.locator('#filters').waitFor();
    await act(page, url, { action: 'click_product', target: 'product_02' });
    await act(page, url, { action: 'add_to_cart', target: 'product_02' });
    await act(page, url, { action: 'open_cart', target: '/cart' });
    await page.reload(); await page.locator('.cart-list').waitFor();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('shopping-benchmark-cart')));
    assert.deepEqual((await observe(page)).cart.map(({ product_id, quantity }) => ({ product_id, quantity })), stored);
    assert.deepEqual(verify(task, stored, products).reasons, ['price_constraint_failed']);
    await act(page, url, { action: 'remove_from_cart', target: 'product_02' });
    assert.deepEqual((await observe(page)).cart, []);
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.goto(`${url}/#/cart`); await freshPage.locator('.cart-list').waitFor();
    assert.deepEqual((await observe(freshPage)).cart, []);
    assert.deepEqual(errors, []);
    await freshContext.close(); await context.close();
  } finally { await browser?.close(); server.close(); }
});
