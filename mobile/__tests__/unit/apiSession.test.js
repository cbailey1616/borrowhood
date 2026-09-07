import api from '../../src/services/api';
jest.unmock('../../src/services/api');
const errorResponse = (code, status = 401) => ({ ok: false, status, json: async () => ({ error: 'Please sign in again', code }) });
beforeEach(() => { api.setAuthToken('old-session'); global.fetch = jest.fn(); });
afterEach(() => { api.setSessionExpiredHandler(null); api.setAuthToken(null); });
it('notifies the auth provider once when concurrent requests find an expired session', async () => {
  const expired = jest.fn();
  api.setSessionExpiredHandler(expired);
  fetch.mockResolvedValue(errorResponse('SESSION_EXPIRED'));
  const results = await Promise.allSettled([api.getMe(), api.getConversations()]);
  expect(results.every(r => r.status === 'rejected')).toBe(true);
  expect(expired).toHaveBeenCalledTimes(1);
});
it('does not sign out a newly signed-in account for a late response from the old session', async () => {
  let finish;
  const expired = jest.fn(); api.setSessionExpiredHandler(expired);
  fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = api.getMe();
  api.setAuthToken('new-session');
  finish(errorResponse('SESSION_EXPIRED'));
  await expect(pending).rejects.toThrow();
  expect(expired).not.toHaveBeenCalled();
});
it('does not treat an incorrect password or a network failure as session expiry', async () => {
  const expired = jest.fn(); api.setSessionExpiredHandler(expired);
  fetch.mockResolvedValueOnce(errorResponse(undefined)).mockRejectedValueOnce(new Error('Offline'));
  await expect(api.login('person@example.com', 'wrong')).rejects.toThrow();
  await expect(api.getMe()).rejects.toThrow('Offline');
  expect(expired).not.toHaveBeenCalled();
});
it('ends a suspended account session but does not treat ordinary permission denials as suspension', async () => {
  const expired = jest.fn(); api.setSessionExpiredHandler(expired);
  fetch.mockResolvedValueOnce(errorResponse(undefined,403)).mockResolvedValueOnce(errorResponse('ACCOUNT_SUSPENDED',403));
  await expect(api.getMe()).rejects.toThrow(); expect(expired).not.toHaveBeenCalled();
  await expect(api.getMe()).rejects.toThrow(); expect(expired).toHaveBeenCalledTimes(1);
});
