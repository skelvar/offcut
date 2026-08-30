import { createElement } from '../../vendor/react.js';
import { Pressable } from '../ui/Pressable.js';

// Action controls will expand (export, share, save).
export function Toolbar({ saving } = {}) {
  return createElement(
    'nav',
    { className: 'toolbar' },
    createElement('span', { className: 'doc-title' }, 'Untitled'),
    createElement('button', { type: 'button', className: 'ghost' }, 'Cancel'),
    createElement(Pressable, { variant: 'primary', busy: Boolean(saving), children: 'Save' }),
  );
}
