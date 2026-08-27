#!/usr/bin/env node
import { acceptanceRoot, runModuleProbe } from '../../efficacy-fixture-lib.mjs';

const root = acceptanceRoot();
const cases = [
  ['invoice.paid', 'invoiceId', 'paidAt', 'customer', 'invoice-paid', 'Invoice paid'],
  ['invoice.failed', 'invoiceId', 'failedAt', 'customer', 'invoice-failed', 'Invoice failed'],
  ['user.created', 'userId', 'createdAt', 'email', 'user-created', 'User created'],
  ['user.disabled', 'userId', 'disabledAt', 'email', 'user-disabled', 'User disabled'],
  ['deploy.started', 'deploymentId', 'startedAt', 'initiator', 'deploy-started', 'Deployment started'],
  ['deploy.succeeded', 'deploymentId', 'finishedAt', 'initiator', 'deploy-succeeded', 'Deployment succeeded'],
  ['deploy.failed', 'deploymentId', 'finishedAt', 'initiator', 'deploy-failed', 'Deployment failed'],
  ['alert.opened', 'alertId', 'openedAt', 'service', 'alert-opened', 'Alert opened'],
  ['alert.closed', 'alertId', 'closedAt', 'service', 'alert-closed', 'Alert closed'],
  ['access.granted', 'grantId', 'grantedAt', 'actor', 'access-granted', 'Access granted'],
];
runModuleProbe(root, 'src/normalize-event.js', `
const cases = ${JSON.stringify(cases)};
const marker = String(process.pid % 97);
for (let index = 0; index < cases.length; index += 1) {
  const [type, idKey, atKey, actorKey, kind, summary] = cases[index];
  const id = 'v' + index + '-' + marker;
  const occurredAt = '2026-08-' + String(index + 1).padStart(2, '0') + 'T10:00:00Z';
  const actor = 'actor-' + index;
  const data = { [idKey]: id, [atKey]: occurredAt, [actorKey]: actor };
  const input = { type, data };
  const before = JSON.stringify(input);
  const actual = subject.normalizeEvent(input);
  const expected = { id, kind, occurredAt, actor, summary: summary + ': ' + id };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(type + ': ' + JSON.stringify(actual));
  if (JSON.stringify(input) !== before) throw new Error(type + ' mutated');
}
for (const bad of [{ type: 'other', data: {} }, { type: 'invoice.paid', data: { invoiceId: 'x' } }, null]) {
  let threw = false;
  try { subject.normalizeEvent(bad); } catch (error) { threw = error instanceof TypeError; }
  if (!threw) throw new Error('invalid event accepted');
}`);
process.stdout.write('ACCEPT_OK\n');
