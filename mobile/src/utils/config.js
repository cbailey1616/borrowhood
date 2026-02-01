// API Configuration
// In production, use environment variables or app config
// API URL - uses production URL, override with DEV_API_URL for local testing
const PRODUCTION_BASE = 'https://borrowhood-production.up.railway.app';
const DEV_BASE = 'http://192.168.7.53:3001'; // Use Mac's IP for physical device testing

export const BASE_URL = __DEV__ ? DEV_BASE : PRODUCTION_BASE;
export const API_URL = `${BASE_URL}/api`;

export const STRIPE_PUBLISHABLE_KEY = 'pk_test_51Svf5v8339pJAGsp3CIJJqnVjq86eIk3TAK4N7yvgCWRybyT6jOgtMhdsiLUgFi5j5qDTGIMBjXEqNmmgjuUx2TQ006j0XBDga';

// App constants
export const CONDITION_LABELS = {
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
  worn: 'Worn',
};

export const VISIBILITY_LABELS = {
  close_friends: 'My Friends',
  neighborhood: 'My Neighborhood',
  town: 'My Town',
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
  // Forest green theme (matching logo)
  primary: '#4A7C59',
  primaryDark: '#3D6B4F',
  primaryLight: '#5A8F6A',
  secondary: '#6B8F71',
  accent: '#4A7C59',
  warning: '#D4A04A',
  danger: '#C45C4A',
  success: '#4A7C59',
  // Backgrounds
  background: '#0D1F12',
  surface: '#162419',
  card: '#1E2E22',
  // Text colors
  text: '#FFFFFF',
  textSecondary: '#A8B5AA',
  textMuted: '#6B7D6E',
  // Gray scale (with green tint)
  gray: {
    50: '#F2F5F3',
    100: '#E0E5E1',
    200: '#C5CFC7',
    300: '#A8B5AA',
    400: '#8A9A8D',
    500: '#6B7D6E',
    600: '#4F5D51',
    700: '#3A4A3D',
    800: '#2A3A2D',
    900: '#1A2A1D',
  },
};
