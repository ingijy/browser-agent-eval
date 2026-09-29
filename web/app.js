const products = await fetch('/products.json').then(r => r.json());
const categories = { mechanical_keyboard: '机械键盘', mouse: '鼠标', headphones: '耳机', monitor: '显示器' };
const deliveryName = { next_day: '次日达', standard: '普通配送' };
const app = document.querySelector('#app');
const cartKey = 'shopping-benchmark-cart';
let cart = JSON.parse(localStorage.getItem(cartKey) || '[]');
const filters = { search: '', category: '', price: '', rating: '', delivery: '' };
function save() { localStorage.setItem(cartKey, JSON.stringify(cart)); document.querySelector('#cart-count').textContent = cart.reduce((n, p) => n + p.quantity, 0); }
function art(p) { return `<div class="product-art ${p.category}" aria-hidden="true"><div class="device">${p.category === 'mechanical_keyboard' ? '▦' : p.category === 'mouse' ? '◒' : p.category === 'headphones' ? '∩' : '▰'}</div><span>${categories[p.category]}</span></div>`; }
function card(p) { return `<article class="product-card" data-product-id="${p.id}">${art(p)}<div class="card-content"><span class="eyebrow">${categories[p.category]}</span><h3><a href="#/product/${p.id}">${p.name}</a></h3><p class="spec-summary">${Object.values(p.specifications).join(' · ')}</p><div class="card-meta"><strong>¥${p.price}</strong><span>★ ${p.rating.toFixed(1)}</span></div><p class="delivery">${deliveryName[p.delivery]}</p></div></article>`; }
function catalog() {
  app.innerHTML = `<section class="hero"><div><p class="eyebrow">THE EVERYDAY COLLECTION / 01</p><h1>为日常，选一件好物。</h1><p>键盘、音频与桌面装备。参数清楚，选择简单。</p></div><div class="hero-note"><strong>${products.length}</strong><span>件精选数码好物</span></div></section>
    <form id="filters"><label class="search">搜索商品<input id="search" placeholder="试试：机械键盘"></label><label>商品类别<select id="category"><option value="">全部类别</option>${Object.entries(categories).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}</select></label><label>最高价格<input id="price" type="number" min="0" placeholder="不限"></label><label>最低评分<input id="rating" type="number" min="0" max="5" step="0.1" placeholder="不限"></label><label>配送方式<select id="delivery"><option value="">全部配送</option><option value="next_day">次日达</option><option value="standard">普通配送</option></select></label><button type="submit">应用筛选</button></form><div class="section-heading"><h2>发现好物</h2><span id="results-count"></span></div><section id="products" class="grid"></section>`;
  Object.entries(filters).forEach(([key,value]) => { document.getElementById(key).value = value; });
  document.querySelector('#filters').onsubmit = e => { e.preventDefault(); Object.keys(filters).forEach(k => { filters[k] = document.getElementById(k).value; }); renderCards(); };
  renderCards();
}
function renderCards() {
  const matches = products.filter(p => (!filters.search || `${p.name} ${categories[p.category]} ${Object.values(p.specifications).join(' ')}`.includes(filters.search)) && (!filters.category || p.category === filters.category) && (!filters.price || p.price <= Number(filters.price)) && (!filters.rating || p.rating >= Number(filters.rating)) && (!filters.delivery || p.delivery === filters.delivery));
  document.querySelector('#results-count').textContent = `${matches.length} 件商品`;
  document.querySelector('#products').innerHTML = matches.map(card).join('') || '<p class="empty">没有符合筛选条件的商品。</p>';
}
function detail(id) {
  const p = products.find(p => p.id === id);
  if (!p) { app.innerHTML = '<h1>商品不存在</h1>'; return; }
  app.innerHTML = `<a class="back" href="#/">← 返回商品列表</a><section class="detail" data-product-id="${p.id}">${art(p)}<div><p class="eyebrow">${categories[p.category]}</p><h1>${p.name}</h1><p class="detail-price">¥<span data-field="price">${p.price}</span></p><dl><dt>商品类别</dt><dd data-field="category" data-value="${p.category}">${categories[p.category]}</dd><dt>用户评分</dt><dd><span data-field="rating">${p.rating}</span> / 5</dd><dt>配送服务</dt><dd data-field="delivery" data-value="${p.delivery}">${deliveryName[p.delivery]}</dd>${Object.entries(p.specifications).map(([k,v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl><button id="add-to-cart">加入购物车</button><p id="notice" role="status"></p></div></section>`;
  document.querySelector('#add-to-cart').onclick = () => { const row = cart.find(x => x.product_id === id); if (row) row.quantity++; else cart.push({ product_id: id, quantity: 1 }); save(); document.querySelector('#notice').textContent = '已加入购物车'; };
}
function cartPage() {
  const rows = cart.map(row => ({ ...row, product: products.find(p => p.id === row.product_id) }));
  app.innerHTML = `<div class="section-heading"><div><p class="eyebrow">YOUR SELECTION</p><h1>购物车</h1></div><a href="#/">继续选购 →</a></div><section class="cart-list">${rows.length ? rows.map(({product:p, quantity}) => `<article class="cart-row" data-cart-product-id="${p.id}" data-quantity="${quantity}"><div><h3>${p.name}</h3><p>${deliveryName[p.delivery]} · ★ ${p.rating}</p></div><span>数量 ${quantity}</span><strong>¥${p.price * quantity}</strong><button class="secondary" data-remove="${p.id}">移除</button></article>`).join('') : '<p class="empty">购物车还是空的，去挑选一件好物吧。</p>'}</section><div class="cart-total">合计 <strong>¥${rows.reduce((sum, r) => sum + r.product.price * r.quantity, 0)}</strong></div>`;
  document.querySelectorAll('[data-remove]').forEach(button => { button.onclick = () => { cart = cart.filter(r => r.product_id !== button.dataset.remove); save(); cartPage(); }; });
}
function render() { const route = location.hash.slice(1) || '/'; save(); if (route === '/cart') cartPage(); else if (route.startsWith('/product/')) detail(route.split('/')[2]); else catalog(); }
window.addEventListener('hashchange', render);
render();
