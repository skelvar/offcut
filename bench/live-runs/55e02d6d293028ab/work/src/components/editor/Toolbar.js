import { createElement } from '../../vendor/react.js';
import { SaveButton } from './SaveButton.js';

export function Toolbar({ saving } = {}) {
  return createElement(
    'nav',
    { className: 'toolbar' },
    createElement('span', { className: 'doc-title' }, 'Untitled'),
    createElement('button', { type: 'button', className: 'ghost' }, 'Cancel'),
    createElement(SaveButton, { saving }),
  );
}
