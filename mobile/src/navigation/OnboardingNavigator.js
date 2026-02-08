import { Text } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HapticPressable from '../components/HapticPressable';
import { COLORS } from '../utils/config';

import OnboardingWelcomeScreen from '../screens/onboarding/OnboardingWelcomeScreen';
import OnboardingNeighborhoodScreen from '../screens/onboarding/OnboardingNeighborhoodScreen';
import OnboardingFriendsScreen from '../screens/onboarding/OnboardingFriendsScreen';
import OnboardingPlanScreen from '../screens/onboarding/OnboardingPlanScreen';
import OnboardingCompleteScreen from '../screens/onboarding/OnboardingCompleteScreen';
import SubscriptionScreen from '../screens/SubscriptionScreen';
import IdentityVerificationScreen from '../screens/IdentityVerificationScreen';

const Stack = createNativeStackNavigator();

// Map step number to route name
const STEP_TO_ROUTE = {
  1: 'OnboardingWelcome',
  2: 'OnboardingNeighborhood',
  3: 'OnboardingFriends',
  4: 'OnboardingPlan',
  5: 'OnboardingComplete',
};

export default function OnboardingNavigator({ initialStep = 1 }) {
  const initialRoute = STEP_TO_ROUTE[initialStep] || 'OnboardingWelcome';

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        contentStyle: { backgroundColor: COLORS.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen
        name="OnboardingWelcome"
        component={OnboardingWelcomeScreen}
        options={{ animation: 'fade_from_bottom' }}
      />
      <Stack.Screen
        name="OnboardingNeighborhood"
        component={OnboardingNeighborhoodScreen}
      />
      <Stack.Screen
        name="OnboardingFriends"
        component={OnboardingFriendsScreen}
      />
      <Stack.Screen
        name="OnboardingPlan"
        component={OnboardingPlanScreen}
      />
      <Stack.Screen
        name="OnboardingComplete"
        component={OnboardingCompleteScreen}
        options={{ animation: 'fade_from_bottom' }}
      />
      <Stack.Screen
        name="OnboardingVerification"
        component={IdentityVerificationScreen}
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: COLORS.background },
          headerShadowVisible: false,
          headerTintColor: COLORS.text,
          title: 'Verify Identity',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="OnboardingSubscription"
        component={SubscriptionScreen}
        options={({ navigation: nav }) => ({
          presentation: 'modal',
          gestureEnabled: true,
          headerShown: true,
          headerStyle: { backgroundColor: COLORS.surface },
          headerShadowVisible: false,
          headerTintColor: COLORS.text,
          title: 'BorrowHood Plus',
          headerLeft: () => (
            <HapticPressable onPress={() => nav.goBack()} haptic="light">
              <Text style={{ color: COLORS.primary, fontSize: 17 }}>Close</Text>
            </HapticPressable>
          ),
        })}
      />
    </Stack.Navigator>
  );
}
