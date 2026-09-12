import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Keyboard, Platform, View, useWindowDimensions } from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';

// Keyboard frames use window coordinates. Measure the actual native screen
// instead of assuming the navigation library's estimated header height is its
// origin (the two can differ with newer iOS navigation bars).
export default function ComposerKeyboardView({ children, style, onKeyboardVisibilityChange, ...props }) {
  const viewportRef = useRef(null);
  const mounted = useRef(true);
  const measurement = useRef(0);
  const [viewport, setViewport] = useState(null);
  const [keyboardFrame, setKeyboardFrame] = useState(() => Keyboard.metrics?.() || null);
  const { width, height } = useWindowDimensions();
  const headerHeight = useHeaderHeight();
  const isDocked = useCallback(frame => !!frame && frame.height > 0 && (
    Platform.OS !== 'ios' || (
      frame.screenY < height && frame.width >= width - 1 &&
      frame.screenY + frame.height >= height - 1
    )
  ), [width, height]);

  const measureViewport = useCallback(() => {
    const request = ++measurement.current;
    viewportRef.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      if (!mounted.current || request !== measurement.current || measuredHeight <= 0) return;
      if (![x, y, measuredWidth, measuredHeight].every(Number.isFinite)) return;
      setViewport(current => current?.y === y && current?.height === measuredHeight
        ? current : { y, height: measuredHeight });
    });
  }, []);

  // Layout fires for native header/viewport changes; remeasure after rotation
  // and navigation header updates too. Padding does not change this flex frame.
  useLayoutEffect(measureViewport, [measureViewport, width, height, headerHeight]);

  useEffect(() => {
    mounted.current = true;
    measureViewport();
    const update = event => {
      const frame = event?.endCoordinates;
      const visible = isDocked(frame);
      if (Platform.OS === 'ios') Keyboard.scheduleLayoutAnimation(event);
      setKeyboardFrame(visible ? frame : null);
      onKeyboardVisibilityChange?.(visible);
      measureViewport();
    };
    const hide = event => {
      if (Platform.OS === 'ios') Keyboard.scheduleLayoutAnimation(event);
      setKeyboardFrame(null);
      onKeyboardVisibilityChange?.(false);
    };
    const subscriptions = Platform.OS === 'ios'
      ? [
        Keyboard.addListener('keyboardWillShow', update),
        Keyboard.addListener('keyboardWillChangeFrame', update),
        Keyboard.addListener('keyboardDidShow', update),
        Keyboard.addListener('keyboardDidChangeFrame', update),
        Keyboard.addListener('keyboardWillHide', hide),
        Keyboard.addListener('keyboardDidHide', hide),
      ]
      : [Keyboard.addListener('keyboardDidShow', update), Keyboard.addListener('keyboardDidHide', hide)];
    onKeyboardVisibilityChange?.(isDocked(Keyboard.metrics?.()));
    return () => {
      mounted.current = false;
      measurement.current += 1;
      subscriptions.forEach(subscription => subscription.remove());
    };
  }, [isDocked, measureViewport, onKeyboardVisibilityChange]);

  // Android already resizes the window. Adding a keyboard inset there would
  // move the composer twice. Home-indicator spacing remains in the composer dock.
  // An iPad's floating keyboard should not push the entire conversation up.
  const bottom = Platform.OS === 'ios' && viewport && isDocked(keyboardFrame)
    ? Math.max(0, viewport.y + viewport.height - keyboardFrame.screenY) : 0;

  return <View {...props} ref={viewportRef} collapsable={false}
    onLayout={measureViewport} style={[style, { paddingBottom: bottom }]}>
    {children}
  </View>;
}
