import { Button } from './ui/button.js';
import { SaveButton } from './save-button.js';

export function renderToolbar({ saving }) {
  return `<nav class="toolbar">${Button({ children: 'Cancel' })}${SaveButton({ saving })}</nav>`;
}
