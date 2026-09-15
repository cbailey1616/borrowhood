import { withTransaction } from '../utils/db.js';

export async function ensureNotificationSchema() {
  await withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(812763)');
    const { rows: [type] } = await client.query("SELECT data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='notifications' AND column_name='type'");
    if (type?.data_type === 'USER-DEFINED') await client.query('ALTER TABLE notifications ALTER COLUMN type TYPE VARCHAR(50) USING type::text');
    await client.query(`CREATE TABLE IF NOT EXISTS push_devices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      installation_id TEXT NOT NULL UNIQUE, token TEXT NOT NULL UNIQUE, revocation_hash TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query('ALTER TABLE push_devices ADD COLUMN IF NOT EXISTS revocation_hash TEXT');
    // Ambiguous legacy tokens are intentionally not migrated to either account.
    await client.query(`INSERT INTO push_devices(user_id, installation_id, token)
      SELECT id, 'legacy:' || encode(sha256(convert_to(push_token, 'UTF8')), 'hex'), push_token FROM users
      WHERE push_token IS NOT NULL AND push_token ~ '^(ExponentPushToken|ExpoPushToken)\\[[A-Za-z0-9_-]+\\]$'
      AND push_token IN (SELECT push_token FROM users GROUP BY push_token HAVING COUNT(*)=1)
      ON CONFLICT DO NOTHING`);
    await client.query('UPDATE users SET push_token=NULL WHERE push_token IS NOT NULL');
    await client.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS discussion_id UUID');
    await client.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS thread_id UUID');
    await client.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS circle_id UUID');
    await client.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS push_data JSONB');
    // Old server instances can still insert rows during a rolling deployment.
    // Set only the default, never backfill historical notifications for sending.
    await client.query("ALTER TABLE notifications ALTER COLUMN push_data SET DEFAULT '{}'::jsonb");
    await client.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key TEXT');
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS notification_dedupe ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL');
    await client.query(`CREATE TABLE IF NOT EXISTS push_deliveries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
      device_id UUID NOT NULL REFERENCES push_devices(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
      available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), lease_until TIMESTAMPTZ,
      ticket_id TEXT, ticket_at TIMESTAMPTZ, sent_token TEXT, last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(notification_id, device_id)
    )`);
    await client.query('CREATE INDEX IF NOT EXISTS push_deliveries_pending ON push_deliveries(status, available_at)');
    // The activity and per-device delivery jobs commit or roll back together.
    await client.query(`CREATE OR REPLACE FUNCTION enqueue_notification_push() RETURNS trigger AS $$
      BEGIN
        IF NEW.push_data IS NOT NULL THEN
          INSERT INTO push_deliveries(notification_id, device_id)
            SELECT NEW.id, id FROM push_devices WHERE user_id=NEW.user_id ON CONFLICT DO NOTHING;
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await client.query('DROP TRIGGER IF EXISTS notification_push_outbox ON notifications');
    await client.query(`CREATE TRIGGER notification_push_outbox AFTER INSERT OR UPDATE OF push_data ON notifications
      FOR EACH ROW EXECUTE FUNCTION enqueue_notification_push()`);
  });
}
