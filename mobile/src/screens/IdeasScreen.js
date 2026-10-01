import React from 'react';
import {View} from 'react-native';
import WoodlandHeader from '../components/WoodlandHeader';
import ProjectsScreen from './ProjectsScreen';
import {COLORS} from '../utils/config';
export default function IdeasScreen({navigation}) {
  return <View style={{flex:1,backgroundColor:COLORS.background}}>
    <WoodlandHeader title="Ideas" titleRowStyle={{marginBottom:16}}/>
    <ProjectsScreen navigation={navigation} route={{}} embedded/>
  </View>;
}
