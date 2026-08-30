import { createElement } from '../vendor/react.js';
import { LoginForm } from '../components/auth/LoginForm.js';
import { Card } from '../components/ui/Card.js';

export function LoginPage() {
  return createElement(Card, { title: 'Sign in', children: createElement(LoginForm) });
}
