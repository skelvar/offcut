import { createElement } from '../../vendor/react.js';

export function Toolbar() {
  return createElement(
    'nav',
    { className: 'toolbar' },
    createElement('span', { className: 'doc-title' }, 'Untitled'),
    createElement('button', { type: 'button', className: 'ghost' }, 'Cancel'),
  );
}
