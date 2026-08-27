# Webhook event normalizer

Normalizes service events for the webhook archive.

## Event contract

Each input has the shape `{ type, data }`. The required fields in `data` and
their normalized values are:

| Event type | `id` source | `occurredAt` source | `actor` source | `kind` | Summary label |
| --- | --- | --- | --- | --- | --- |
| `invoice.paid` | `data.invoiceId` | `data.paidAt` | `data.customer` | `invoice-paid` | Invoice paid |
| `invoice.failed` | `data.invoiceId` | `data.failedAt` | `data.customer` | `invoice-failed` | Invoice failed |
| `user.created` | `data.userId` | `data.createdAt` | `data.email` | `user-created` | User created |
| `user.disabled` | `data.userId` | `data.disabledAt` | `data.email` | `user-disabled` | User disabled |
| `deploy.started` | `data.deploymentId` | `data.startedAt` | `data.initiator` | `deploy-started` | Deployment started |
| `deploy.succeeded` | `data.deploymentId` | `data.finishedAt` | `data.initiator` | `deploy-succeeded` | Deployment succeeded |
| `deploy.failed` | `data.deploymentId` | `data.finishedAt` | `data.initiator` | `deploy-failed` | Deployment failed |
| `alert.opened` | `data.alertId` | `data.openedAt` | `data.service` | `alert-opened` | Alert opened |
| `alert.closed` | `data.alertId` | `data.closedAt` | `data.service` | `alert-closed` | Alert closed |
| `access.granted` | `data.grantId` | `data.grantedAt` | `data.actor` | `access-granted` | Access granted |

The result is exactly `{ id, kind, occurredAt, actor, summary }`.
`occurredAt` preserves the source timestamp text, and `summary` is `<summary label>: <id>`.
Normalization must not modify the input event or its `data` object.
