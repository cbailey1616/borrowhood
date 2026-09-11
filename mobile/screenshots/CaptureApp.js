import { useEffect, useRef, useState } from 'react';
import { Settings, ScrollView, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider } from '../src/context/AuthContext';
import { ErrorProvider } from '../src/context/ErrorContext';
import ErrorBoundary from '../src/components/ErrorBoundary';
import ThemedAlertHost from '../src/components/ThemedAlert';
import ExchangeEndorsement from '../src/components/ExchangeEndorsement';
import RankInfoSheet from '../src/components/RankInfoSheet';
import AppTextInput from '../src/components/AppTextInput';
import { user } from './fixtures';
import api from '../src/services/api';
import RootNavigator from '../src/navigation/RootNavigator';
import { COLORS, TYPOGRAPHY } from '../src/utils/config';

const navigation = createNavigationContainerRef();
const tabs = ['Feed', 'Saved', 'MyItems', 'Activity', 'Profile'];
const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: COLORS.primary, background: COLORS.background, card: COLORS.surface, text: COLORS.text, border: COLORS.border, notification: COLORS.danger } };
const requested = Settings.get('BorrowhoodCaptureScreen') || 'home';
const ReviewStack = createNativeStackNavigator();
function FeedbackCapture() {
  const [endorsement, setEndorsement] = useState({ canRate: true });
  return <ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={{ padding: 16 }}>
    <Text style={{ ...TYPOGRAPHY.headline, color: COLORS.primary }}>Cordless drill · Returned</Text>
    <ExchangeEndorsement transaction={{ id: 'demo-exchange', endorsement }} onSaved={async () => setEndorsement((await api.getTransaction('demo-exchange')).endorsement)} />
  </ScrollView>;
}
function KeyboardCapture() {
  const numberKeyboard = requested === 'keyboard-number';
  const [text, setText] = useState(numberKeyboard ? '12.50' : 'Could I pick it up tomorrow?');
  const input = useRef(null);
  useEffect(() => {
    if (!numberKeyboard) return;
    const timer = setTimeout(() => input.current?.focus(), 1000);
    return () => clearTimeout(timer);
  }, [numberKeyboard]);
  return <ScrollView style={{ backgroundColor: COLORS.background }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20 }}>
    <Text style={{ ...TYPOGRAPHY.headline, color: COLORS.primary, marginBottom: 12 }}>{numberKeyboard ? 'Price' : 'Your message'}</Text>
    <AppTextInput ref={input} autoFocus={!numberKeyboard} multiline={!numberKeyboard} keyboardType={numberKeyboard ? 'decimal-pad' : 'default'} value={text} onChangeText={setText}
      style={{ ...TYPOGRAPHY.body, minHeight: 100, padding: 16, borderWidth: 1, borderColor: COLORS.borderBrown, borderRadius: 14, color: COLORS.text, backgroundColor: COLORS.card }} />
  </ScrollView>;
}
function openCapture() {
  if (!navigation.isReady() || ['feedback', 'keyboard', 'keyboard-number'].includes(requested)) return;
  const selected = { saved: 'Saved', posts: 'MyItems', inbox: 'Activity', profile: 'Profile', ranks: 'Profile' }[requested] || 'Feed';
  const main = { name: 'Main', state: { index: tabs.indexOf(selected), routes: tabs.map(name => ({ name })) } };
  const detail = {
    giveaway: { name: 'ListingDetail', params: { id: 'demo-books' } },
    sell: { name: 'ListingDetail', params: { id: 'demo-bike' } },
    chat: { name: 'Chat', params: { conversationId: 'demo-chat' } },
    notifications: { name: 'NotificationSettings' },
    'member-profile': { name: 'UserProfile', params: { id: 'demo-jamie' } },
    'pending-exchange': { name: 'TransactionDetail', params: { id: 'demo-pending-exchange' } },
    'reserved-item': { name: 'ListingDetail', params: { id: 'demo-drill' } },
    'request-queue': { name: 'RequestQueue', params: { listingId: 'demo-plants' } },
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
            {['feedback', 'keyboard', 'keyboard-number'].includes(requested) ? <ReviewStack.Navigator screenOptions={{ headerStyle: { backgroundColor: COLORS.background }, headerTintColor: COLORS.primary }}>
              <ReviewStack.Screen name="ComponentPreview" component={requested.startsWith('keyboard') ? KeyboardCapture : FeedbackCapture} options={{ title: requested === 'keyboard-number' ? 'Post an item' : requested === 'keyboard' ? 'Message neighbor' : 'Exchange feedback' }} />
            </ReviewStack.Navigator> : <RootNavigator />}
            {requested === 'ranks' && <RankInfoSheet isVisible onClose={() => {}} score={user.endorsement.score} />}
            <ThemedAlertHost />
            <StatusBar style="dark" />
          </ErrorProvider>
        </NavigationContainer>
      </AuthProvider></SafeAreaProvider></ErrorBoundary>
    </GestureHandlerRootView>
  );
}
