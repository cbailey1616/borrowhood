// Feed entries keep type="request"; requestType carries the selected kind.
export function requestPresentation(type) {
  if (type === 'service') return { icon: 'handshake', label: 'Help wanted' };
  if (type === 'item') return { icon: 'cube', label: 'Item wanted' };
  return { icon: 'request-note', label: 'Wanted post' };
}
