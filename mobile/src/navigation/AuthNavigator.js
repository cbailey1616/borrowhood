import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { COLORS } from '../utils/config';
import useReduceMotion from '../hooks/useReduceMotion';
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import FindAccountScreen from '../screens/auth/FindAccountScreen';
import VerifySignupEmailScreen from '../screens/auth/VerifySignupEmailScreen';
import VerifyIdentityScreen from '../screens/auth/VerifyIdentityScreen';

const Stack = createNativeStackNavigator();

export default function AuthNavigator() {
  const reduceMotion = useReduceMotion();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: reduceMotion ? 'none' : 'slide_from_right',
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Stack.Screen
        name="Welcome"
        component={WelcomeScreen}
        options={{ animation: reduceMotion ? 'none' : 'fade_from_bottom' }}
      />
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ animation: reduceMotion ? 'none' : 'slide_from_right' }}
      />
      <Stack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ animation: reduceMotion ? 'none' : 'slide_from_right' }}
      />
      <Stack.Screen name="VerifySignupEmail" component={VerifySignupEmailScreen} options={{ animation: reduceMotion ? 'none' : 'slide_from_right' }} />
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{ animation: reduceMotion ? 'none' : 'slide_from_right' }}
      />
      <Stack.Screen
        name="FindAccount"
        component={FindAccountScreen}
        options={{ animation: reduceMotion ? 'none' : 'slide_from_right' }}
      />
      <Stack.Screen
        name="VerifyIdentity"
        component={VerifyIdentityScreen}
        options={{ animation: reduceMotion ? 'none' : 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
