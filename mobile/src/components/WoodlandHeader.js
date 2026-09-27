import React from 'react';
import NativeHeader from './NativeHeader';
import WoodlandBackdrop from './WoodlandBackdrop';

export default function WoodlandHeader({ titleStyle, titleRowStyle, ...props }) {
  return <NativeHeader {...props} backdrop={<WoodlandBackdrop />}
    titleStyle={[{ fontFamily: 'Fraunces_600SemiBold' }, titleStyle]}
    titleRowStyle={[{ marginBottom: 28 }, titleRowStyle]} />;
}
