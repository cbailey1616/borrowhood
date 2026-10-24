import { svgDataUri } from '../utils/svgSource';
import { memo, useMemo } from 'react';
import { Image } from 'expo-image';
import { illustrationSvg } from '../assets/borrowhood-illustrations';

export default memo(function WoodlandIllustration({ scene = 'neighborhood', width = 180, style }) {
  const source = useMemo(() => ({ uri: svgDataUri(illustrationSvg(scene)) }), [scene]);
  return <Image source={source} style={[{ width, height: width * 0.6, maxWidth: '100%' }, style]} contentFit="contain" transition={0} accessible={false} />;
});
