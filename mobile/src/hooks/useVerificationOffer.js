import { useCallback, useEffect, useRef, useState } from 'react';
import { verifyIdentityInBrowser } from '../services/identityVerification';
import { getVerificationOffer, restoreVerificationPurchase } from '../services/verificationPurchases';

// One action lock covers both purchasing and restoring. State and results belong
// to the current screen visit, never to a screen the user has already left.
export default function useVerificationOffer(navigation, startNavigationTask, accountId) {
  const [offer, setOffer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const action = useRef(null);
  const offerRequest = useRef(0);

  const refreshOffer = useCallback(async (isCurrent = startNavigationTask()) => {
    if (!isCurrent()) return null;
    const request = ++offerRequest.current;
    setLoading(true);
    setError(null);
    try {
      const result = await getVerificationOffer(isCurrent);
      if (!result || !isCurrent() || request !== offerRequest.current) return null;
      setOffer(result);
      return result;
    } catch (err) {
      if (!isCurrent() || request !== offerRequest.current) return null;
      // A missing product must not hide Restore purchase: the Apple account may
      // already own verification even while the product is unavailable for sale.
      setOffer(err.eligibility ? { eligibility: err.eligibility, product: null } : null);
      setError(err.message || 'Verification is unavailable right now. Please try again.');
      return null;
    } finally {
      if (isCurrent() && request === offerRequest.current) setLoading(false);
    }
  }, [startNavigationTask]);

  useEffect(() => {
    if (action.current && !action.current.isCurrent()) action.current = null;
    setBusy(!!action.current);
    setOffer(null);
    setNotice(null);
    refreshOffer();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      if (action.current && !action.current.isCurrent()) action.current = null;
      setBusy(!!action.current);
      setNotice(null);
      refreshOffer();
    });
    return () => unsubscribe?.();
  }, [navigation, refreshOffer, accountId]);

  const runAction = useCallback(async (operation, isCurrent) => {
    if (action.current || !isCurrent()) return null;
    const currentAction = { isCurrent };
    action.current = currentAction;
    setBusy(true);
    setNotice(null);
    try {
      return await operation(isCurrent);
    } finally {
      if (action.current === currentAction) {
        action.current = null;
        if (isCurrent()) setBusy(false);
      }
    }
  }, []);

  const verify = useCallback((isCurrent = startNavigationTask()) => runAction(async current => {
    try {
      return await verifyIdentityInBrowser(current, {
        allowPurchase: !!offer?.eligibility?.paymentRequired && !!offer?.product,
      });
    } finally {
      // A paid user who dismisses the identity browser can resume without being
      // presented with another purchase. The server remains authoritative.
      if (current()) await refreshOffer(current);
    }
  }, isCurrent), [offer, refreshOffer, runAction, startNavigationTask]);

  const restore = useCallback(() => {
    const isCurrent = startNavigationTask();
    return runAction(async current => {
      try {
        const eligibility = await restoreVerificationPurchase(current);
        if (!eligibility || !current()) return null;
        await refreshOffer(current);
        if (!current()) return null;
        setNotice(eligibility.hasVerificationPurchase
          ? 'Purchase restored. Continue verification.'
          : 'No verification purchase was found for this account.');
        return eligibility;
      } catch (err) {
        if (current()) setNotice(err.message || 'Couldn’t restore your purchase. Please try again.');
        return null;
      }
    }, isCurrent);
  }, [refreshOffer, runAction, startNavigationTask]);

  return { offer, loading, error, busy, notice, refreshOffer, verify, restore };
}
