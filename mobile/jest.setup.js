/* eslint-disable no-undef */
/**
 * Jest Setup - Mocks for React Native, Expo, and app-level modules
 */

// Silence console output in tests
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

// ============================================
// React Native Reanimated mock
// ============================================
jest.mock('react-native-reanimated', () => {
  const View = require('react-native').View;

  // Chainable mock for entering/exiting animations
  const chainable = () => {
    const obj = {};
    const methods = ['duration', 'delay', 'springify', 'damping', 'stiffness', 'mass', 'overshootClamping', 'restDisplacementThreshold', 'restSpeedThreshold', 'withInitialValues', 'withCallback', 'build'];
    methods.forEach((m) => { obj[m] = () => obj; });
    return obj;
  };

  return {
    __esModule: true,
    default: {
      View,
      Text: require('react-native').Text,
      Image: require('react-native').Image,
      ScrollView: require('react-native').ScrollView,
      FlatList: require('react-native').FlatList,
      createAnimatedComponent: (comp) => comp,
      addWhitelistedNativeProps: () => {},
      addWhitelistedUIProps: () => {},
    },
    useSharedValue: (init) => ({ value: init }),
    useAnimatedStyle: () => ({}),
    useAnimatedScrollHandler: () => () => {},
    useDerivedValue: (fn) => ({ value: fn() }),
    withSpring: (val) => val,
    withTiming: (val) => val,
    withDelay: (_d, val) => val,
    withSequence: (...vals) => vals[vals.length - 1],
    withRepeat: (val) => val,
    interpolate: (val) => val,
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend' },
    FadeInUp: chainable(),
    FadeInDown: chainable(),
    FadeOutUp: chainable(),
    FadeOutDown: chainable(),
    SlideInUp: chainable(),
    SlideOutUp: chainable(),
    SlideInDown: chainable(),
    SlideOutDown: chainable(),
    Layout: chainable(),
    LinearTransition: chainable(),
    runOnJS: (fn) => fn,
    runOnUI: (fn) => fn,
    Easing: { bezier: () => {}, inOut: () => {}, ease: 'ease', linear: 'linear', quad: 'quad' },
    createAnimatedComponent: (comp) => comp,
  };
});

// ============================================
// Expo module mocks
// ============================================
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-blur', () => ({
  BlurView: ({ children, ...props }) => {
    const View = require('react-native').View;
    return require('react').createElement(View, props, children);
  },
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({ coords: { latitude: 42.36, longitude: -71.06 } }),
  reverseGeocodeAsync: jest.fn().mockResolvedValue([{ city: 'Boston', region: 'MA' }]),
  geocodeAsync: jest.fn().mockResolvedValue([{ latitude: 42.36, longitude: -71.06 }]),
}));

jest.mock('expo-contacts', () => ({
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getContactsAsync: jest.fn().mockResolvedValue({ data: [] }),
  Fields: { PhoneNumbers: 'phoneNumbers' },
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[test]' }),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock('expo-device', () => ({
  isDevice: true,
  deviceName: 'Test Device',
}));

jest.mock('expo-sms', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  sendSMSAsync: jest.fn().mockResolvedValue({ result: 'sent' }),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
  getStringAsync: jest.fn().mockResolvedValue(''),
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(false),
  isEnrolledAsync: jest.fn().mockResolvedValue(false),
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
  supportedAuthenticationTypesAsync: jest.fn().mockResolvedValue([]),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2 },
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid-1234'),
}));

jest.mock('expo-camera', () => ({
  Camera: 'Camera',
  useCameraPermissions: jest.fn(() => [{ granted: false }, jest.fn()]),
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
}));

jest.mock('expo-font', () => ({
  useFonts: jest.fn(() => [true]),
  loadAsync: jest.fn(),
  isLoaded: jest.fn(() => true),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: 'StatusBar',
}));

// ============================================
// Icon / vector-icons mock
// ============================================
jest.mock('@expo/vector-icons', () => {
  const Text = require('react-native').Text;
  return {
    Ionicons: Text,
    MaterialIcons: Text,
    FontAwesome: Text,
    Feather: Text,
    createIconSet: () => Text,
  };
});

