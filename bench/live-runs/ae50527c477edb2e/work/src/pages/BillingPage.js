import { createElement } from '../vendor/react.js';
import { Avatar } from '../components/ui/Avatar.js';
import { Card } from '../components/ui/Card.js';

export function BillingPage() {
  return createElement(
    Card,
    { title: 'Plan' },
    createElement(Avatar, { name: 'Ada' }),
    createElement('p', null, 'Invoices export from this page later.'),
  );
}
