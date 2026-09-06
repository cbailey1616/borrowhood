// A browser review surface using the actual app screens and local sample data.
// App.js remains the native entry point; api.web.js has no live backend access.
import { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { AuthProvider } from './src/context/AuthContext';
import { ErrorProvider } from './src/context/ErrorContext';
import ErrorBoundary from './src/components/ErrorBoundary';
import MainNavigator from './src/navigation/MainNavigator';
import ChatScreen from './src/screens/ChatScreen';
import ConversationsScreen from './src/screens/ConversationsScreen';
import ListingDetailScreen from './src/screens/ListingDetailScreen';
import UserBadges, { getTier, RankEmblem } from './src/components/UserBadges';
import Icon from './src/components/Icon';
import WoodlandIllustration from './src/components/WoodlandIllustration';
import { BORROWHOOD_SCENES } from './src/assets/borrowhood-illustrations';
import { BORROWHOOD_ICON_NAMES } from './src/assets/borrowhood-icons';
import { COLORS, TYPOGRAPHY } from './src/utils/config';

const Stack = createNativeStackNavigator();
const query = new URLSearchParams(window.location.search);
const choices = [['Main', 'App screens'], ['Chat', 'Chat'], ['Ranks', 'Woodland ranks'], ['Artwork', 'Woodland artwork'], ['Icons', 'All icons']];

function Artwork() {
  return <ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={{ padding: 24, gap: 24 }}>
    {BORROWHOOD_SCENES.map(scene => <View key={scene} style={{ alignItems: 'center', padding: 16, borderRadius: 24, backgroundColor: COLORS.surface }}><WoodlandIllustration scene={scene} width={260} /><Text style={{ ...TYPOGRAPHY.body, color: COLORS.textSecondary }}>{scene}</Text></View>)}
  </ScrollView>;
}

function Ranks() {
  return <ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={{ padding: 24, gap: 16 }}>
    <Text style={{ ...TYPOGRAPHY.h2, color: COLORS.text }}>A little more Borrowhood</Text>
    <Text style={{ ...TYPOGRAPHY.body, color: COLORS.textSecondary }}>Five original woodland emblems, growing with your community activity.</Text>
    {[0, 3, 11, 31, 76].map(count => {
      const tier = getTier(count);
      return <View key={tier.key} style={{ padding: 18, borderRadius: 20, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLight }}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <RankEmblem tier={tier} size={52} />
          <View style={{ flex: 1 }}><Text style={{ ...TYPOGRAPHY.headline, color: COLORS.text }}>{tier.label}</Text><Text style={{ ...TYPOGRAPHY.caption1, color: COLORS.textSecondary }}>{tier.description}</Text></View>
        </View>
        <UserBadges totalTransactions={count} />
      </View>;
    })}
  </ScrollView>;
}

function Icons() {
  return <ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={{ padding: 16 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {BORROWHOOD_ICON_NAMES.map(name => <View key={name} style={{ width: '30%', minHeight: 104, padding: 10, alignItems: 'center', gap: 8, borderRadius: 16, backgroundColor: COLORS.surface }}>
        <Icon name={name} size={40} illustrated /><Text style={{ fontSize: 11, color: COLORS.textSecondary, textAlign: 'center' }}>{name}</Text>
      </View>)}
    </View>
  </ScrollView>;
}

function PreviewApp() {
  const initialRouteName = choices.some(([key]) => key === query.get('screen')) ? query.get('screen') : 'Main';
  const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: COLORS.primary, background: COLORS.background, card: COLORS.surface, text: COLORS.text, border: COLORS.border } };
  return <GestureHandlerRootView style={{ flex: 1 }}><ErrorBoundary><SafeAreaProvider><AuthProvider>
    <NavigationContainer theme={theme} onUnhandledAction={() => window.alert('This screen needs the iPhone app. You can review the main tabs, listing details, chat, icons, and ranks here.')}>
      <ErrorProvider>
        <Stack.Navigator initialRouteName={initialRouteName} screenOptions={{ headerTintColor: COLORS.primary, headerStyle: { backgroundColor: COLORS.surface }, headerShadowVisible: false, contentStyle: { backgroundColor: COLORS.background } }}>
          <Stack.Screen name="Main" component={MainNavigator} options={{ headerShown: false }} />
          <Stack.Screen name="Chat" component={ChatScreen} initialParams={{ conversationId: 'preview-chat' }} options={{ title: 'Chat' }} />
          <Stack.Screen name="Conversations" component={ConversationsScreen} options={{ title: 'Messages' }} />
          <Stack.Screen name="ListingDetail" component={ListingDetailScreen} options={{ title: 'Item details' }} />
          <Stack.Screen name="Ranks" component={Ranks} options={{ title: 'Borrowhood ranks' }} />
          <Stack.Screen name="Artwork" component={Artwork} options={{ title: 'Woodland artwork' }} />
          <Stack.Screen name="Icons" component={Icons} options={{ title: 'Borrowhood icons' }} />
        </Stack.Navigator>
        <ThemedAlertHost />
      </ErrorProvider>
    </NavigationContainer>
  </AuthProvider></SafeAreaProvider></ErrorBoundary></GestureHandlerRootView>;
}

export default function App() {
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold });
  const [screen, setScreen] = useState('Main');
  const [empty, setEmpty] = useState(false);
  const [revision, setRevision] = useState(0);
  if (!fontsLoaded) return null;
  if (query.has('frame')) return <PreviewApp />;
  const button = active => ({ padding: '12px 17px', borderRadius: 12, border: '1px solid #D7CBB9', background: active ? '#42594C' : '#FBF6EC', color: active ? '#fff' : '#42594C', cursor: 'pointer', font: 'inherit', fontSize: 14 });
  return <div style={{ minHeight: '100vh', boxSizing: 'border-box', padding: '24px 20px', background: COLORS.background, color: COLORS.text, fontFamily: 'DMSans_400Regular, sans-serif' }}>
    <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', gap: 36, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start' }}>
      <aside style={{ flex: '1 1 250px', maxWidth: 340, paddingTop: 18 }}>
        <p style={{ color: '#5C725E', fontSize: 13 }}>BORROWHOOD · LOCAL PREVIEW · UI 04</p>
        <h1 style={{ fontSize: 36, letterSpacing: -1.2, lineHeight: 1.12 }}>Make yourself<br />at home.</h1>
        <p style={{ color: '#6D7065', lineHeight: 1.7 }}>Review the app’s real screens on your Mac. Changes appear here as we work.</p>
        <nav aria-label="Preview sections" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '24px 0' }}>{choices.map(([key, label]) => <button key={key} style={button(screen === key)} onClick={() => setScreen(key)}>{label}</button>)}</nav>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}><input type="checkbox" checked={empty} onChange={event => setEmpty(event.target.checked)} />Show empty states</label>
        <p style={{ fontSize: 13, color: '#6D7065', lineHeight: 1.7, marginTop: 24 }}>Sample people and items. Messages stay in this preview. Sign-in, camera, notifications, and borrowing still need an iPhone check.</p>
        <button style={button(false)} onClick={() => setRevision(value => value + 1)}>Reset preview</button>
      </aside>
      <iframe key={`${screen}-${empty}-${revision}`} title="Borrowhood app preview" src={`?frame=1&screen=${screen}${empty ? '&empty=1' : ''}`} style={{ width: 393, maxWidth: '100%', height: 'calc(100vh - 52px)', minHeight: 650, maxHeight: 880, background: COLORS.background, border: '1px solid #D7CBB9', borderRadius: 26, boxShadow: '0 16px 50px #6C614522' }} />
    </div>
  </div>;
}
import ThemedAlertHost from './src/components/ThemedAlert';
