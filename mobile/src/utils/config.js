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
  primaryMuted: 'rgba(74, 124, 89, 0.15)',
  secondary: '#6B8F71',
  secondaryMuted: 'rgba(107, 143, 113, 0.15)',
  accent: '#4A7C59',
  warning: '#D4A04A',
  warningMuted: 'rgba(212, 160, 74, 0.15)',
  danger: '#C45C4A',
  dangerMuted: 'rgba(196, 92, 74, 0.15)',
  success: '#4A7C59',
  // Backgrounds
  background: '#0A1A0E',
  surface: '#121F16',
  surfaceElevated: '#1A2B1E',
  card: '#1E2E22',
  cardHover: '#243526',
  // Text colors
  text: '#FFFFFF',
  textSecondary: '#B5C4B8',
  textMuted: '#7A8D7D',
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
    800: '#252F27',
    900: '#1A2A1D',
  },
  // Overlay
  overlay: 'rgba(0, 0, 0, 0.7)',
  overlayLight: 'rgba(0, 0, 0, 0.4)',
};

// Design tokens for consistency
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
};

export const TYPOGRAPHY = {
  h1: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  bodySmall: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  caption: { fontSize: 11, fontWeight: '500', letterSpacing: 0.3 },
  button: { fontSize: 15, fontWeight: '600' },
};
