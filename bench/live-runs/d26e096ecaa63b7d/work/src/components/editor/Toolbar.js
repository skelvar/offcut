import { createElement } from '../../vendor/react.js';

// Action controls will expand (export, share, save).
export function Toolbar({ saving }) {
  return createElement(
    'nav',
    { className: 'toolbar' },
    createElement('span', { className: 'doc-title' }, 'Untitled'),
    createElement('button', { type: 'button', className: 'ghost' }, 'Cancel'),
    createElement(
      'button',
      { type: 'button', className: 'primary', disabled: saving },
      saving ? 'Saving...' : 'Save',
    ),
  );
}
