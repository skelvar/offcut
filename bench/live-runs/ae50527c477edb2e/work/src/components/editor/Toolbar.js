import { createElement } from '../../vendor/react.js';
import { Pressable } from '../ui/Pressable.js';

const labels = {
  cancel: 'Cancel',
  save: 'Save',
  saving: 'Saving...',
};

export function Toolbar({ saving = false } = {}) {
  return createElement(
    'nav',
    { className: 'toolbar' },
    createElement('span', { className: 'doc-title' }, 'Untitled'),
    createElement(Pressable, null, labels.cancel),
    createElement(
      Pressable,
      { variant: 'primary', disabled: saving },
      saving ? labels.saving : labels.save,
    ),
  );
}
