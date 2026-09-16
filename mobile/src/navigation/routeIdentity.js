// Different entities must have different stack entries. Returning to the same
// entity reuses its existing entry instead of changing another screen's params.
const byId = ({ params }) => params?.id;
export const detailRouteIds = {
  ListingDetail: byId,
  RequestDetail: byId,
  TransactionDetail: byId,
  UserProfile: byId,
  RequestQueue: ({ params }) => params?.listingId,
  Chat: ({ params }) => params?.conversationId
    ? `conversation:${params.conversationId}`
    : params?.recipientId ? `recipient:${params.recipientId}` : undefined,
};
