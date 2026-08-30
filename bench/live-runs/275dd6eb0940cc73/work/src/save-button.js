import { Button } from './ui/button.js';

export function SaveButton({ saving = false } = {}) {
  return Button({
    variant: 'primary',
    disabled: saving,
    children: saving ? 'Saving...' : 'Save',
  });
}
