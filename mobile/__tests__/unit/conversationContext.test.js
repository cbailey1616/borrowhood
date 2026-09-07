import { publicReplyRoute, privateMessagePrefix } from '../../src/utils/conversationContext';

test('request reply activity and listing reply activity open their own public threads', () => {
  expect(publicReplyRoute({ type: 'discussion_reply', requestId: 'request-1' })).toEqual({ requestId: 'request-1' });
  expect(publicReplyRoute({ type: 'request_comment', requestId: 'request-2' })).toEqual({ requestId: 'request-2' });
  expect(publicReplyRoute({ type: 'listing_comment', listingId: 'item-1' })).toEqual({ listingId: 'item-1' });
  expect(publicReplyRoute({ type: 'new_message', listingId: 'item-1' })).toBeNull();
});
test('keeps subjects bounded so a private reply still has room for the message', () => {
  const prefix = privateMessagePrefix({ id: '1', title: 'a'.repeat(2000), replyText: 'b'.repeat(2000), type: 'listing' });
  expect(prefix.length).toBeLessThan(430);
  expect(privateMessagePrefix(null)).toBe('');
});
