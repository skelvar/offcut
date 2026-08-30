import { createElement } from '../../vendor/react.js';

export function Card({ title, children } = {}) {
  return createElement(
    'section',
    { className: 'card' },
    title ? createElement('h2', null, title) : null,
    children,
  );
}
