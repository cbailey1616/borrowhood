import { groupPendingExchanges, groupRequestNotifications, readActivity } from '../../src/utils/requestActivity';

const request = (id, listing = 'tea', status = 'pending') => ({ id, status, isBorrower: false, listing: { id: listing, title: 'Tea' }, borrower: { id: `person-${id}`, firstName: id }, lender: { id: 'owner' } });
const notice = transaction => ({ id: `n-${transaction.id}`, type: 'giveaway_claim', listingId: transaction.listing.id,
  transactionId: transaction.id, fromUserId: transaction.borrower.id, fromUser: transaction.borrower, isRead: false });

it('groups by item identity and excludes accepted exchanges and the viewer’s outgoing requests', () => {
  const requests = [request('1'), request('2'), request('3', 'other-tea'), request('4', 'tea', 'approved'), { ...request('5'), isBorrower: true, lender: { id: 'other' } }];
  const groups = groupPendingExchanges(requests, 'owner');
  expect(groups.map(item => [item.id, item.requestCount])).toEqual([['queue:tea', 2], ['queue:other-tea', 1], ['4', undefined], ['5', undefined]]);
});

it('counts people still waiting, even when callbacks duplicate alerts or one has been read', () => {
  const requests = [request('1'), request('2')];
  const grouped = groupRequestNotifications([{ ...notice(requests[0]), isRead: true }, notice(requests[1]), { ...notice(requests[1]), id: 'duplicate' }], requests, 'owner');
  expect(grouped).toHaveLength(1);
  expect(grouped[0]).toMatchObject({ title: '2 people requested Tea', requestCount: 2, body: 'See queue', isRead: false, fromUser: null });
  const after = groupRequestNotifications(requests.map(notice), [requests[0], { ...requests[1], status: 'cancelled' }], 'owner');
  expect(after.filter(item => item.queueListingId)).toHaveLength(1);
  expect(after.find(item => item.queueListingId).requestCount).toBe(1);
});

it('preserves the server’s full queue count and marks only its viewed notification IDs', async () => {
  const item = groupRequestNotifications([{ ...notice(request('latest')), title: '12 people requested Tea', listingTitle: 'Tea',
    queueListingId: 'tea', requestCount: 12, notificationIds: ['old', 'latest'] }])[0];
  expect(item.requestCount).toBe(12);
  const api = { markNotificationRead: jest.fn().mockResolvedValue({}) };
  await readActivity(api, item);
  expect(api.markNotificationRead).toHaveBeenCalledTimes(1);
  expect(api.markNotificationRead).toHaveBeenCalledWith('n-latest', ['old', 'latest']);
});
