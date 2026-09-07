import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock('../../src/utils/logger.js', () => ({ logger: { info: mocks.info, error: mocks.error } }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('RESEND_API_KEY', 'test-only-not-a-real-key');
  mocks.send.mockResolvedValue({ data: { id: 'mock-email' }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

it('sends branded HTML, plain text, and a working reply address through every current flow', async () => {
  const email = await import('../../src/services/email.js');
  await email.sendResetCodeEmail('person@example.test', '012345');
  await email.sendSocialLinkCodeEmail('person@example.test', '012345', 'google');
  await email.sendAccountHintEmail('person@example.test', ['apple']);
  await email.sendSignupCodeEmail('person@example.test', '012345');
  expect(mocks.send).toHaveBeenCalledTimes(4);
  for (const [message] of mocks.send.mock.calls) {
    expect(message).toMatchObject({ from: 'Borrowhood <noreply@borrowhood.net>', replyTo: 'chris@borrowhood.net', to: 'person@example.test' });
    expect(message.html).toContain('YOUR BORROWHOOD ACCOUNT');
    expect(message.text).toContain('Contact chris@borrowhood.net');
  }
});

it.each(['sendResetCodeEmail', 'sendAccountHintEmail', 'sendSocialLinkCodeEmail', 'sendSignupCodeEmail'])('does not silently accept provider errors: %s', async name => {
  const email = await import('../../src/services/email.js');
  mocks.send.mockResolvedValue({ data: null, error: { message: 'secret 012345 person@example.test' } });
  const args = name === 'sendAccountHintEmail' ? ['person@example.test', []] : ['person@example.test', '012345', 'apple'];
  await expect(email[name](...args)).rejects.toThrow('Email delivery failed');
  expect(mocks.info).not.toHaveBeenCalled();
  expect(JSON.stringify(mocks.error.mock.calls)).not.toMatch(/012345|person@example/);
});

it('does not expose provider exception contents', async () => {
  const email = await import('../../src/services/email.js');
  mocks.send.mockRejectedValue(new Error('secret code 012345'));
  await expect(email.sendResetCodeEmail('person@example.test', '012345')).rejects.toThrow('Email delivery failed');
  expect(mocks.error).toHaveBeenCalledWith('Account email delivery failed');
});

it('fails without a configured service and never logs codes or message bodies', async () => {
  vi.stubEnv('RESEND_API_KEY', '');
  const email = await import('../../src/services/email.js');
  await expect(email.sendResetCodeEmail('person@example.test', '012345')).rejects.toThrow('Email service unavailable');
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.info).not.toHaveBeenCalled();
  expect(mocks.error).not.toHaveBeenCalled();
});
