import { createProfileLink, profileIdFromLink } from '../../src/utils/profileLinks';

const id = '10000000-0000-4000-8000-0000000000ab';

it('creates a stable HTTPS link containing only the public profile ID', () => {
  expect(createProfileLink(id)).toBe(`https://borrowhood-production.up.railway.app/people/${id}`);
  expect(createProfileLink(id.toUpperCase())).toBe(createProfileLink(id));
  expect(profileIdFromLink(createProfileLink(id))).toBe(id);
});

it.each([null, undefined, '', 'not-an-id', `${id}/extra`, `${id}?token=secret`, `${id}\n`])('does not create a profile link from an invalid ID: %s', value => {
  expect(createProfileLink(value)).toBeNull();
});

it.each([
  `borrowhood://people/${id}`,
  `com.borrowhood.app://people/${id}`,
  `https://borrowhood-production.up.railway.app/people/${id}/`,
  `https://borrowhood-production.up.railway.app/people/${id}?source=share`,
])('recognizes a supported profile link: %s', url => {
  expect(profileIdFromLink(url)).toBe(id);
});

it.each([
  null, 'not a URL', `https://example.com/people/${id}`,
  `http://borrowhood-production.up.railway.app/people/${id}`,
  `https://borrowhood-production.up.railway.app.evil.test/people/${id}`,
  `https://borrowhood-production.up.railway.app@evil.test/people/${id}`,
  `https://borrowhood-production.up.railway.app/people/${id}/extra`,
  `https://borrowhood-production.up.railway.app/people/%2e%2e`,
  'borrowhood://verification-complete', 'com.borrowhood.app://stripe-redirect',
  `borrowhood://people/${id}\nhttps://example.com`,
  `borrowhood://people/${id}\n`,
])('ignores other URLs and malformed profile links: %s', url => {
  expect(profileIdFromLink(url)).toBeNull();
});
