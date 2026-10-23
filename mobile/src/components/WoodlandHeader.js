import React from 'react';
import NativeHeader from './NativeHeader';
import WoodlandBackdrop from './WoodlandBackdrop';
import { SPACING } from '../utils/config';

const WOODLAND_TITLE_STYLE = {
  fontFamily: 'DMSans_600SemiBold',
  fontWeight: '600',
  letterSpacing: 0,
};

export default function WoodlandHeader({ titleStyle, titleRowStyle, children, artwork = true, ...props }) {
  return <NativeHeader {...props} backdrop={artwork ? <WoodlandBackdrop /> : null}
    titleStyle={[WOODLAND_TITLE_STYLE, titleStyle]}
    titleRowStyle={[{ marginBottom: children ? SPACING.md : 0 }, titleRowStyle]}>
    {children}
  </NativeHeader>;
}
