export class CheckoutService {
  constructor(store) {
    this.store = store;
    this.completed = new Map();
  }

  async placeOrder(key, cart) {
    if (!key) throw new TypeError('idempotency key is required');

    const completed = this.completed.get(key);
    if (completed) return completed.order;

    const order = await this.store.create(structuredClone(cart));
    this.completed.set(key, {
      payload: JSON.stringify(cart),
      order,
    });
    return order;
  }
}
