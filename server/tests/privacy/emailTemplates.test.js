import { expect, it } from 'vitest';
import { accountHintEmail, renderEmail, resetCodeEmail, signupCodeEmail, socialLinkCodeEmail } from '../../src/services/emailTemplates.js';

it.each([
  [() => resetCodeEmail('012345'), '1 hour'],
  [() => socialLinkCodeEmail('012345', 'google'), '10 minutes'],
  [() => socialLinkCodeEmail('012345', 'apple'), '10 minutes'],
  [() => signupCodeEmail('012345'), '10 minutes'],
])('keeps a selectable code and its correct expiry in HTML and plain text', (render, expiry) => {
  const { html, text } = render();
  expect(html).toContain('>012345</p>');
  expect(text).toContain('012345');
  expect(html).toContain(expiry);
  expect(text).toContain(expiry);
  expect(html).toContain('mailto:chris@borrowhood.net');
  expect(html).not.toMatch(/<img\b|<script\b/);
  expect(html.match(/<div[^>]+display:none[^>]*>(.*?)<\/div>/s)[1]).not.toContain('012345');
});

it('escapes dynamic text and rejects invalid code markup', () => {
  const value = '<img src=x onerror="alert(1)">&';
  const { html, text } = renderEmail({ title: value, preview: value, intro: value, details: [value], note: value });
  expect(html).not.toContain(value);
  expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;');
  expect(text).toContain(value);
  expect(() => resetCodeEmail(value)).toThrow('Invalid email code');
  expect(() => socialLinkCodeEmail('123456', value)).toThrow('Invalid sign-in provider');
});

it('shows only actual supported sign-in options without duplicates', () => {
  const email = accountHintEmail(['google', 'google', 'unknown', 'apple']);
  expect(email.text).toContain('Continue with Google or Continue with Apple');
  expect(email.text).not.toContain('unknown');
  expect(email.text.match(/Continue with Google/g)).toHaveLength(1);
  expect(accountHintEmail().text).toContain('Forgot password');
  expect(email.subject).toBe('Your Borrowhood sign-in options');
});