// ============================================
// Third-party native module mocks
// ============================================
jest.mock('react-native-gesture-handler', () => {
  const View = require('react-native').View;
  return {
    Swipeable: View,
    DrawerLayout: View,
    State: {},
    ScrollView: require('react-native').ScrollView,
    Slider: View,
    Switch: View,
    TextInput: require('react-native').TextInput,
    ToolbarAndroid: View,
    ViewPagerAndroid: View,
    DrawerLayoutAndroid: View,
    WebView: View,
    NativeViewGestureHandler: View,
    TapGestureHandler: View,
    FlingGestureHandler: View,
    ForceTouchGestureHandler: View,
    LongPressGestureHandler: View,
    PanGestureHandler: View,
    PinchGestureHandler: View,
    RotationGestureHandler: View,
    RawButton: View,
    BaseButton: View,
    RectButton: View,
    BorderlessButton: View,
    FlatList: require('react-native').FlatList,
    gestureHandlerRootHOC: jest.fn((comp) => comp),
    Directions: {},
    GestureHandlerRootView: View,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-screens', () => ({
  enableScreens: jest.fn(),
}));

jest.mock('@gorhom/bottom-sheet', () => {
  const View = require('react-native').View;
  return {
    __esModule: true,
    default: View,
    BottomSheetView: View,
    BottomSheetBackdrop: View,
    BottomSheetTextInput: require('react-native').TextInput,
    BottomSheetFlatList: require('react-native').FlatList,
    BottomSheetScrollView: require('react-native').ScrollView,
  };
});

jest.mock('@stripe/stripe-react-native', () => {
  const View = require('react-native').View;
  return {
    StripeProvider: ({ children }) => children,
    useStripe: () => ({
      initPaymentSheet: jest.fn().mockResolvedValue({}),
      presentPaymentSheet: jest.fn().mockResolvedValue({}),
      confirmSetupIntent: jest.fn().mockResolvedValue({}),
    }),
    usePaymentSheet: () => ({
      initPaymentSheet: jest.fn().mockResolvedValue({}),
      presentPaymentSheet: jest.fn().mockResolvedValue({}),
      loading: false,
    }),
    useConfirmSetupIntent: () => ({
      confirmSetupIntent: jest.fn().mockResolvedValue({}),
    }),
    usePlatformPay: () => ({
      isPlatformPaySupported: jest.fn().mockResolvedValue(false),
      confirmPlatformPaySetupIntent: jest.fn().mockResolvedValue({}),
    }),
    CardField: View,
    PlatformPayButton: View,
    PlatformPay: { ButtonType: { SetUp: 0 }, ButtonStyle: { Black: 0 } },
  };
});

jest.mock('@stripe/stripe-identity-react-native', () => ({
  useIdentityVerificationSheet: () => ({
    present: jest.fn().mockResolvedValue({ status: 'FlowCompleted' }),
    loading: false,
  }),
  presentIdentityVerificationSheet: jest.fn().mockResolvedValue({ status: 'FlowCompleted' }),
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn().mockResolvedValue({ idToken: 'mock-google-token' }),
  },
}));

jest.mock('react-native-confetti-cannon', () => 'ConfettiCannon');

jest.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: require('react-native').ScrollView,
}));

jest.mock('react-native-webview', () => 'WebView');

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

// ============================================
// React Navigation mock
// ============================================
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
    getParent: () => ({ setOptions: jest.fn() }),
  }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: jest.fn((cb) => {
    // Defer like useEffect so const functions are available
    require('react').useEffect(() => { const cleanup = cb(); return cleanup; }, []);
  }),
  useIsFocused: () => true,
}));

