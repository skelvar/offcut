import { createElement } from '../../vendor/react.js';
import { SaveButton } from './SaveButton.js';

export function Toolbar({ saving = false } = {}) {
  return createElement(
    'nav',
    { className: 'toolbar' },
    createElement('span', { className: 'doc-title' }, 'Untitled'),
    createElement(SaveButton, { saving }),
    createElement('button', { type: 'button', className: 'ghost' }, 'Cancel'),
  );
}
