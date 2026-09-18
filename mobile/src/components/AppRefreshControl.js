import { useEffect, useState } from 'react';
import { Platform, RefreshControl } from 'react-native';
import { COLORS } from '../utils/config';

export default function AppRefreshControl({
  refreshing, tintColor = COLORS.spinner, colors = [tintColor], progressViewOffset = 0, ...props
}) {
  const [ready, setReady] = useState(Platform.OS !== 'ios');
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    // RN 0.81 Fabric ignores the initial tint. Send it as a changed prop after
    // UIKit has attached the control, before starting any requested animation.
    // Remove this workaround once the upstream mount bug is fixed:
    // https://github.com/facebook/react-native/issues/53987
    const timer = setTimeout(() => setReady(true), 500);
    return () => clearTimeout(timer);
  }, []);

  return <RefreshControl {...props} refreshing={ready && refreshing}
    tintColor={ready ? tintColor : undefined} colors={colors}
    progressViewOffset={ready ? progressViewOffset : 0} />;
}
