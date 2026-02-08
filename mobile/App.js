import 'react-native-get-random-values';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StripeProvider } from '@stripe/stripe-react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { AuthProvider } from './src/context/AuthContext';
import { ErrorProvider } from './src/context/ErrorContext';
import RootNavigator from './src/navigation/RootNavigator';
import { setNavigationRef } from './src/hooks/usePushNotifications';
import ErrorBoundary from './src/components/ErrorBoundary';
import { STRIPE_PUBLISHABLE_KEY } from './src/utils/config';

// Stripe key safety check — runs once at module load
if (STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_')) {
  console.log('⚠️ STRIPE TEST MODE — no real charges will be made');
} else if (STRIPE_PUBLISHABLE_KEY.startsWith('pk_live_')) {
  if (__DEV__) {
    throw new Error(
      '🚨 FATAL: Live Stripe publishable key detected in development build!\n' +
      'Switch to pk_test_ key in src/utils/config.js before running locally.'
    );
  }
  console.log('💳 Stripe LIVE mode — real charges enabled');
}

const navigationRef = createNavigationContainerRef();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <StripeProvider
          publishableKey={STRIPE_PUBLISHABLE_KEY}
          merchantIdentifier="merchant.com.borrowhood.app"
        >
          <SafeAreaProvider>
            <AuthProvider navigationRef={navigationRef}>
              <ErrorProvider navigationRef={navigationRef}>
                <NavigationContainer
                  ref={navigationRef}
                  onReady={() => setNavigationRef(navigationRef)}
                >
                  <RootNavigator />
                  <StatusBar style="light" />
                </NavigationContainer>
              </ErrorProvider>
            </AuthProvider>
          </SafeAreaProvider>
        </StripeProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
