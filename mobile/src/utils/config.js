// API Configuration
// In production, use environment variables or app config
// API URL - uses production URL, override with DEV_API_URL for local testing
const PRODUCTION_BASE = 'https://borrowhood-production.up.railway.app';
const DEV_BASE = 'http://localhost:3001'; // Use localhost for simulator, LAN IP for physical device

export const BASE_URL = __DEV__ ? DEV_BASE : PRODUCTION_BASE;
export const API_URL = `${BASE_URL}/api`;

// Test key for development, live key for production
const STRIPE_TEST_KEY = 'pk_test_51Svf5n7NWs4o2FyPTSeaiUH8jveT8Gt4owTZNpNEQYpmVEMiBJveqg4ALEujT4O1fJvpSDBZRM68M365qutkDVl000ADk6iFVL';
const STRIPE_LIVE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
export const STRIPE_PUBLISHABLE_KEY = __DEV__ ? STRIPE_TEST_KEY : (STRIPE_LIVE_KEY || STRIPE_TEST_KEY);

// Category icon fallback map (slug → Ionicons name)
export const CATEGORY_ICONS = {
  'tools-hardware': 'hammer-outline',
  'kitchen-cooking': 'restaurant-outline',
  'garden-outdoor': 'leaf-outline',
  'sports-recreation': 'football-outline',
  'electronics-tech': 'laptop-outline',
  'party-events': 'gift-outline',
  'kids-baby': 'happy-outline',
  'camping-travel': 'bonfire-outline',
  'cleaning': 'sparkles-outline',
  'other': 'ellipsis-horizontal-outline',
};

// Feature flags
// TODO: Set to true to re-enable paid subscription tiers
export const ENABLE_PAID_TIERS = false;

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
  pending: 'Awaiting Approval',
  approved: 'Approved',
  paid: 'Ready for Pickup',
  picked_up: 'Currently Borrowed',
  return_pending: 'Return Pending',
  returned: 'Returned',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
};

// Neutral surfaces keep photography and actions in focus. Existing token names
// remain stable so every screen inherits the same visual language.
export const COLORS = {
  primary: '#087F68', primaryDark: '#056451', primaryLight: '#229781',
  primaryMuted: '#E5F4EF', secondary: '#087F68', secondaryMuted: '#E5F4EF',
  accent: '#425CC7', accentMuted: '#EDF0FC',
  warning: '#946200', warningMuted: '#FFF4DB',
  danger: '#C43943', dangerMuted: '#FDECEF', success: '#087F68',
  background: '#F5F7F8', surface: '#FFFFFF', surfaceElevated: '#EDF1F3',
  card: '#FFFFFF', cardHover: '#F8FAFB',
  text: '#18252B', textSecondary: '#52616A', textMuted: '#697780',
  greenBg: '#102F2B', greenSurface: '#1B4039',
  greenText: '#F5FAF8', greenTextMuted: '#BACEC8',
  greenBorder: 'rgba(186, 206, 200, 0.20)',
  greenSeparator: 'rgba(186, 206, 200, 0.16)',
  border: '#DFE6E9', borderLight: '#EDF1F3',
  borderGreen: 'rgba(8, 127, 104, 0.18)',
  borderGreenStrong: 'rgba(8, 127, 104, 0.32)',
  // Compatibility aliases for screens that previously used brown dividers.
  borderBrown: '#E5EAED', borderBrownStrong: '#D5DEE2',
  gray: {
    50: '#F8FAFB', 100: '#F1F4F6', 200: '#E5EAED', 300: '#CCD6DC',
    400: '#94A3AD', 500: '#697780', 600: '#52616A', 700: '#3A4A53',
    800: '#293840', 900: '#18252B',
  },
  overlay: 'rgba(16, 29, 35, 0.65)', overlayLight: 'rgba(16, 29, 35, 0.35)',
  materials: {
    ultraThin: 'rgba(255, 255, 255, 0.35)', thin: 'rgba(255, 255, 255, 0.50)',
    regular: 'rgba(255, 255, 255, 0.65)', thick: 'rgba(255, 255, 255, 0.85)',
    ultraThick: 'rgba(255, 255, 255, 0.95)',
  },
  separator: '#E5EAED',
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
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
};

export const SHADOWS = {
  sm: {
    shadowColor: '#18252B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#18252B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#18252B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
};

export const TYPOGRAPHY = {
  // DM Sans type scale (400=Regular, 500=Medium, 600=SemiBold, 700=Bold)
  largeTitle: { fontSize: 34, fontFamily: 'DMSans_700Bold', fontWeight: '700', letterSpacing: -1 },
  headline: { fontSize: 17, fontFamily: 'DMSans_600SemiBold', fontWeight: '600', lineHeight: 22 },
  subheadline: { fontSize: 15, fontFamily: 'DMSans_400Regular', fontWeight: '400', lineHeight: 20 },
  footnote: { fontSize: 13, fontFamily: 'DMSans_400Regular', fontWeight: '400', lineHeight: 18 },
  caption1: { fontSize: 12, fontFamily: 'DMSans_400Regular', fontWeight: '400', lineHeight: 16 },
  // Existing aliases (kept for migration)
  h1: { fontSize: 28, fontFamily: 'DMSans_700Bold', fontWeight: '700', letterSpacing: -0.8 },
  h2: { fontSize: 22, fontFamily: 'DMSans_700Bold', fontWeight: '700', letterSpacing: -0.6 },
  h3: { fontSize: 18, fontFamily: 'DMSans_600SemiBold', fontWeight: '600' },
  body: { fontSize: 16, fontFamily: 'DMSans_400Regular', fontWeight: '400', lineHeight: 22 },
  bodySmall: { fontSize: 14, fontFamily: 'DMSans_400Regular', fontWeight: '400', lineHeight: 18 },
  caption: { fontSize: 12, fontFamily: 'DMSans_500Medium', fontWeight: '500', letterSpacing: 0.3 },
  button: { fontSize: 16, fontFamily: 'DMSans_600SemiBold', fontWeight: '600' },
};

// Animation presets
export const ANIMATION = {
  spring: {
    default: { damping: 28, stiffness: 300, mass: 0.8 },
    gentle: { damping: 24, stiffness: 120, mass: 0.8 },
    bouncy: { damping: 22, stiffness: 200, mass: 0.7 },
    stiff: { damping: 30, stiffness: 400, mass: 0.8 },
  },
  timing: {
    fast: 150,
    normal: 250,
    slow: 400,
  },
};

// Haptic feedback types
export const HAPTICS = {
  light: 'light',
  medium: 'medium',
  heavy: 'heavy',
  selection: 'selection',
  success: 'success',
  warning: 'warning',
  error: 'error',
};
