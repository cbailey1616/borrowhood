// Feed entries keep type="request"; requestType carries the selected kind.
export function requestPresentation(type) {
  if (type === 'service') return { icon: 'handshake', label: 'Service request' };
  if (type === 'item') return { icon: 'cube', label: 'Item request' };
  return { icon: 'request-note', label: 'Neighbor request' };
}
