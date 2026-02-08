import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Dimensions,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeInUp,
  FadeOutUp,
  SlideInUp,
  SlideOutUp,
  runOnJS,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../utils/config';

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
  success: {
    icon: 'checkmark-circle-outline',
    title: 'Success',
    defaultMessage: 'Operation completed successfully.',
    primaryAction: 'OK',
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

function Toast({ toast, onRemove }) {
  return (
    <Animated.View
      entering={SlideInUp.springify().damping(20).stiffness(180)}
      exiting={FadeOutUp.duration(200)}
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
      <HapticPressable onPress={() => onRemove(toast.id)} haptic={null} style={styles.toastDismiss}>
        <Ionicons name="close" size={16} color={COLORS.textMuted} />
      </HapticPressable>
    </Animated.View>
  );
}

export function ErrorProvider({ children, navigationRef }) {
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    if (error) {
      setShowModal(true);
    } else if (showModal) {
      // Error was cleared — allow fade-out animation then force unmount Modal
      // (onDismiss is unreliable on iOS and can leave an invisible Modal blocking touches)
      const timer = setTimeout(() => setShowModal(false), 350);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const showError = useCallback(({
    type,
    title,
    message,
    primaryAction,
    secondaryAction,
    onPrimaryPress,
    onPrimaryAction,
    onSecondaryPress,
    onDismiss,
  }) => {
    const detectedType = type || detectErrorType(message);
    const config = ERROR_CONFIGS[detectedType] || ERROR_CONFIGS.generic;

    // Fire haptic based on error type
    if (detectedType === 'success') {
      haptics.success();
    } else if (detectedType === 'validation') {
      haptics.warning();
    } else {
      haptics.error();
    }

    setError({
      type: detectedType,
      icon: config.icon,
      title: title || config.title,
      message: message || config.defaultMessage,
      primaryAction: primaryAction || config.primaryAction,
      secondaryAction,
      onPrimaryPress: onPrimaryPress || onPrimaryAction,
      onSecondaryPress,
      onDismiss,
    });
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'error') => {
    const id = Date.now();

    if (type === 'success') {
      haptics.success();
    } else {
      haptics.warning();
    }

    setToasts(prev => [...prev, { id, message, type }]);

    // Auto dismiss after 3 seconds
    setTimeout(() => {
      removeToast(id);
    }, 3000);
  }, [removeToast]);

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
          navigationRef.current.navigate('VerifyIdentity');
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

  const getIconColor = () => {
    if (error?.type === 'success') return COLORS.secondary;
    if (error?.type === 'subscription') return COLORS.warning;
    return COLORS.danger;
  };

  return (
    <ErrorContext.Provider value={{ showError, showToast, dismissError }}>
      {children}

      {/* Error Modal with Blur Backdrop */}
      {showModal && (
      <Modal
        visible={!!error}
        transparent
        animationType="fade"
        onRequestClose={dismissError}
        onDismiss={() => { /* handled by useEffect timeout fallback */ }}
      >
        <View style={styles.overlay}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]} />
          )}

          <Animated.View
            entering={FadeInUp.springify().damping(15).stiffness(150)}
            style={styles.modalContent}
          >
            <View style={[styles.iconContainer, { borderColor: getIconColor() + '30' }]}>
              <Ionicons
                name={error?.icon || 'warning-outline'}
                size={40}
                color={getIconColor()}
              />
            </View>

            <Text style={styles.title}>{error?.title}</Text>
            <Text style={styles.message}>{error?.message}</Text>

            <View style={styles.buttonContainer}>
              {error?.secondaryAction && (
                <HapticPressable
                  style={styles.secondaryButton}
                  onPress={handleSecondaryPress}
                  haptic="light"
                >
                  <Text style={styles.secondaryButtonText}>{error.secondaryAction}</Text>
                </HapticPressable>
              )}

              <HapticPressable
                style={[
                  styles.primaryButton,
                  error?.type === 'subscription' && styles.upgradeButton,
                  error?.type === 'success' && styles.successButton,
                ]}
                onPress={handlePrimaryPress}
                haptic="medium"
              >
                <Text style={styles.primaryButtonText}>{error?.primaryAction}</Text>
              </HapticPressable>
            </View>

            <HapticPressable style={styles.dismissButton} onPress={dismissError} haptic="light">
              <Ionicons name="close" size={24} color={COLORS.textMuted} />
            </HapticPressable>
          </Animated.View>
        </View>
      </Modal>
      )}

      {/* Toast Messages with Reanimated Entering/Exiting */}
      <View style={styles.toastContainer} pointerEvents="box-none">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onRemove={removeToast} />
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xxl,
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
    marginBottom: SPACING.xl,
    borderWidth: 2,
  },
  title: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  message: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl + SPACING.xs,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
    width: '100%',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  upgradeButton: {
    backgroundColor: COLORS.warning,
  },
  successButton: {
    backgroundColor: COLORS.secondary,
  },
  primaryButtonText: {
    color: '#fff',
    ...TYPOGRAPHY.headline,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: COLORS.gray[800],
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: COLORS.text,
    ...TYPOGRAPHY.headline,
  },
  dismissButton: {
    position: 'absolute',
    top: SPACING.lg,
    right: SPACING.lg,
    padding: 4,
  },
  toastContainer: {
    position: 'absolute',
    top: 60,
    left: SPACING.lg,
    right: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.danger + '40',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    width: '100%',
  },
  toastSuccess: {
    borderColor: COLORS.secondary + '40',
  },
  toastText: {
    color: COLORS.text,
    ...TYPOGRAPHY.footnote,
    fontWeight: '500',
    flex: 1,
  },
  toastDismiss: {
    padding: 2,
  },
});
