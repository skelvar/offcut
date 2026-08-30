import { createElement } from '../../vendor/react.js';
import { classNames } from '../../lib/classNames.js';
import { LoadingSpinner } from './LoadingSpinner.js';

export function Pressable({
  variant = 'secondary',
  disabled = false,
  busy = false,
  children = '',
} = {}) {
  const kind = variant === 'primary' ? 'primary' : 'secondary';
  return createElement(
    'button',
    {
      type: 'button',
      className: classNames('btn', `btn-${kind}`),
      disabled: Boolean(disabled || busy),
      'aria-busy': Boolean(busy),
    },
    busy ? createElement(LoadingSpinner) : null,
    children,
  );
}
