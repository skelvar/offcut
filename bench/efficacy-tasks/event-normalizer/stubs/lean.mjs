#!/usr/bin/env node
import { applyStub } from '../../../efficacy-fixture-lib.mjs';

const operations = [
  {
    "tool_name": "Write",
    "tool_input": {
      "file_path": "src/normalize-event.js",
      "content": "const variants = {\n  'invoice.paid': ['invoiceId', 'paidAt', 'customer', 'invoice-paid', 'Invoice paid'],\n  'invoice.failed': ['invoiceId', 'failedAt', 'customer', 'invoice-failed', 'Invoice failed'],\n  'user.created': ['userId', 'createdAt', 'email', 'user-created', 'User created'],\n  'user.disabled': ['userId', 'disabledAt', 'email', 'user-disabled', 'User disabled'],\n  'deploy.started': ['deploymentId', 'startedAt', 'initiator', 'deploy-started', 'Deployment started'],\n  'deploy.succeeded': ['deploymentId', 'finishedAt', 'initiator', 'deploy-succeeded', 'Deployment succeeded'],\n  'deploy.failed': ['deploymentId', 'finishedAt', 'initiator', 'deploy-failed', 'Deployment failed'],\n  'alert.opened': ['alertId', 'openedAt', 'service', 'alert-opened', 'Alert opened'],\n  'alert.closed': ['alertId', 'closedAt', 'service', 'alert-closed', 'Alert closed'],\n  'access.granted': ['grantId', 'grantedAt', 'actor', 'access-granted', 'Access granted'],\n};\n\nexport function normalizeEvent(event) {\n  const variant = variants[event?.type];\n  const data = event?.data;\n  if (!variant || !data) throw new TypeError('unknown or incomplete event');\n  const [idKey, atKey, actorKey, kind, summary] = variant;\n  const [id, occurredAt, actor] = [data[idKey], data[atKey], data[actorKey]];\n  if (![id, occurredAt, actor].every((value) => typeof value === 'string' && value)) {\n    throw new TypeError('unknown or incomplete event');\n  }\n  return { id, kind, occurredAt, actor, summary: summary + ': ' + id };\n}\n"
    }
  }
];
applyStub(process.argv, operations);
