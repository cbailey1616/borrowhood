import { chatMessageMeta, formatChatDay, formatChatTime } from '../../src/utils/chatPresentation';

const message = (time, senderId = 'sam') => ({ createdAt: `2026-10-02T${time}:00`, senderId });

it('groups only consecutive messages by the same person within five minutes', () => {
  const first = message('10:00');
  expect(chatMessageMeta(first).startsGroup).toBe(true);
  expect(chatMessageMeta(message('10:04'), first).startsGroup).toBe(false);
  expect(chatMessageMeta(message('10:05'), first).startsGroup).toBe(true);
  expect(chatMessageMeta(message('10:01', 'chris'), first).startsGroup).toBe(true);
  expect(chatMessageMeta(message('09:59'), first).startsGroup).toBe(true);
});

it('starts a date group at midnight, even when messages are only a minute apart', () => {
  const meta = chatMessageMeta(message('00:00'), { createdAt: '2026-10-01T23:59:00', senderId: 'sam' });
  expect(meta.showDate).toBe(true);
  expect(meta.startsGroup).toBe(true);
});

it('can group a neighborhood sender across pauses without changing direct-message grouping', () => {
 const first=message('10:00'),later=message('10:30');
 expect(chatMessageMeta(later,first,undefined,{groupAcrossPauses:true}).startsGroup).toBe(false);
 expect(chatMessageMeta(later,first).startsGroup).toBe(true);
 expect(chatMessageMeta(message('10:30','chris'),first,undefined,{groupAcrossPauses:true}).startsGroup).toBe(true);
});

it('uses neighborhood sender IDs and legacy direct-message ownership for grouping', () => {
  expect(chatMessageMeta({ createdAt: '2026-10-02T10:01:00', sender: { id: 'sam' } }, { createdAt: '2026-10-02T10:00:00', sender: { id: 'chris' } }).startsGroup).toBe(true);
  expect(chatMessageMeta({ createdAt: '2026-10-02T10:01:00', isOwnMessage: true }, { createdAt: '2026-10-02T10:00:00', isOwnMessage: false }).startsGroup).toBe(true);
});

it('uses Today, Yesterday, short dates, and a year for older conversations', () => {
  const now = new Date('2026-10-02T12:00:00');
  expect(formatChatDay('2026-10-02T08:00:00', now)).toBe('Today');
  expect(formatChatDay('2026-10-01T08:00:00', now)).toBe('Yesterday');
  expect(formatChatDay('2026-09-25T08:00:00', now)).toBe('Sep 25');
  expect(formatChatDay('2025-09-25T08:00:00', now)).toContain('2025');
  expect(formatChatTime('2026-10-02T08:07:00')).toBe('8:07 AM');
  expect(formatChatTime('invalid')).toBe('');
  expect(formatChatDay('invalid', now)).toBe('');
});
