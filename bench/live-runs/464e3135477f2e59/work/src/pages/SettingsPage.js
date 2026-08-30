import { createElement } from '../vendor/react.js';
import { Card } from '../components/ui/Card.js';
import { TextField } from '../components/ui/TextField.js';

export function SettingsPage() {
  return createElement(
    Card,
    { title: 'Workspace' },
    createElement(TextField, { id: 'name', name: 'name', label: 'Workspace name' }),
  );
}
