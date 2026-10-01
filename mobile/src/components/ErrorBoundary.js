import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { COLORS, TYPOGRAPHY, CARD_SURFACE } from '../utils/config';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    // Log to error reporting service in production
    console.error('App Error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.icon}>!</Text>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
              We're sorry for the inconvenience. Please try again.
            </Text>

            <Pressable style={styles.retryButton} onPress={this.handleRetry}>
              <Text maxFontSizeMultiplier={1.4} style={styles.retryButtonText}>Try Again</Text>
            </Pressable>

            {__DEV__ && this.state.error && (
              <ScrollView style={styles.errorDetails}>
                <Text style={styles.errorTitle}>Error Details:</Text>
                <Text style={styles.errorText}>{this.state.error.toString()}</Text>
                {this.state.errorInfo && (
                  <Text style={styles.errorStack}>
                    {this.state.errorInfo.componentStack}
                  </Text>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    alignItems: 'center',
    maxWidth: 300,
  },
  icon: {
    ...TYPOGRAPHY.largeTitle,
    color: COLORS.warning,
    marginBottom: 16,
    width: 80,
    height: 80,
    lineHeight: 80,
    textAlign: 'center',
    backgroundColor: COLORS.tints.warning20,
    borderRadius: 40,
  },
  title: {
    ...TYPOGRAPHY.title2,
    color: COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
  },
  retryButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.background,
  },
  errorDetails: {
    ...CARD_SURFACE,
    marginTop: 24,
    padding: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    maxHeight: 200,
    width: '100%',
  },
  errorTitle: {
    ...TYPOGRAPHY.caption1,
    fontFamily: 'DMSans_500Medium', fontWeight: '500',
    color: COLORS.danger,
    marginBottom: 8,
  },
  errorText: {
    ...TYPOGRAPHY.caption2,
    color: COLORS.danger,
    fontFamily: 'monospace',
  },
  errorStack: {
    ...TYPOGRAPHY.caption2,
    color: COLORS.textMuted,
    fontFamily: 'monospace',
    marginTop: 8,
  },
});

export default ErrorBoundary;
