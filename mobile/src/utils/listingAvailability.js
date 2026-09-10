import { isSaleListing, isTransferListing } from './directFee';

export function listingAvailability(listing) {
  const state = listing.availabilityStatus || (listing.status === 'given_away'
    ? (isSaleListing(listing) ? 'sold' : 'given_away') : listing.status === 'paused' ? 'paused'
    : listing.isBorrowed ? 'borrowed' : listing.isAvailable === false ? 'unavailable' : 'available');
  const states = {
    available: { label: isSaleListing(listing) ? 'For sale' : isTransferListing(listing) ? 'Free to keep' : 'Available to borrow', detail: '', available: true },
    reserved: { label: 'Reserved', detail: 'Someone’s request was accepted. Pickup is being arranged.' },
    borrowed: { label: 'Borrowed', detail: 'This item is with a borrower. It is not available for a new request yet.' },
    paused: { label: 'Paused', detail: 'The owner has paused this listing. It is not accepting requests.' },
    sold: { label: 'Sold', detail: 'This item has been sold. It is no longer accepting requests.' },
    given_away: { label: 'Given away', detail: 'This item has found a new home. It is no longer accepting requests.' },
    unavailable: { label: 'Not available right now', detail: 'This item is not accepting requests. You can ask the owner about future availability.' },
  };
  return { state, available: false, ...(states[state] || states.unavailable) };
}
