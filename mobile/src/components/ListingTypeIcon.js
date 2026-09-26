import { Ionicons } from './Icon';
import { listingIcon } from '../utils/listingPresentation';

export default function ListingTypeIcon({ listing, size = 18, ...props }) {
  return <Ionicons {...props} name={listingIcon(listing)} size={size} illustrated />;
}
