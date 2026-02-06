import 'react-native-get-random-values';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { AuthProvider } from './src/context/AuthContext';
import { ErrorProvider } from './src/context/ErrorContext';
import RootNavigator from './src/navigation/RootNavigator';
import { setNavigationRef } from './src/hooks/usePushNotifications';
import ErrorBoundary from './src/components/ErrorBoundary';

const navigationRef = createNavigationContainerRef();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
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
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
