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
it('keeps the same sign-in through a temporary account lookup failure and retry', async () => {
  const expired = jest.fn(); api.setSessionExpiredHandler(expired);
  fetch.mockResolvedValueOnce(errorResponse('AUTH_UNAVAILABLE', 503))
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'current-account' }) });
  await expect(api.getMe()).rejects.toMatchObject({ status: 503, code: 'AUTH_UNAVAILABLE' });
  expect(expired).not.toHaveBeenCalled();
  await expect(api.getMe()).resolves.toEqual({ id: 'current-account' });
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer old-session');
});
it('ends a suspended account session but does not treat ordinary permission denials as suspension', async () => {
  const expired = jest.fn(); api.setSessionExpiredHandler(expired);
  fetch.mockResolvedValueOnce(errorResponse(undefined,403)).mockResolvedValueOnce(errorResponse('ACCOUNT_SUSPENDED',403));
  await expect(api.getMe()).rejects.toThrow(); expect(expired).not.toHaveBeenCalled();
  await expect(api.getMe()).rejects.toThrow(); expect(expired).toHaveBeenCalledTimes(1);
});

it('rejects successful data from an account that has been replaced', async () => {
  let finish;
  fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = api.getMe();
  api.setAuthToken('new-account');
  finish({ ok: true, json: async () => ({ id: 'old-account', email: 'private@example.com' }) });
  await expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
});

it('keeps an explicitly supplied account-link token', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
  await api.linkAccount('google', { idToken: 'provider-proof' }, 'newly-authenticated-token');
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer newly-authenticated-token');
});

it('stops preparing an upload when the account changes', async () => {
  let readBlob;
  fetch.mockResolvedValueOnce({ blob: () => new Promise(resolve => { readBlob = resolve; }) });
  const pending = api.uploadImage('file:///private-photo.jpg');
  for (let i = 0; i < 10 && !readBlob; i++) await Promise.resolve();
  expect(readBlob).toBeDefined();
  api.setAuthToken('new-account');
  readBlob({ type: 'image/jpeg', size: 120 });
  await expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('times out a stalled response body and aborts its request', async () => {
  jest.useFakeTimers();
  try {
    fetch.mockResolvedValueOnce({ ok: true, json: () => new Promise(() => {}) });
    const pending = api.getMe().catch(error => error);
    await jest.advanceTimersByTimeAsync(30000);
    expect(await pending).toMatchObject({ code: 'REQUEST_TIMEOUT' });
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});

it('does not accept an unreadable successful response as empty data', async () => {
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } });
  await expect(api.getMe()).rejects.toThrow('Could not read the server response');
});

it('rejects old successful data as soon as another request invalidates the session', async () => {
  let finish;
  fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce(errorResponse('SESSION_EXPIRED'));
  const old = api.getMe();
  await expect(api.getConversations()).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  finish({ ok: true, json: async () => ({ id: 'expired-account' }) });
  await expect(old).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
});
