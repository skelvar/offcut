import { createElement } from '../../vendor/react.js';
import { Pressable } from '../ui/Pressable.js';
import { TextField } from '../ui/TextField.js';

export function LoginForm() {
  return createElement(
    'form',
    { className: 'login' },
    createElement(TextField, { id: 'email', name: 'email', label: 'Email', type: 'email' }),
    createElement(Pressable, { variant: 'primary', children: 'Sign in' }),
  );
}
