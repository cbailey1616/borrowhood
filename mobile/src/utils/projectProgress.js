const LABELS = {pending:'Waiting for approval',approved:'Ready for pickup',paid:'Ready for pickup',picked_up:'Borrowing now',return_pending:'Return awaiting confirmation',returned:'Returned',completed:'Exchange complete',cancelled:'Request cancelled',declined:'Request declined',expired:'Request expired',disputed:'Issue under review'};
export function projectItemState(item) {
  const status=item.transactionStatus;
  if(item.transactionId) return {label:LABELS[status] || 'View exchange', covered:['approved','paid','picked_up'].includes(status), waiting:status==='pending', ended:['cancelled','declined','expired','returned','completed'].includes(status)};
  const count = item.nearbyCount ?? item.matches?.length ?? 0;
  const more = item.nearbyHasMore ?? (item.nearbyCount == null && count >= 12);
  return {label:item.owned?'Already have it':count?`${count}${more ? '+' : ''} nearby`:'No nearby items yet',covered:!!item.owned,waiting:false};
}
export function projectProgress(items=[]) {
  const states=items.map(projectItemState);
  return {covered:states.filter(i=>i.covered).length,waiting:states.filter(i=>i.waiting).length,total:items.length};
}
