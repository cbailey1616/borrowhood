import React from 'react';
import NativeHeader from './NativeHeader';
import WoodlandBackdrop from './WoodlandBackdrop';

const WOODLAND_TITLE_STYLE = {
  fontFamily: 'DMSans_700Bold',
  fontWeight: '700',
  letterSpacing: 0,
};

export default function WoodlandHeader({ titleStyle, titleRowStyle, ...props }) {
  return <NativeHeader {...props} backdrop={<WoodlandBackdrop />}
    titleStyle={[WOODLAND_TITLE_STYLE, titleStyle]}
    titleRowStyle={[{ marginBottom: props.children ? 12 : 28 }, titleRowStyle]} />;
}
