// The Mac sample-data preview keeps drafts only in its current browser session.
export async function readDraft(scope) { return JSON.parse(sessionStorage.getItem(`bh-draft:${scope}`) || 'null'); }
export async function saveDraft(scope, value) { sessionStorage.setItem(`bh-draft:${scope}`, JSON.stringify(value)); }
export async function deleteDraft(scope) { sessionStorage.removeItem(`bh-draft:${scope}`); }
