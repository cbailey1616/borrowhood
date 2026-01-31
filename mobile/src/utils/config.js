// API Configuration
// In production, use environment variables or app config
export const API_URL = __DEV__
  ? 'http://localhost:3001/api'
  : 'https://borrowhood-production.up.railway.app/api';

export const STRIPE_PUBLISHABLE_KEY = 'pk_test_51Svf5v8339pJAGsp3CIJJqnVjq86eIk3TAK4N7yvgCWRybyT6jOgtMhdsiLUgFi5j5qDTGIMBjXEqNmmgjuUx2TQ006j0XBDga';

// App constants
export const CONDITION_LABELS = {
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
  worn: 'Worn',
};

export const VISIBILITY_LABELS = {
  close_friends: 'Close Friends Only',
  neighborhood: 'My Neighborhood',
  town: 'Entire Town',
};

export const TRANSACTION_STATUS_LABELS = {
  pending: 'Pending Approval',
  approved: 'Approved - Payment Required',
  paid: 'Paid - Ready for Pickup',
  picked_up: 'Currently Borrowed',
  return_pending: 'Return Pending',
  returned: 'Returned',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
};

export const COLORS = {
  // Robinhood-inspired green theme
  primary: '#00C805',
  primaryDark: '#00A000',
  primaryLight: '#00E600',
  secondary: '#5AC53A',
  accent: '#00C805',
  warning: '#FFB800',
  danger: '#FF5000',
  success: '#00C805',
  // Backgrounds
  background: '#000000',
  surface: '#1C1C1E',
  card: '#2C2C2E',
  // Text colors
  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  textMuted: '#636366',
  // Gray scale
  gray: {
    50: '#F2F2F7',
    100: '#E5E5EA',
    200: '#D1D1D6',
    300: '#C7C7CC',
    400: '#AEAEB2',
    500: '#8E8E93',
    600: '#636366',
    700: '#48484A',
    800: '#3A3A3C',
    900: '#1C1C1E',
  },
};
