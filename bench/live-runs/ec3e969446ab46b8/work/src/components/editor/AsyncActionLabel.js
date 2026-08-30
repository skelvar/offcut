import { createElement } from '../../vendor/react.js';
import { LoadingSpinner } from '../ui/LoadingSpinner.js';

export function AsyncActionLabel({
  busy = false,
  idle,
  pending,
} = {}) {
  return createElement(
    'span',
    { className: 'async-action-label' },
    busy ? createElement(LoadingSpinner) : null,
    busy ? pending : idle,
  );
}
