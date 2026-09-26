// Feed, listing forms, and exchanges use the same meaning for each drawing.
// Transactions may carry the type at the top level or on the nested listing.
export function listingIcon(listing) {
  const type = listing?.listingType ?? listing?.listing?.listingType;
  return type === 'sell' ? 'pricetag' : type === 'giveaway' ? 'gift' : 'basket';
}
