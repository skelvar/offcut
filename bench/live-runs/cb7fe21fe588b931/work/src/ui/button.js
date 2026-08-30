export function Button({
  variant = 'secondary',
  disabled = false,
  children = '',
} = {}) {
  const kind = variant === 'primary' ? 'primary' : 'secondary';
  const disabledAttr = disabled ? ' disabled' : '';
  return `<button type="button" class="btn btn-${kind}"${disabledAttr}>${children}</button>`;
}
