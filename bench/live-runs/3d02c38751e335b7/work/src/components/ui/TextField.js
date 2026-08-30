import { createElement } from '../../vendor/react.js';

export function TextField({ id, label, name, type = 'text' } = {}) {
  return createElement(
    'label',
    { className: 'field', htmlFor: id },
    label,
    createElement('input', { id, name, type }),
  );
}
