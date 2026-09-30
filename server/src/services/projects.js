import { query } from '../utils/db.js';
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
