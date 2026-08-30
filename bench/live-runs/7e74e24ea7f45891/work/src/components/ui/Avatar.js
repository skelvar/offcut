import { createElement } from '../../vendor/react.js';

export function Avatar({ name = '?' } = {}) {
  return createElement('span', { className: 'avatar' }, String(name).slice(0, 1));
}
