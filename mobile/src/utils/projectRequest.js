// Save a preview only when the user sends a request or links an exchange.
export async function resolveProjectSlot(api, {projectItemId, projectId, projectDraft} = {}) {
  if (projectItemId) return {itemId:projectItemId, projectId};
  if (!projectDraft) return null;
  const {label, ...draft} = projectDraft;
  if (draft.templateId === 'custom' && !draft.name?.trim()) throw new Error('Give your plan a name before choosing an item.');
  const saved = await api.createProject(draft);
  const project = await api.getProject(saved.id);
  const item = project.items.find(i=>i.label.trim().toLowerCase() === label.trim().toLowerCase());
  if (!item) throw new Error('This item is no longer on your saved plan. Reopen the plan and add it again.');
  if (item.owned || item.transactionId) throw new Error('This item is already covered. Reopen your plan to see its status.');
  return {itemId:item.id, projectId:project.id};
}
