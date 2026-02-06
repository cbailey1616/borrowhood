import React from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function AnimatedCard({
  index = 0,
  delay = 50,
  style,
  children,
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(index * delay)
        .springify()
        .damping(18)
        .stiffness(200)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
