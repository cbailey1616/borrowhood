import { useEffect } from 'react';
import { Settings } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider } from '../src/context/AuthContext';
import { ErrorProvider } from '../src/context/ErrorContext';
import ErrorBoundary from '../src/components/ErrorBoundary';
import ThemedAlertHost from '../src/components/ThemedAlert';
import RootNavigator from '../src/navigation/RootNavigator';
import { COLORS } from '../src/utils/config';

const navigation = createNavigationContainerRef();
const tabs = ['Feed', 'Saved', 'MyItems', 'Activity', 'Profile'];
const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: COLORS.primary, background: COLORS.background, card: COLORS.surface, text: COLORS.text, border: COLORS.border, notification: COLORS.danger } };
const requested = Settings.get('BorrowhoodCaptureScreen') || 'home';
function openCapture() {
  if (!navigation.isReady()) return;
  const selected = { saved: 'Saved', posts: 'MyItems', inbox: 'Activity', profile: 'Profile' }[requested] || 'Feed';
  const main = { name: 'Main', state: { index: tabs.indexOf(selected), routes: tabs.map(name => ({ name })) } };
  const detail = {
    giveaway: { name: 'ListingDetail', params: { id: 'demo-books' } },
    sell: { name: 'ListingDetail', params: { id: 'demo-bike' } },
    chat: { name: 'Chat', params: { conversationId: 'demo-chat' } },
  }[requested];
  navigation.resetRoot({ index: detail ? 1 : 0, routes: detail ? [main, detail] : [main] });
}

export default function CaptureApp() {
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold, GoogleSansMedium: require('../assets/brand/GoogleSans-Medium.ttf') });
  useEffect(() => { if (fontsLoaded) SplashScreen.hideAsync(); }, [fontsLoaded]);
  if (!fontsLoaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ErrorBoundary><SafeAreaProvider><AuthProvider>
        <NavigationContainer ref={navigation} theme={theme} onReady={openCapture}>
          <ErrorProvider navigationRef={navigation}>
            <RootNavigator />
            <ThemedAlertHost />
            <StatusBar style="dark" />
          </ErrorProvider>
        </NavigationContainer>
      </AuthProvider></SafeAreaProvider></ErrorBoundary>
    </GestureHandlerRootView>
  );
}
