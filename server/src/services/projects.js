import { query } from '../utils/db.js';
import { matchesProjectItem } from '../data/projects.js';

// Borrows started from the feed/Wanted can predate or bypass a checklist.
// Recover only an unambiguous match, and preserve every explicit association.
export async function reconcileProjectExchanges(client, projectId, userId) {
  const { rows: [project] } = await client.query('SELECT id FROM borrow_projects WHERE id=$1 AND user_id=$2 FOR UPDATE', [projectId, userId]);
  if (!project) return;
  const { rows: items } = await client.query('SELECT id,terms,owned,transaction_id FROM borrow_project_items WHERE project_id=$1 FOR UPDATE', [projectId]);
  const open = items.filter(item => !item.owned && !item.transaction_id);
  if (!open.length) return;
  const { rows: exchanges } = await client.query(`SELECT t.id,l.title FROM borrow_transactions t
    JOIN listings l ON l.id=t.listing_id WHERE t.borrower_id=$1
      AND t.status IN ('pending','approved','paid','picked_up','return_pending')
      AND COALESCE(l.listing_type,'lend')='lend' AND l.is_free=true
      AND COALESCE(l.price_per_day,0)=0 AND COALESCE(l.deposit_amount,0)=0
    FOR SHARE OF t`, [userId]);
  const used = new Set(items.map(item => item.transaction_id).filter(Boolean));
  const matches = open.map(item => ({ item, exchanges: exchanges.filter(exchange => !used.has(exchange.id) && matchesProjectItem(exchange.title, item.terms)) }));
  for (const match of matches) {
    if (match.exchanges.length !== 1) continue;
    const exchange = match.exchanges[0];
    if (matches.filter(other => other.exchanges.some(candidate => candidate.id === exchange.id)).length !== 1) continue;
    await client.query('UPDATE borrow_project_items SET transaction_id=$2 WHERE id=$1', [match.item.id, exchange.id]);
  }
}
export async function ensureProjectSchema(execute = query) {
  await execute(`CREATE TABLE IF NOT EXISTS borrow_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id TEXT NOT NULL, name VARCHAR(80) NOT NULL, target_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await execute(`CREATE INDEX IF NOT EXISTS borrow_projects_user ON borrow_projects(user_id, created_at)`);
  await execute(`CREATE TABLE IF NOT EXISTS borrow_project_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES borrow_projects(id) ON DELETE CASCADE,
    label VARCHAR(60) NOT NULL, icon TEXT NOT NULL, terms JSONB NOT NULL,
    owned BOOLEAN NOT NULL DEFAULT false, optional BOOLEAN NOT NULL DEFAULT false, sort_order INTEGER NOT NULL DEFAULT 0,
    transaction_id UUID REFERENCES borrow_transactions(id) ON DELETE SET NULL)`);
  await execute('ALTER TABLE borrow_project_items ADD COLUMN IF NOT EXISTS optional BOOLEAN NOT NULL DEFAULT false');
  await execute('CREATE INDEX IF NOT EXISTS borrow_project_items_project ON borrow_project_items(project_id)');
}
// Called within request creation's transaction: failed association rolls back the request too.
export async function lockProjectItem(client, itemId, userId) {
  const { rows: [item] } = await client.query(`SELECT i.id,i.owned,i.transaction_id FROM borrow_project_items i
    JOIN borrow_projects p ON p.id=i.project_id WHERE i.id=$1 AND p.user_id=$2 FOR UPDATE OF i`, [itemId,userId]);
  if (!item) throw Object.assign(new Error('Project item no longer exists. Reopen your project.'), {status:404});
  if (item.owned || item.transaction_id) throw Object.assign(new Error('This checklist item is already covered. Refresh your project.'), {status:409});
}
