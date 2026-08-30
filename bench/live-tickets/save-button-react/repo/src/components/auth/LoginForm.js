import { createElement } from '../../vendor/react.js';
import { Button } from '../ui/Button.js';

export function LoginForm() {
  return createElement(
    'form',
    { className: 'login' },
    createElement('label', { htmlFor: 'email' }, 'Email'),
    createElement('input', { id: 'email', name: 'email', type: 'email' }),
    createElement(Button, { variant: 'primary', children: 'Sign in' }),
  );
}
