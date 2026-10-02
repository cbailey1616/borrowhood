import React from 'react';
import {View,Text} from 'react-native';
import HapticPressable from './HapticPressable';
import Icon from './Icon';
import {COLORS,TYPOGRAPHY, CARD_SURFACE } from '../utils/config';
export default function ProjectIdeasCard({navigation}) {
 return <HapticPressable testID="Feed.projects" accessibilityRole="button" onPress={()=>navigation.navigate('Projects')} style={{...CARD_SURFACE,marginHorizontal:20,marginBottom:16,padding:16,borderRadius:20,backgroundColor:COLORS.surface,flexDirection:'row',alignItems:'center',gap:12}}><Icon name="project-camp" size={22}/><View style={{flex:1,gap:4}}><Text style={{...TYPOGRAPHY.headline,color:COLORS.primary}}>Make a little happen</Text><Text style={{...TYPOGRAPHY.footnote,color:COLORS.textSecondary}}>Make a plan. Borrow what you need.</Text></View><Icon name="chevron-forward" size={18}/></HapticPressable>;
}
