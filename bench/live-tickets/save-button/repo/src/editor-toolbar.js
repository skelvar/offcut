import { Button } from './ui/button.js';

export function renderToolbar() {
  return `<nav class="toolbar">${Button({ children: 'Cancel' })}</nav>`;
}
