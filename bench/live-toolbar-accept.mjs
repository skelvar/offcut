import { runModuleProbe } from './efficacy-fixture-lib.mjs';

export function acceptToolbar(root) {
  runModuleProbe(
    root,
    'src/components/editor/Toolbar.js',
    String.raw`
function componentProps(node) {
  const props = { ...(node.props || {}) };
  const children = Array.isArray(node.children) ? node.children : [];
  if (props.children == null && children.length) {
    props.children = children.length === 1 ? children[0] : children;
  }
  return props;
}
function childrenOf(node) {
  if (node == null || typeof node !== 'object') return [];
  const children = Array.isArray(node.children) ? node.children : [];
  if (children.length) return children;
  return node.props && node.props.children != null ? [node.props.children].flat() : [];
}
function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (node == null) return [];
  if (typeof node !== 'object') return [node];
  if (typeof node.type === 'function') return flatten(node.type(componentProps(node)));
  return [node, ...childrenOf(node).flatMap(flatten)];
}
function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (node == null) return '';
  if (typeof node !== 'object') return String(node);
  if (typeof node.type === 'function') return textOf(node.type(componentProps(node)));
  return childrenOf(node).map(textOf).join(' ');
}
function button(nodes, label) {
  return nodes.find((node) =>
    node && typeof node === 'object' && node.type === 'button' && label.test(textOf(node).trim())
  );
}
const idle = flatten(subject.Toolbar({ saving: false }));
const busy = flatten(subject.Toolbar({ saving: true }));
if (!button(idle, /^Cancel$/) || !button(busy, /^Cancel$/)) throw new Error('cancel control missing');
const idleSave = button(idle, /^Save$/);
const busySave = button(busy, /^Saving(?:…|\.\.\.)?$/);
if (!idleSave) throw new Error('idle save label');
if (!busySave) throw new Error('busy save label');
if (idleSave.props && idleSave.props.disabled) throw new Error('idle save is disabled');
if (!busySave.props || !busySave.props.disabled) throw new Error('busy save is not disabled');
`,
  );
}
