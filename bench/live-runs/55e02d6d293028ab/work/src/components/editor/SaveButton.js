import { createElement } from '../../vendor/react.js';
import { Button } from '../ui/Button.js';

export function SaveButton({ saving = false } = {}) {
  return createElement(Button, {
    variant: 'primary',
    disabled: saving,
    children: saving ? 'Saving...' : 'Save',
  });
}
