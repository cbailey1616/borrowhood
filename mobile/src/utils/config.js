// Keep legacy payments available in source, disabled for the free launch.
export const ENABLE_PAYMENTS = false;
export const REQUIRE_IDENTITY_VERIFICATION = false;

// `npm run ui` uses the hosted backend for UI review. For a local server,
// set EXPO_PUBLIC_API_URL to the Mac's LAN address before running `npm run dev`.
// Release builds always use the production backend.
const PRODUCTION_BASE = 'https://borrowhood-production.up.railway.app';
const DEV_BASE = 'http://localhost:3001'; // Use localhost for simulator, LAN IP for physical device

export const BASE_URL = (__DEV__
  ? (process.env.EXPO_PUBLIC_API_URL || DEV_BASE)
  : PRODUCTION_BASE).replace(/\/+$/, '');
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
  'cleaning': 'brush-outline',
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
  close_friends: 'Friends',
  neighborhood: 'Neighborhood',
  town: 'Town',
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

// Warm parchment surfaces keep photography and actions in focus. Existing token names
// remain stable so every screen inherits the same visual language.
export const COLORS = {
  primary: '#42594C', primaryDark: '#32483C', primaryLight: '#688566',
  primaryMuted: '#E0E8D8', secondary: '#42594C', secondaryMuted: '#E0E8D8',
  accent: '#875039', accentMuted: '#F1DDD1',
  info: '#526D7A', infoMuted: '#E1E9E8',
  warning: '#946200', warningMuted: '#FFF4DB',
  danger: '#B54242', dangerMuted: '#F6E0DB', success: '#42594C',
  background: '#F3EBDD', surface: '#FBF6EC', surfaceElevated: '#EBE4D6',
  requestSurface: '#EAF0E3',
  card: '#FBF6EC', cardHover: '#F8F1E5',
  text: '#343E35', textSecondary: '#5D6659', textMuted: '#636C5B',
  illustration: { ink: '#42594C', sage: '#A7BF98', clay: '#DEA088', honey: '#DFB66F', mist: '#B8C4C3' },
  chatOwn: '#DEE7D5', chatOwnText: '#343E35',
  greenBg: '#102F2B', greenSurface: '#1B4039',
  greenText: '#F5FAF8', greenTextMuted: '#BACEC8',
  greenBorder: 'rgba(186, 206, 200, 0.20)',
  greenSeparator: 'rgba(186, 206, 200, 0.16)',
  border: '#DBD4C4', borderLight: '#E8E0D2',
  borderGreen: 'rgba(66, 89, 76, 0.18)',
  borderGreenStrong: 'rgba(66, 89, 76, 0.32)',
  // Compatibility aliases for screens that previously used brown dividers.
  borderBrown: '#E8E0D2', borderBrownStrong: '#DBD4C4',
  gray: {
    50: '#F8F1E5', 100: '#F0E7D8', 200: '#E5D9C6', 300: '#D4C7B2',
    400: '#9C9C8B', 500: '#62665A', 600: '#5F6359', 700: '#464E42',
    800: '#343D32', 900: '#292D28',
  },
  overlay: 'rgba(41, 45, 40, 0.48)', overlayLight: 'rgba(41, 45, 40, 0.25)',
  materials: {
    ultraThin: 'rgba(251, 246, 236, 0.35)', thin: 'rgba(251, 246, 236, 0.50)',
    regular: 'rgba(251, 246, 236, 0.65)', thick: 'rgba(251, 246, 236, 0.85)',
    ultraThick: 'rgba(251, 246, 236, 0.95)',
  },
  separator: '#E8E0D2',
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
  md: 14,
  lg: 20,
  xl: 24,
  xxl: 28,
  full: 9999,
};

export const SHADOWS = {
  sm: {
    shadowColor: '#292D28',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.025,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#292D28',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: '#292D28',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.055,
    shadowRadius: 8,
    elevation: 4,
  },
};

export const TYPOGRAPHY = {
  // DM Sans type scale (400=Regular, 500=Medium, 600=SemiBold, 700=Bold)
  largeTitle: { fontSize: 32, fontFamily: 'DMSans_600SemiBold', fontWeight: '600', letterSpacing: -0.6 },
  headline: { fontSize: 17, fontFamily: 'DMSans_600SemiBold', fontWeight: '600', lineHeight: 22 },
  subheadline: { fontSize: 15, fontFamily: 'DMSans_400Regular', fontWeight: '400', lineHeight: 20 },
  footnote: { fontSize: 13, fontFamily: 'DMSans_400Regular', fontWeight: '400', lineHeight: 18 },
  caption1: { fontSize: 12, fontFamily: 'DMSans_400Regular', fontWeight: '400', lineHeight: 16 },
  // Existing aliases (kept for migration)
  h1: { fontSize: 28, fontFamily: 'DMSans_600SemiBold', fontWeight: '600', letterSpacing: -0.5 },
  h2: { fontSize: 22, fontFamily: 'DMSans_600SemiBold', fontWeight: '600', letterSpacing: -0.3 },
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
