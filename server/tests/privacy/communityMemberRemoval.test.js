import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../../src/utils/db.js', () => ({ query: mocks.query }));
vi.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: req.get('x-user-id') };
    next();
  },
  requireVerified: (_req, _res, next) => next(),
  requireOrganizer: (_req, _res, next) => next(),
}));

const router = (await import('../../src/routes/communities.js')).default;
const app = express();
app.use(express.json());
app.use('/api/communities', router);

const remove = (caller = 'moderator', target = 'neighbor') => request(app)
  .delete(`/api/communities/neighborhood/members/${target}`)
  .set('x-user-id', caller);

beforeEach(() => mocks.query.mockReset());

describe('neighborhood member removal permissions', () => {
  it('lets a moderator remove a regular member', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ role: 'organizer' }] })
      .mockResolvedValueOnce({ rows: [{ role: 'member' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await remove();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(mocks.query).toHaveBeenLastCalledWith(
      'DELETE FROM community_memberships WHERE community_id = $1 AND user_id = $2',
      ['neighborhood', 'neighbor']
    );
  });

  it('denies regular members', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ role: 'member' }] });

    const response = await remove('member');

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('moderators');
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('protects the acting moderator and other moderators', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ role: 'organizer' }] });
    expect((await remove('moderator', 'moderator')).status).toBe(400);

    mocks.query.mockReset()
      .mockResolvedValueOnce({ rows: [{ role: 'organizer' }] })
      .mockResolvedValueOnce({ rows: [{ role: 'organizer' }] });
    const otherModerator = await remove('moderator', 'other-moderator');
    expect(otherModerator.status).toBe(400);
    expect(otherModerator.body.error).toContain('another moderator');
  });
});
