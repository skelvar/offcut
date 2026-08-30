export function createElement(type, props, ...children) {
  return {
    type,
    props: props || {},
    children: children.flat().filter((child) => child !== null && child !== undefined),
  };
}

export default { createElement };
