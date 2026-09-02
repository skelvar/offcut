import assert from 'node:assert/strict';
import test from 'node:test';
import { CheckoutService } from '../src/checkout.js';

test('a completed retry returns the original order', async () => {
  let creates = 0;
  const service = new CheckoutService({
    async create(cart) {
      creates += 1;
      return { id: `order-${creates}`, cart };
    },
  });

  const first = await service.placeOrder('checkout-1', { sku: 2 });
  const retry = await service.placeOrder('checkout-1', { sku: 2 });
  assert.deepEqual(retry, first);
  assert.equal(creates, 1);
});

test('a failed creation can be retried', async () => {
  let creates = 0;
  const service = new CheckoutService({
    async create(cart) {
      creates += 1;
      if (creates === 1) throw new Error('database unavailable');
      return { id: 'recovered', cart };
    },
  });

  await assert.rejects(service.placeOrder('checkout-2', { sku: 1 }), /database unavailable/);
  assert.equal((await service.placeOrder('checkout-2', { sku: 1 })).id, 'recovered');
  assert.equal(creates, 2);
});
