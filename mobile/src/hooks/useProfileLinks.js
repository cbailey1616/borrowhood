import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { profileIdFromLink } from '../utils/profileLinks';

// Keep a scanned profile through authentication and onboarding. Opening a link
// only navigates; sending/accepting a friend request still requires a tap.
export default function useProfileLinks(navigationRef, { isLoading, isAuthenticated, user }) {
  const [pending, setPending] = useState(null);

  useEffect(() => {
    let mounted = true;
    let receivedLiveLink = false;
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const id = profileIdFromLink(url);
      if (!mounted || !id) return;
      receivedLiveLink = true;
      setPending({ id });
    });
    Linking.getInitialURL().then(url => {
      const id = profileIdFromLink(url);
      if (mounted && !receivedLiveLink && id) setPending({ id });
    }).catch(() => {});
    return () => { mounted = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!pending || !navigationRef || isLoading || !isAuthenticated || !user?.id
      || !user.onboardingCompleted || user.needsName) return;
    let consumed = false;
    const openProfile = () => {
      if (consumed || !navigationRef.isReady()
        || !navigationRef.getRootState()?.routeNames?.includes('UserProfile')) return;
      consumed = true;
      navigationRef.navigate('UserProfile', { id: pending.id });
      setPending(current => current === pending ? null : current);
    };
    const removeReady = navigationRef.addListener('ready', openProfile);
    const removeState = navigationRef.addListener('state', openProfile);
    openProfile();
    return () => { removeReady(); removeState(); };
  }, [pending, navigationRef, isLoading, isAuthenticated, user?.id, user?.onboardingCompleted, user?.needsName]);
}
