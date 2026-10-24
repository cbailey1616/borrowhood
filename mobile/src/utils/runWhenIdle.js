// Defer noncritical refresh work without the removed InteractionManager API.
export function runWhenIdle(callback) {
  if (typeof globalThis.requestIdleCallback === 'function') {
    const id = globalThis.requestIdleCallback(callback, { timeout: 500 });
    return { cancel: () => globalThis.cancelIdleCallback?.(id) };
  }
  const id = setTimeout(callback, 0);
  return { cancel: () => clearTimeout(id) };
}
