import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import HapticPressable from './HapticPressable';
import { useAuth } from '../context/AuthContext';
import { appleCredential, googleCredential, isSignInCancellation } from '../services/socialSignIn';
import { COLORS } from '../utils/config';

export default function SocialSignInButtons({ disabled = false, onBusyChange, onLinkRequired }) {
  const { loginWithGoogle, loginWithApple } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(value => {
      if (mounted.current) setAppleAvailable(value);
    }).catch(() => {});
    return () => { mounted.current = false; };
  }, []);

  const signIn = async provider => {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(provider); setError(''); onBusyChange?.(true);
    let token;
    try {
      if (provider === 'google') {
        const idToken = await googleCredential();
        token = { idToken };
        if (idToken) await loginWithGoogle(idToken);
      } else {
        const credential = await appleCredential();
        token = { identityToken: credential.identityToken };
        await loginWithApple(credential.identityToken, credential.fullName);
      }
    } catch (e) {
      if (e.code === 'ACCOUNT_LINK_REQUIRED' && onLinkRequired && mounted.current) {
        onLinkRequired({ provider, token, ...(e.email ? { email: e.email } : {}) });
        return;
      }
      if (!isSignInCancellation(e) && mounted.current) {
        setError(e.status ? e.message : `Couldn’t connect to ${provider === 'apple' ? 'Apple' : 'Google'}. Please try again or use email.`);
      }
    } finally {
      lock.current = false;
      if (mounted.current) { setBusy(null); onBusyChange?.(false); }
    }
  };

  return (
    <View style={styles.container}>
      <View pointerEvents={disabled || busy ? 'none' : 'auto'} style={{ opacity: disabled || busy ? 0.55 : 1 }}>
        {appleAvailable && <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
          cornerRadius={26}
          style={styles.button}
          onPress={() => signIn('apple')}
          testID="Auth.apple"
          accessibilityLabel="Continue with Apple"
        />}
        <HapticPressable style={[styles.button, styles.googleButton]} disabled={disabled || !!busy}
          onPress={() => signIn('google')} testID="Auth.google" accessibilityRole="button"
          accessibilityLabel="Continue with Google" accessibilityState={{ disabled: disabled || !!busy }}>
          <Image source={require('../../assets/brand/google-g.png')} style={styles.googleLogo} accessible={false} />
          <Text style={styles.googleText}>Continue with Google</Text>
        </HapticPressable>
      </View>
      {!!busy && <View style={styles.progress} accessibilityLiveRegion="polite">
        <ActivityIndicator color={COLORS.primary} /><Text style={styles.note}>Signing you in…</Text>
      </View>}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { width: '100%' },
  button: { width: '100%', height: 52, marginBottom: 12 },
  // Google-approved light styling; keep the provider mark in its original colors.
  googleButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderRadius: 26, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#747775' },
  googleLogo: { width: 20, height: 20, resizeMode: 'contain' },
  googleText: { fontFamily: 'GoogleSansMedium', fontSize: 17, lineHeight: 24, color: '#1F1F1F', includeFontPadding: false },
  progress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 8 },
  note: { fontSize: 15, color: COLORS.textSecondary },
  error: { fontSize: 15, lineHeight: 22, color: COLORS.danger, marginVertical: 8 },
});
