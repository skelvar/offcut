function signature(cart) {
  return JSON.stringify(Object.entries(cart).sort(([left], [right]) => left.localeCompare(right)));
}

function conflict() {
  const error = new Error('idempotency key was already used with a different payload');
  error.code = 'IDEMPOTENCY_CONFLICT';
  return error;
}

export class CheckoutService {
  constructor(store) {
    this.store = store;
    this.attempts = new Map();
  }

  async placeOrder(key, cart) {
    if (!key) throw new TypeError('idempotency key is required');

    const payload = signature(cart);
    const existing = this.attempts.get(key);
    if (existing) {
      if (existing.payload !== payload) throw conflict();
      return existing.promise;
    }

    const promise = Promise.resolve().then(() => this.store.create(structuredClone(cart)));
    this.attempts.set(key, { payload, promise });
    try {
      return await promise;
    } catch (error) {
      if (this.attempts.get(key)?.promise === promise) this.attempts.delete(key);
      throw error;
    }
  }
}
