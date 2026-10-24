import { svgDataUri } from '../utils/svgSource';
import React, {useMemo} from 'react';
import {Image} from 'expo-image';
import {projectSceneSvg} from '../assets/project-scenes';

export default function ProjectIllustration({projectId,width=132,height=112}) {
  const source=useMemo(()=>({uri:svgDataUri(projectSceneSvg(projectId))}),[projectId]);
  return <Image source={source} style={{width,height,flexShrink:0}} contentFit="contain" accessible={false} transition={0}/>;
}
