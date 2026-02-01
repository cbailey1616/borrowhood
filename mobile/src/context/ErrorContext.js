import { createContext, useContext, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import { COLORS } from '../utils/config';

const ErrorContext = createContext(null);

const { width } = Dimensions.get('window');

// Error type configurations
const ERROR_CONFIGS = {
  network: {
    icon: 'cloud-offline-outline',
    title: 'Connection Issue',
    defaultMessage: 'Please check your internet connection and try again.',
    primaryAction: 'Try Again',
  },
  auth: {
    icon: 'lock-closed-outline',
    title: 'Authentication Required',
    defaultMessage: 'Please sign in to continue.',
    primaryAction: 'Sign In',
  },
  validation: {
    icon: 'alert-circle-outline',
    title: 'Oops!',
    defaultMessage: 'Please check your input and try again.',
    primaryAction: 'Got It',
  },
  permission: {
    icon: 'shield-outline',
    title: 'Permission Needed',
    defaultMessage: 'This action requires additional permissions.',
    primaryAction: 'Got It',
  },
  verification: {
    icon: 'checkmark-shield-outline',
    title: 'Verification Required',
    defaultMessage: 'Please verify your identity to continue.',
    primaryAction: 'Verify Now',
  },
  subscription: {
    icon: 'star-outline',
    title: 'Upgrade Required',
    defaultMessage: 'This feature requires a subscription upgrade.',
    primaryAction: 'View Plans',
  },
  community: {
    icon: 'home-outline',
    title: 'Join a Neighborhood',
    defaultMessage: 'Join a neighborhood to access this feature.',
    primaryAction: 'Find Neighborhood',
  },
  notFound: {
    icon: 'search-outline',
    title: 'Not Found',
    defaultMessage: 'The item you\'re looking for doesn\'t exist.',
    primaryAction: 'Go Back',
  },
  generic: {
    icon: 'warning-outline',
    title: 'Something Went Wrong',
    defaultMessage: 'An unexpected error occurred. Please try again.',
    primaryAction: 'Dismiss',
  },
};

// Helper to detect error type from message
function detectErrorType(message) {
  const msg = (message || '').toLowerCase();

  if (msg.includes('network') || msg.includes('connection') || msg.includes('fetch')) {
    return 'network';
  }
  if (msg.includes('unauthorized') || msg.includes('sign in') || msg.includes('login') || msg.includes('token')) {
    return 'auth';
  }
  if (msg.includes('verification') || msg.includes('verify')) {
    return 'verification';
  }
  if (msg.includes('subscription') || msg.includes('upgrade') || msg.includes('tier')) {
    return 'subscription';
  }
  if (msg.includes('neighborhood') || msg.includes('community')) {
    return 'community';
  }
  if (msg.includes('not found') || msg.includes('doesn\'t exist')) {
    return 'notFound';
  }
  if (msg.includes('required') || msg.includes('invalid') || msg.includes('please enter')) {
    return 'validation';
  }
  if (msg.includes('permission') || msg.includes('access denied')) {
    return 'permission';
  }

  return 'generic';
}

export function ErrorProvider({ children, navigationRef }) {
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]);

  const showError = useCallback(({
    type,
    title,
    message,
    primaryAction,
    secondaryAction,
    onPrimaryPress,
    onSecondaryPress,
    onDismiss,
  }) => {
    const detectedType = type || detectErrorType(message);
    const config = ERROR_CONFIGS[detectedType] || ERROR_CONFIGS.generic;

    setError({
      type: detectedType,
      icon: config.icon,
      title: title || config.title,
      message: message || config.defaultMessage,
      primaryAction: primaryAction || config.primaryAction,
      secondaryAction,
      onPrimaryPress,
      onSecondaryPress,
      onDismiss,
    });
  }, []);

  const showToast = useCallback((message, type = 'error') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);

    // Auto dismiss after 3 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const dismissError = useCallback(() => {
    if (error?.onDismiss) {
      error.onDismiss();
    }
    setError(null);
  }, [error]);

  const handlePrimaryPress = useCallback(() => {
    if (error?.onPrimaryPress) {
      error.onPrimaryPress();
    }

    // Handle default navigation actions
    if (navigationRef?.current) {
      switch (error?.type) {
        case 'auth':
          navigationRef.current.navigate('Auth');
          break;
        case 'verification':
          navigationRef.current.navigate('Auth', { screen: 'VerifyIdentity' });
          break;
        case 'subscription':
          navigationRef.current.navigate('Subscription');
          break;
        case 'community':
          navigationRef.current.navigate('JoinCommunity');
          break;
        case 'notFound':
          navigationRef.current.goBack();
          break;
      }
    }

    setError(null);
  }, [error, navigationRef]);

  const handleSecondaryPress = useCallback(() => {
    if (error?.onSecondaryPress) {
      error.onSecondaryPress();
    }
    setError(null);
  }, [error]);

  return (
    <ErrorContext.Provider value={{ showError, showToast, dismissError }}>
      {children}

      {/* Error Modal */}
      <Modal
        visible={!!error}
        transparent
        animationType="fade"
        onRequestClose={dismissError}
      >
        <View style={styles.overlay}>
          <View style={styles.modalContent}>
            <View style={styles.iconContainer}>
              <Ionicons
                name={error?.icon || 'warning-outline'}
                size={40}
                color={error?.type === 'subscription' ? COLORS.warning : COLORS.danger}
              />
            </View>

            <Text style={styles.title}>{error?.title}</Text>
            <Text style={styles.message}>{error?.message}</Text>

            <View style={styles.buttonContainer}>
              {error?.secondaryAction && (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={handleSecondaryPress}
                >
                  <Text style={styles.secondaryButtonText}>{error.secondaryAction}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  error?.type === 'subscription' && styles.upgradeButton,
                ]}
                onPress={handlePrimaryPress}
              >
                <Text style={styles.primaryButtonText}>{error?.primaryAction}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.dismissButton} onPress={dismissError}>
              <Ionicons name="close" size={24} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Toast Messages */}
      <View style={styles.toastContainer} pointerEvents="box-none">
        {toasts.map((toast) => (
          <Animated.View
            key={toast.id}
            style={[
              styles.toast,
              toast.type === 'success' && styles.toastSuccess,
            ]}
          >
            <Ionicons
              name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
              size={20}
              color={toast.type === 'success' ? COLORS.secondary : COLORS.danger}
            />
            <Text style={styles.toastText}>{toast.message}</Text>
          </Animated.View>
        ))}
      </View>
    </ErrorContext.Provider>
  );
}

export function useError() {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error('useError must be used within ErrorProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  upgradeButton: {
    backgroundColor: COLORS.warning,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: COLORS.gray[800],
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  dismissButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
  },
  toastContainer: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    alignItems: 'center',
    gap: 8,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.danger + '40',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastSuccess: {
    borderColor: COLORS.secondary + '40',
  },
  toastText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
});
