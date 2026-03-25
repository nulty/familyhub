/**
 * Global modal stack — allows any component to imperatively open a Svelte modal.
 * App.svelte renders the stack declaratively.
 */

let _stack = $state([]);
let _nextId = 0;

export function getStack() {
  return _stack;
}

/**
 * Push a modal onto the stack.
 * @param {typeof import('svelte').SvelteComponent} component
 * @param {Record<string, any>} props
 * @returns {function} close — removes this modal from the stack
 */
export function pushModal(component, props = {}) {
  const id = _nextId++;
  const close = () => {
    _stack = _stack.filter(m => m.id !== id);
  };
  _stack = [..._stack, { id, component, props: { ...props, onclose: close } }];
  return close;
}
