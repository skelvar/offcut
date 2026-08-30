import { createElement } from '../../vendor/react.js';
import { Pressable } from '../ui/Pressable.js';
import { AsyncActionLabel } from './AsyncActionLabel.js';

// Action controls will expand (export, share, save).
export function Toolbar({ saving = false } = {}) {
  return createElement(
    'nav',
    { className: 'toolbar' },
    createElement('span', { className: 'doc-title' }, 'Untitled'),
    createElement('button', { type: 'button', className: 'ghost' }, 'Cancel'),
    createElement(Pressable, {
      variant: 'primary',
      disabled: saving,
      children: createElement(AsyncActionLabel, {
        busy: saving,
        idle: 'Save',
        pending: 'Saving...',
      }),
    }),
  );
}
