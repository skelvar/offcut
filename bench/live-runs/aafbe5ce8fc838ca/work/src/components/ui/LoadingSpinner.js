import { createElement } from '../../vendor/react.js';

export function LoadingSpinner() {
  return createElement('span', { className: 'spinner', 'aria-hidden': 'true' });
}
