// Fictional drafts live only for this capture process. The unsigned simulator
// has no app keychain entitlement; production keeps its encrypted draft store.
const drafts = new Map();
export const readDraft = async scope => drafts.has(scope) ? JSON.parse(drafts.get(scope)) : null;
export const saveDraft = async (scope, value) => { drafts.set(scope, JSON.stringify(value)); };
export const deleteDraft = async scope => { drafts.delete(scope); };
