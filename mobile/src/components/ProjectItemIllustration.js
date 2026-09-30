import React,{useMemo} from 'react';
import {Image} from 'expo-image';
import Icon from './Icon';
import {projectItemSvg} from '../assets/project-item-scenes';
export default function ProjectItemIllustration({label,icon='basket',size=66}) {
  const svg=useMemo(()=>projectItemSvg(label),[label]);
  const source=useMemo(()=>svg?{uri:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}:null,[svg]);
  return source?<Image source={source} style={{width:size,height:size}} contentFit="contain" accessible={false} transition={0}/>:<Icon name={icon} size={size*.7}/>;
}
