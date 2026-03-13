import React from 'react';
import { View } from 'react-native';

export default function AnimatedCard({
  index = 0,
  delay = 50,
  style,
  children,
}) {
  return (
    <View style={style}>
      {children}
    </View>
  );
}
