import { createElement } from '../../vendor/react.js';

export function Button({
  variant = 'secondary',
  disabled = false,
  children = '',
} = {}) {
  const kind = variant === 'primary' ? 'primary' : 'secondary';
  return createElement(
    'button',
    {
      type: 'button',
      className: `btn btn-${kind}`,
      disabled: Boolean(disabled),
    },
    children,
  );
}