// ============================================
// App-level mocks
// ============================================
jest.mock('./src/services/api', () => ({
  __esModule: true,
  default: {
    setAuthToken: jest.fn(),
    // Auth
    login: jest.fn(),
    register: jest.fn(),
    getMe: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    loginWithGoogle: jest.fn(),
    loginWithApple: jest.fn(),
    // Users
    getUser: jest.fn(),
    updateProfile: jest.fn(),
    getFriends: jest.fn().mockResolvedValue([]),
    addFriend: jest.fn(),
    removeFriend: jest.fn(),
    getFriendRequests: jest.fn().mockResolvedValue([]),
    acceptFriendRequest: jest.fn(),
    declineFriendRequest: jest.fn(),
    searchUsers: jest.fn().mockResolvedValue([]),
    matchContacts: jest.fn().mockResolvedValue([]),
    getUserRatings: jest.fn().mockResolvedValue([]),
    getUserListings: jest.fn().mockResolvedValue([]),
    // Communities
    getCommunities: jest.fn().mockResolvedValue([]),
    getCommunity: jest.fn(),
    joinCommunity: jest.fn(),
    leaveCommunity: jest.fn(),
    getCommunityMembers: jest.fn().mockResolvedValue([]),
    createCommunity: jest.fn(),
    // Listings
    getListings: jest.fn().mockResolvedValue([]),
    getMyListings: jest.fn().mockResolvedValue([]),
    getListing: jest.fn(),
    createListing: jest.fn(),
    updateListing: jest.fn(),
    deleteListing: jest.fn(),
    analyzeListingImage: jest.fn(),
    // Transactions
    getTransactions: jest.fn().mockResolvedValue([]),
    getTransaction: jest.fn(),
    createTransaction: jest.fn(),
    approveTransaction: jest.fn(),
    declineTransaction: jest.fn(),
    confirmPayment: jest.fn(),
    confirmPickup: jest.fn(),
    confirmReturn: jest.fn(),
    rateTransaction: jest.fn(),
    // Notifications
    getNotifications: jest.fn().mockResolvedValue({ notifications: [], unreadCount: 0 }),
    markNotificationRead: jest.fn(),
    markAllNotificationsRead: jest.fn(),
    updatePushToken: jest.fn(),
    getBadgeCount: jest.fn().mockResolvedValue({ messages: 0, notifications: 0, actions: 0, total: 0 }),
    // Messages
    getConversations: jest.fn().mockResolvedValue([]),
    getConversation: jest.fn(),
    sendMessage: jest.fn(),
    markConversationRead: jest.fn(),
    // Requests
    getRequests: jest.fn().mockResolvedValue([]),
    getMyRequests: jest.fn().mockResolvedValue([]),
    getRequest: jest.fn(),
    createRequest: jest.fn(),
    updateRequest: jest.fn(),
    deleteRequest: jest.fn(),
    // Saved
    getSavedListings: jest.fn().mockResolvedValue([]),
    saveListing: jest.fn(),
    unsaveListing: jest.fn(),
    checkSaved: jest.fn().mockResolvedValue({ saved: false }),
    // Feed
    getFeed: jest.fn().mockResolvedValue({ items: [], hasMore: false }),
    // Categories
    getCategories: jest.fn().mockResolvedValue([]),
    // Subscriptions
    getCurrentSubscription: jest.fn(),
    createSubscription: jest.fn(),
    cancelSubscription: jest.fn(),
    reactivateSubscription: jest.fn(),
    checkSubscriptionAccess: jest.fn(),
    // Payment methods
    getPaymentMethods: jest.fn().mockResolvedValue([]),
    addPaymentMethod: jest.fn(),
    removePaymentMethod: jest.fn(),
    setDefaultPaymentMethod: jest.fn(),
    // Disputes
    getDisputes: jest.fn().mockResolvedValue([]),
    getDispute: jest.fn(),
    // Discussions
    getDiscussions: jest.fn().mockResolvedValue({ discussions: [], count: 0 }),
    // Referrals
    getReferralCode: jest.fn().mockResolvedValue({ referralCode: '' }),
    getReferralStatus: jest.fn().mockResolvedValue({ referralCount: 0, eligible: false, rewardClaimed: false }),
    claimReferralReward: jest.fn(),
    // Identity
    startIdentityVerification: jest.fn(),
    checkVerification: jest.fn(),
    // Uploads
    uploadImage: jest.fn().mockResolvedValue('https://test.s3.amazonaws.com/test.jpg'),
    uploadImages: jest.fn().mockResolvedValue(['https://test.s3.amazonaws.com/test.jpg']),
    getPresignedUrl: jest.fn(),
    // Onboarding
    updateOnboardingStep: jest.fn(),
    completeOnboarding: jest.fn(),
    // Connect
    getConnectStatus: jest.fn().mockResolvedValue(null),
    createConnectAccount: jest.fn(),
    getConnectOnboardingLink: jest.fn(),
    getConnectBalance: jest.fn().mockResolvedValue({ available: 0, pending: 0 }),
    // Rental methods
    approveRental: jest.fn(),
    declineRental: jest.fn(),
    confirmRentalPickup: jest.fn(),
    confirmRentalReturn: jest.fn(),
    confirmRentalPayment: jest.fn(),
    fileDamageClaim: jest.fn(),
    submitDamageClaim: jest.fn(),
    chargeLateF: jest.fn(),
    createLateFee: jest.fn(),
    getRentalPaymentStatus: jest.fn(),
    // Community extras
    getNearbyCommunities: jest.fn().mockResolvedValue([]),
    getNearbyNeighborhoods: jest.fn().mockResolvedValue([]),
    getSuggestedUsers: jest.fn().mockResolvedValue([]),
    updateCommunity: jest.fn(),
    deleteCommunity: jest.fn(),
    // Sustainability / Badges / Bundles / Circles
    getSustainabilityStats: jest.fn().mockResolvedValue({ itemsBorrowed: 0, itemsLent: 0, co2Saved: 0, moneySaved: 0 }),
    getSustainabilityCommunity: jest.fn().mockResolvedValue({ totalItems: 0, totalTransactions: 0 }),
    getCommunitySustainability: jest.fn().mockResolvedValue({ name: 'Community', memberCount: 0, totalTransactions: 0, totalSavedCents: 0, totalCo2SavedKg: 0 }),
    getBadges: jest.fn().mockResolvedValue([]),
    getAllBadges: jest.fn().mockResolvedValue([]),
    getMyBadges: jest.fn().mockResolvedValue([]),
    getUserBadges: jest.fn().mockResolvedValue([]),
    getBadgesLeaderboard: jest.fn().mockResolvedValue([]),
    getLeaderboard: jest.fn().mockResolvedValue([]),
    checkBadges: jest.fn().mockResolvedValue([]),
    getBundles: jest.fn().mockResolvedValue([]),
    getMyBundles: jest.fn().mockResolvedValue([]),
    createBundle: jest.fn(),
    deleteBundle: jest.fn(),
    getCircles: jest.fn().mockResolvedValue([]),
    getCircle: jest.fn(),
    createCircle: jest.fn(),
    inviteToCircle: jest.fn(),
    joinCircle: jest.fn(),
    leaveCircle: jest.fn(),
    getSeasonalSuggestions: jest.fn().mockResolvedValue([]),
    getSeasonalFeatured: jest.fn().mockResolvedValue([]),
    // Library
    getLibrary: jest.fn().mockResolvedValue([]),
    donateToLibrary: jest.fn(),
    checkoutLibraryItem: jest.fn(),
    returnLibraryItem: jest.fn(),
    // Discussion extras
    getDiscussionReplies: jest.fn().mockResolvedValue([]),
    createDiscussion: jest.fn(),
    deleteDiscussion: jest.fn(),
    // Subscription extras
    getSubscriptionTiers: jest.fn().mockResolvedValue([]),
    retrySubscriptionPayment: jest.fn(),
    createPaymentIntent: jest.fn(),
    refundPayment: jest.fn(),
    // Identity extras
    getIdentityStatus: jest.fn(),
    getVerificationStatus: jest.fn().mockResolvedValue({ status: 'none' }),
    createVerificationSession: jest.fn().mockResolvedValue({ sessionId: 'vs_test', ephemeralKeySecret: 'ek_test' }),
    // Notification preferences
    getNotificationPreferences: jest.fn().mockResolvedValue({
      borrowRequests: true,
      messages: true,
      friendRequests: true,
      communityUpdates: true,
      marketing: false,
    }),
    updateNotificationPreferences: jest.fn(),
    // Request extras
    renewRequest: jest.fn(),
    // Dispute extras
    submitDisputeEvidence: jest.fn(),
    resolveDispute: jest.fn(),
  },
}));

jest.mock('./src/utils/haptics', () => ({
  haptics: {
    light: jest.fn(),
    medium: jest.fn(),
    heavy: jest.fn(),
    selection: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('./src/hooks/usePushNotifications', () => jest.fn(() => {}));

jest.mock('./src/hooks/useBiometrics', () =>
  jest.fn(() => ({
    isBiometricsAvailable: false,
    isBiometricsEnabled: false,
    biometricType: null,
    enableBiometrics: jest.fn(),
    disableBiometrics: jest.fn(),
    refreshBiometrics: jest.fn(),
  }))
);
