import { publicReplyRoute, privateMessagePrefix, messagePresentation } from '../../src/utils/conversationContext';

test('request reply activity and listing reply activity open their own public threads', () => {
  expect(publicReplyRoute({ type: 'discussion_reply', requestId: 'request-1' })).toEqual({ requestId: 'request-1' });
  expect(publicReplyRoute({ type: 'request_comment', requestId: 'request-2' })).toEqual({ requestId: 'request-2' });
  expect(publicReplyRoute({ type: 'listing_comment', listingId: 'item-1' })).toEqual({ listingId: 'item-1' });
  expect(publicReplyRoute({ type: 'new_message', listingId: 'item-1' })).toBeNull();
});

test('separates generated item and reply context without losing multiline message text', () => {
  const prefix = privateMessagePrefix({ id: 'one', type: 'request', title: 'A “small” ladder', replyText: 'Mine is available.' });
  expect(messagePresentation(prefix + 'Thanks!\nTomorrow works.')).toEqual({
    context: { type: 'request', title: 'A “small” ladder', replyText: 'Mine is available.' },
    text: 'Thanks!\nTomorrow works.',
  });
  expect(messagePresentation(privateMessagePrefix({ id: 'one', title: 'Drill' }).trim())).toEqual({
    context: { type: 'item', title: 'Drill', replyText: '' }, text: '',
  });
});

test.each(['About item: a drill', 'Hello\n\nAbout item: “Drill”', 'About item: “Drill” is available', 'About item: “Drill”\nOne line'])('preserves ordinary message text: %s', text => {
  expect(messagePresentation(text)).toEqual({ text, context: null });
});
test('keeps subjects bounded so a private reply still has room for the message', () => {
  const prefix = privateMessagePrefix({ id: '1', title: 'a'.repeat(2000), replyText: 'b'.repeat(2000), type: 'listing' });
  expect(prefix.length).toBeLessThan(430);
  expect(privateMessagePrefix(null)).toBe('');
});
