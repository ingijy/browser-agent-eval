export async function observe(page) {
  if (page.url() === 'about:blank') return { view: 'blank' };
  return page.evaluate(() => {
    const d = document.querySelector('.detail');
    if (d) return { view: 'detail', product: {
      id: d.dataset.productId, name: d.querySelector('h1').textContent,
      category: d.querySelector('[data-field="category"]').dataset.value,
      price: Number(d.querySelector('[data-field="price"]').textContent),
      rating: Number(d.querySelector('[data-field="rating"]').textContent),
      delivery: d.querySelector('[data-field="delivery"]').dataset.value,
      specifications: d.querySelector('dl').innerText,
    } };
    if (location.hash === '#/cart') return { view: 'cart', cart: Array.from(document.querySelectorAll('[data-cart-product-id]'), row => ({ product_id: row.dataset.cartProductId, quantity: Number(row.dataset.quantity), text: row.innerText })) };
    return { view: 'catalog', filters: Object.fromEntries(['search', 'category', 'price', 'rating', 'delivery'].map(id => [id, document.getElementById(id).value])), products: Array.from(document.querySelectorAll('.product-card'), card => ({ id: card.dataset.productId, text: card.innerText })) };
  });
}
export async function act(page, url, { action, target }) {
  switch (action) {
    case 'open':
      if (target !== '/') throw new Error('unsupported_navigation');
      await page.goto(url); await page.locator('#filters').waitFor(); break;
    case 'search':
      await page.getByLabel('搜索商品').fill(target);
      await page.getByRole('button', { name: '应用筛选' }).click(); break;
    case 'filter':
      await page.getByLabel('商品类别').selectOption(target.category);
      await page.getByLabel('最高价格').fill(String(target.max_price));
      await page.getByLabel('最低评分').fill(String(target.min_rating));
      await page.getByLabel('配送方式').selectOption(target.delivery);
      await page.getByRole('button', { name: '应用筛选' }).click(); break;
    case 'click_product':
      if (!/^product_\d+$/.test(target)) throw new Error('invalid_product_target');
      await page.locator(`[data-product-id="${target}"] a`).click();
      await page.locator('.detail').waitFor(); break;
    case 'inspect':
      if ((await observe(page)).product?.id !== target) throw new Error('wrong_detail_page'); break;
    case 'add_to_cart':
      if ((await observe(page)).product?.id !== target) throw new Error('wrong_detail_page');
      await page.getByRole('button', { name: '加入购物车', exact: true }).click();
      await page.getByRole('status').filter({ hasText: '已加入购物车' }).waitFor(); break;
    case 'open_cart':
      await page.locator('nav a[href="#/cart"]').click(); await page.locator('.cart-list').waitFor(); break;
    case 'go_back':
      await page.locator('nav a[href="#/"]').click(); await page.locator('#filters').waitFor(); break;
    case 'remove_from_cart':
      if (!/^product_\d+$/.test(target)) throw new Error('invalid_product_target');
      await page.locator(`[data-remove="${target}"]`).click(); break;
    case 'finish': break;
    default: throw new Error(`unsupported_action:${action}`);
  }
}
