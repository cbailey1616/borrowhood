// Keep the component mounted while navigating away and returning, as a native
// stack does. A no-op navigate mock misses cleanup that runs after blur.
export default function navigationVisit() {
  const listeners = new Map();
  let focused = true;
  const emit = event => listeners.get(event)?.forEach(listener => listener());
  const blur = () => { focused = false; emit('blur'); };
  const focus = () => { focused = true; emit('focus'); };
  return {
    blur,
    focus,
    navigation: {
      navigate: jest.fn(blur),
      isFocused: jest.fn(() => focused),
      addListener: jest.fn((event, listener) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(listener);
        return () => listeners.get(event).delete(listener);
      }),
    },
  };
}
