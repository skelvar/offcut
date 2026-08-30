import { createElement } from '../../vendor/react.js';
import { classNames } from '../../lib/classNames.js';

export function Pressable({
  variant = 'secondary',
  disabled = false,
  children = '',
} = {}) {
  const kind = variant === 'primary' ? 'primary' : 'secondary';
  return createElement(
    'button',
    {
      type: 'button',
      className: classNames('btn', `btn-${kind}`),
      disabled: Boolean(disabled),
    },
    children,
  );
}
