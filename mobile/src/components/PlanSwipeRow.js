import React,{useRef} from 'react';
import {View,Text} from 'react-native';
import {Swipeable} from 'react-native-gesture-handler';
import HapticPressable from './HapticPressable';
import Icon from './Icon';
import {COLORS,TYPOGRAPHY} from '../utils/config';
export default function PlanSwipeRow({children,label,onRemove,disabled=false}) {
  const ref=useRef(null);
  return <Swipeable ref={ref} enabled={!disabled} overshootRight={false} friction={2} rightThreshold={48}
    renderRightActions={()=> <HapticPressable accessibilityRole="button" accessibilityLabel={`Swipe remove ${label}`}
      onPress={()=>{ref.current?.close();onRemove();}} style={{width:88,backgroundColor:COLORS.danger,borderRadius:16,marginVertical:4,alignItems:'center',justifyContent:'center',gap:5}}>
      <Icon name="trash" size={24} color="#fff" illustrated={false}/><Text style={{...TYPOGRAPHY.footnote,color:'#fff'}}>Remove</Text>
    </HapticPressable>}>
    <View style={{backgroundColor:COLORS.background}}>{children}</View>
  </Swipeable>;
}
