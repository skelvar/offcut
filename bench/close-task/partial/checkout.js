export class CheckoutService {
  constructor(store) {
    this.store = store;
    this.attempts = new Map();
  }

  async placeOrder(key, cart) {
    if (!key) throw new TypeError('idempotency key is required');
    const existing = this.attempts.get(key);
    if (existing) return existing;

    const attempt = Promise.resolve().then(() => this.store.create(structuredClone(cart)));
    this.attempts.set(key, attempt);
    try {
      return await attempt;
    } catch (error) {
      if (this.attempts.get(key) === attempt) this.attempts.delete(key);
      throw error;
    }
  }
}
