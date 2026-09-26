import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import ActionSheet from './ActionSheet';
import BiometricIcon from './BiometricIcon';
import useBiometrics from '../hooks/useBiometrics';

// Lives with the session provider so leaving Welcome cannot discard the opt-in.
export default function BiometricEnrollmentPrompt({ request, isCurrent, onComplete }) {
  const { isBiometricsAvailable, isBiometricsEnabled, isLoading, biometricType,
    authenticate, getStoredCredentials, enableBiometrics } = useBiometrics();
  const [visible, setVisible] = useState(false);
  const started = useRef(false);
  const enrolling = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => mounted.current && isCurrent(request.revision);
  const complete = () => onComplete(request.revision);
  const save = async () => {
    if (!current()) return;
    const saved = await enableBiometrics(request.email, request.password);
    if (!saved && current()) Alert.alert(`Couldn’t save ${biometricType}`, 'You’re signed in. Use your email and password next time.');
  };

  useEffect(() => {
    if (isLoading || started.current) return;
    started.current = true;
    const prepare = async () => {
      try {
        if (!current()) return;
        if (!isBiometricsAvailable) { complete(); return; }
        if (isBiometricsEnabled) {
          const stored = await getStoredCredentials();
          if (!current()) return;
          if (stored?.email?.trim().toLowerCase() === request.email.trim().toLowerCase()) {
            // A verified password sign-in refreshes an existing opt-in after a reset.
            if (stored.password !== request.password) await save();
            if (current()) complete();
            return;
          }
        }
        if (current()) setVisible(true);
      } catch {
        // Optional quick sign-in must never undo a successful account login.
        if (current()) complete();
      }
    };
    prepare();
  }, [isLoading, isBiometricsAvailable, isBiometricsEnabled, request, isCurrent, onComplete, getStoredCredentials, enableBiometrics]);

  const enable = async () => {
    if (enrolling.current || !current()) return;
    enrolling.current = true;
    setVisible(false);
    try {
      if (await authenticate()) await save();
    } finally {
      if (current()) complete();
    }
  };

  return <ActionSheet
    isVisible={visible}
    variant="confirmation"
    title={`Enable ${biometricType || 'Biometrics'}?`}
    message="Sign in faster next time on this device."
    icon={<BiometricIcon type={biometricType} size={26} />}
    actions={[{ label: 'Enable', primary: true, onPress: enable }, { label: 'Not now', onPress: complete }]}
    onClose={() => { if (!enrolling.current) complete(); }}
  />;
}
