import 'react-native-get-random-values';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { AuthProvider } from './src/context/AuthContext';
import { ErrorProvider } from './src/context/ErrorContext';
import RootNavigator from './src/navigation/RootNavigator';
import ThemedAlertHost from './src/components/ThemedAlert';
import { setNavigationRef } from './src/hooks/usePushNotifications';
import ErrorBoundary from './src/components/ErrorBoundary';
import { COLORS } from './src/utils/config';

SplashScreen.preventAutoHideAsync();

const navigationRef = createNavigationContainerRef();
const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: COLORS.primary, background: COLORS.background, card: COLORS.surface,
    text: COLORS.text, border: COLORS.border, notification: COLORS.danger,
  },
};

export default function App() {
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    GoogleSansMedium: require('./assets/brand/GoogleSans-Medium.ttf'),
  });

  if (fontsLoaded) {
    SplashScreen.hideAsync();
  }

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <AuthProvider navigationRef={navigationRef}>
            <NavigationContainer
              theme={navigationTheme}
              ref={navigationRef}
              onReady={() => setNavigationRef(navigationRef)}
            >
              <ErrorProvider navigationRef={navigationRef}>
                <RootNavigator navigationRef={navigationRef} />
                <ThemedAlertHost />
                <StatusBar style="dark" />
              </ErrorProvider>
            </NavigationContainer>
          </AuthProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
