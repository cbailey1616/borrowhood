import WelcomeScreen from './WelcomeScreen';

// Password recovery and registration return to the same sign-in experience.
export default function LoginScreen({ navigation }) {
  return <WelcomeScreen navigation={navigation} showBackButton />;
}
