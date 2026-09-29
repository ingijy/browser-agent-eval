// Adapter: next({ task: {instruction, constraints}, observation }) -> one action.
// No catalog, verifier, success_conditions, or browser access.
export class BaselineAgent {
  constructor() { this.stage = 0; this.inspected = new Set(); }
  async next({ task, observation }) {
    const c = task.constraints;
    if (this.stage++ === 0) return { action: 'open', target: '/' };
    if (observation.view === 'catalog' && !this.searched) {
      this.searched = true;
      const names = { mechanical_keyboard: '机械键盘', mouse: '鼠标', headphones: '耳机', monitor: '显示器' };
      return { action: 'search', target: names[c.category] };
    }
    if (observation.view === 'catalog' && !this.filtered) { this.filtered = true; return { action: 'filter', target: c }; }
    if (observation.view === 'catalog') {
      const candidate = observation.products.find(p => !this.inspected.has(p.id));
      return candidate ? { action: 'click_product', target: candidate.id } : { action: 'finish', target: 'No candidate found' };
    }
    if (observation.view === 'detail') {
      const p = observation.product;
      if (!this.inspected.has(p.id)) { this.inspected.add(p.id); return { action: 'inspect', target: p.id }; }
      if (p.category === c.category && p.price <= c.max_price && p.rating >= c.min_rating && p.delivery === c.delivery) {
        if (!this.added) { this.added = true; return { action: 'add_to_cart', target: p.id }; }
        return { action: 'open_cart', target: '/cart' };
      }
      return { action: 'open', target: '/' };
    }
    return { action: 'finish', target: 'Finished' };
  }
}
