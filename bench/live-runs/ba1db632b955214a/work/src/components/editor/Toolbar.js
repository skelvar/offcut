import { createElement } from '../../vendor/react.js';
import { Pressable } from '../ui/Pressable.js';

export function Toolbar({ saving = false } = {}) {
  return createElement(
    'nav',
    { className: 'toolbar' },
    createElement('span', { className: 'doc-title' }, 'Untitled'),
    createElement(
      'div',
      { className: 'toolbar-actions' },
      createElement('button', { type: 'button', className: 'ghost' }, 'Cancel'),
      createElement(Pressable, {
        variant: 'primary',
        disabled: saving,
        children: saving ? 'Saving…' : 'Save',
      }),
    ),
  );
}
