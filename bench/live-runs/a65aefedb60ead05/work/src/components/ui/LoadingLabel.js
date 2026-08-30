import { createElement } from '../../vendor/react.js';
import { LoadingSpinner } from './LoadingSpinner.js';

export function LoadingLabel({ loading = false, label = '', loadingLabel = '' } = {}) {
  if (!loading) return label;

  return createElement(
    'span',
    { className: 'loading-label' },
    createElement(LoadingSpinner),
    loadingLabel,
  );
}
