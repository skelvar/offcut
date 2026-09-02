#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const target = process.argv[2];
if (!target) throw new Error('usage: node accept.mjs <target-directory>');

const moduleUrl = pathToFileURL(path.join(path.resolve(target), 'src', 'checkout.js'));
moduleUrl.searchParams.set('accept', `${Date.now()}-${process.pid}`);
const { CheckoutService } = await import(moduleUrl.href);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

{
  let creates = 0;
  const gate = deferred();
  const service = new CheckoutService({
    create: async (cart) => {
      creates += 1;
      await gate.promise;
      return { id: `order-${creates}`, cart };
    },
  });
  const first = service.placeOrder('concurrent-key', { a: 1, b: 2 });
  const second = service.placeOrder('concurrent-key', { a: 1, b: 2 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(creates, 1, `concurrent retries created ${creates} orders`);
  gate.resolve();
  assert.deepEqual(await second, await first, 'concurrent retries returned different orders');
}

{
  let creates = 0;
  const gate = deferred();
  const service = new CheckoutService({
    create: async (cart) => {
      creates += 1;
      await gate.promise;
      return { id: 'order-conflict', cart };
    },
  });
  const original = service.placeOrder('conflict-key', { sku: 1 });
  const conflicting = service.placeOrder('conflict-key', { sku: 2 }).then(
    () => ({ resolved: true }),
    (error) => ({ error }),
  );
  gate.resolve();
  await original;
  const outcome = await conflicting;
  assert.equal(
    outcome.error?.code,
    'IDEMPOTENCY_CONFLICT',
    'different payload did not reject with IDEMPOTENCY_CONFLICT',
  );
  assert.equal(creates, 1, 'conflicting payload created another order');
}

{
  let creates = 0;
  const service = new CheckoutService({
    create: async (cart) => {
      creates += 1;
      if (creates === 1) throw new Error('transient store failure');
      return { id: 'recovered', cart };
    },
  });
  await assert.rejects(service.placeOrder('retry-key', { sku: 3 }), /transient store failure/);
  assert.equal((await service.placeOrder('retry-key', { sku: 3 })).id, 'recovered');
  assert.equal(creates, 2, 'failed attempt poisoned the idempotency key');
}

{
  let creates = 0;
  const service = new CheckoutService({
    create(cart) {
      creates += 1;
      if (creates === 1) throw new Error('synchronous store failure');
      return { id: 'sync-recovered', cart };
    },
  });
  await assert.rejects(service.placeOrder('sync-retry-key', { sku: 4 }), /synchronous store failure/);
  assert.equal((await service.placeOrder('sync-retry-key', { sku: 4 })).id, 'sync-recovered');
  assert.equal(creates, 2, 'synchronous failed attempt poisoned the idempotency key');
}

process.stdout.write('CLOSE_ACCEPT_OK\n');
