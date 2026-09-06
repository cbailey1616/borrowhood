// A poll started before a send must not remove the newly acknowledged message.
export function mergeMessages(current = [], incoming = []) {
  const byId = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) byId.set(message.id, { ...byId.get(message.id), ...message });
  return [...byId.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}
