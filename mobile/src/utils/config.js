// API Configuration
// In production, use environment variables or app config
// API URL - uses production URL, override with DEV_API_URL for local testing
const PRODUCTION_BASE = 'https://borrowhood-production.up.railway.app';
const DEV_BASE = 'http://192.168.7.53:3001'; // Use Mac's IP for physical device testing

// Switch to PRODUCTION_BASE for App Store release
// TODO: revert to DEV_BASE for local development
export const BASE_URL = PRODUCTION_BASE;
export const API_URL = `${BASE_URL}/api`;

// SWITCH TO LIVE KEYS ONLY FOR APP STORE RELEASE
export const STRIPE_PUBLISHABLE_KEY = 'pk_test_51Svf5n7NWs4o2FyPTSeaiUH8jveT8Gt4owTZNpNEQYpmVEMiBJveqg4ALEujT4O1fJvpSDBZRM68M365qutkDVl000ADk6iFVL';

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

export const COLORS = {
  // Parchment & Ink theme with forest green accents
  primary: '#2D5A27',
  primaryDark: '#1E4A1A',
  primaryLight: '#4A7C44',
  primaryMuted: 'rgba(45, 90, 39, 0.12)',
  secondary: '#4A7C44',
  secondaryMuted: 'rgba(74, 124, 68, 0.12)',
  accent: '#8B4513',
  accentMuted: 'rgba(139, 69, 19, 0.08)',
  warning: '#B8860B',
  warningMuted: 'rgba(184, 134, 11, 0.12)',
  danger: '#A03030',
  dangerMuted: 'rgba(160, 48, 48, 0.12)',
  success: '#2D5A27',
  // Backgrounds
  background: '#F5ECD7',
  surface: '#F0E6CE',
  surfaceElevated: '#EDE3CC',
  card: '#FFF8E7',
  cardHover: '#FFF3D9',
  // Text colors
  text: '#2C1810',
  textSecondary: '#6B5744',
  textMuted: '#9C8B78',
  // Green accent block colors (for pricing cards, CTAs, profile hero, banners)
  greenBg: '#0F2415',
  greenSurface: '#162E1C',
  greenText: '#E0E5E1',
  greenTextMuted: '#8A9A8D',
  greenBorder: 'rgba(74, 124, 89, 0.35)',
  greenSeparator: 'rgba(122, 141, 125, 0.25)',
  // Border system — key to preventing "everything blurs together"
  border: '#C4AD82',
  borderLight: '#D4C5A9',
  borderGreen: 'rgba(45, 90, 39, 0.25)',
  borderGreenStrong: 'rgba(45, 90, 39, 0.4)',
  borderBrown: 'rgba(139, 69, 19, 0.2)',
  borderBrownStrong: 'rgba(139, 69, 19, 0.35)',
  // Gray scale (warm parchment tones)
  gray: {
    50: '#FDFAF2', 100: '#F5ECD7', 200: '#E8DCBF', 300: '#D4C5A9',
    400: '#B8A88E', 500: '#9C8B78', 600: '#7A6B5A', 700: '#5C4E3E',
    800: '#3E3428', 900: '#2C1810',
  },
  // Overlay
  overlay: 'rgba(44, 24, 16, 0.7)',
  overlayLight: 'rgba(44, 24, 16, 0.4)',
  // Materials — translucency levels for blur card backgrounds
  materials: {
    ultraThin: 'rgba(245, 236, 215, 0.35)',
    thin: 'rgba(245, 236, 215, 0.50)',
    regular: 'rgba(245, 236, 215, 0.65)',
    thick: 'rgba(245, 236, 215, 0.80)',
    ultraThick: 'rgba(245, 236, 215, 0.90)',
  },
  // iOS-style thin divider
  separator: 'rgba(139, 69, 19, 0.15)',
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
    shadowColor: '#2C1810',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#2C1810',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#2C1810',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
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
  body: { fontSize: 15, fontFamily: 'DMSans_400Regular', fontWeight: '400', lineHeight: 22 },
  bodySmall: { fontSize: 13, fontFamily: 'DMSans_400Regular', fontWeight: '400', lineHeight: 18 },
  caption: { fontSize: 11, fontFamily: 'DMSans_500Medium', fontWeight: '500', letterSpacing: 0.3 },
  button: { fontSize: 15, fontFamily: 'DMSans_600SemiBold', fontWeight: '600' },
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
