import { exchangeIsActive } from './homeAction';
import { isTransferListing } from './directFee';

export function activeLendingExchange(listing, exchanges, userId) {
  const priority = ['return_pending', 'returned', 'disputed', 'picked_up', 'paid', 'approved'];
  return exchanges.filter(exchange => exchange.listing?.id === listing.id
    && (exchange.isBorrower === false || Boolean(userId && exchange.lender?.id === userId))
    && exchange.status !== 'pending' && exchangeIsActive(exchange))
    .sort((a, b) => priority.indexOf(a.status) - priority.indexOf(b.status))[0] || null;
}

export function listingSharingDetails(listing) {
  if (listing.sharingReviewRequired) return { icon: 'lock-closed', label: 'Private · review sharing' };
  const scopes = Array.isArray(listing.visibility) ? listing.visibility : (listing.visibility || 'private').split(',');
  const labels = [['close_friends', 'Friends'], ['neighborhood', 'Neighborhood'], ['town', 'Town']]
    .filter(([scope]) => scopes.includes(scope)).map(([, label]) => label);
  if (scopes.includes('private') || !labels.length) return { icon: 'lock-closed', label: scopes.includes('circle') ? 'Review sharing' : 'Only you' };
  return { icon: scopes.includes('town') ? 'location' : scopes.includes('neighborhood') ? 'home' : 'people', label: labels.join(' · ') };
}

const calendarDate = value => {
  if (!value) return null;
  // The server returns borrowing dates, not a deadline at UTC midnight.
  const part = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return null;
  const date = new Date(`${part}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};
const dateLabel = date => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const dayNumber = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;

export function lendingDetails(exchange, now = new Date()) {
  if (!exchange) return null;
  const waitingForPickup = ['approved', 'paid'].includes(exchange.status) && !exchange.actualPickupAt;
  const name = exchange.borrower?.firstName || 'a neighbor';
  const details = { person: `${waitingForPickup ? 'Pickup with' : 'With'} ${name}`, timing: '', attention: false };
  if (exchange.hasDispute || exchange.status === 'disputed') return { ...details, timing: 'Issue under review' };
  if (exchange.status === 'return_pending' || exchange.status === 'returned') {
    return { ...details, person: `Return from ${name}`, timing: 'Return ready to confirm', attention: true };
  }
  if (waitingForPickup) {
    if (exchange.pickupReview?.needed) return { ...details, timing: 'Check whether it was picked up', attention: true };
    const pickup = !isTransferListing(exchange) && calendarDate(exchange.startDate);
    return { ...details, timing: pickup ? `Pickup ${dateLabel(pickup)}` : 'Ready for pickup' };
  }
  const due = !isTransferListing(exchange) && exchange.status === 'picked_up' && calendarDate(exchange.endDate);
  if (!due) return details;
  const days = dayNumber(due) - dayNumber(now);
  return { ...details, overdue: days < 0, attention: days <= 0,
    timing: days < 0 ? `Overdue · due ${dateLabel(due)}` : days === 0 ? 'Due back today' : days === 1 ? 'Due back tomorrow' : `Due ${dateLabel(due)}` };
}
