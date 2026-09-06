import 'react-native-gesture-handler';
import React, {useState} from 'react';
import {View,Text,Pressable,Modal} from 'react-native';
import {registerRootComponent} from 'expo';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {ErrorProvider,useError} from '__MOBILE_ROOT__/src/context/ErrorContext';
import ThemedAlertHost,{ThemedAlert} from '__MOBILE_ROOT__/src/components/ThemedAlert';
import SharingPicker from '__MOBILE_ROOT__/src/components/SharingPicker';
const Stack=createNativeStackNavigator();
const B=({title,onPress})=><Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={{padding:18,margin:8,backgroundColor:'#dfe6d5',borderRadius:16}}><Text>{title}</Text></Pressable>;
function Home({navigation}){return <View style={{flex:1,backgroundColor:'#f3ecdd',paddingTop:90}}><Text>Borrowhood popup check</Text><B title="Open posting sheet" onPress={()=>navigation.navigate('Posting')}/></View>}
function Posting({navigation}){
const {showError}=useError();const [native,setNative]=useState(false);const [count,setCount]=useState(0);
const confirm=()=>ThemedAlert.alert('Visible above the sheet','Your draft stays here.',[{text:'Keep editing',style:'cancel'},{text:'Confirm check',onPress:()=>setCount(v=>v+1)}]);
return <View style={{flex:1,backgroundColor:'#f3ecdd',padding:18}}><Text>Posting draft</Text><Text>{'Confirmed '+count}</Text>
<SharingPicker value={['private']} verified neighborhoodAvailable={false} onChange={()=>{}} onJoinNeighborhood={()=>navigation.navigate('Join')} onCreateNeighborhood={()=>navigation.navigate('Create')}/>
<B title="Show global confirmation" onPress={confirm}/><B title="Show global error" onPress={()=>showError({type:'network',title:'Connection check',primaryAction:'Retry check',onPrimaryPress:()=>setCount(v=>v+1)})}/>
<B title="Open native modal" onPress={()=>setNative(true)}/><B title="Close posting sheet" onPress={()=>navigation.goBack()}/>
<Modal visible={native} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setNative(false)}><View style={{flex:1,backgroundColor:'#f3ecdd',paddingTop:80}}><Text>Native modal</Text><B title="Show nested confirmation" onPress={confirm}/><B title="Close native modal" onPress={()=>setNative(false)}/></View></Modal></View>}
function Dest({route,navigation}){return <View style={{flex:1,paddingTop:90}}><Text>{route.name+' neighborhood'}</Text><B title="Return to draft" onPress={()=>navigation.goBack()}/></View>}
function App(){return <GestureHandlerRootView style={{flex:1}}><SafeAreaProvider><ErrorProvider><NavigationContainer><Stack.Navigator><Stack.Screen name="Home" component={Home}/><Stack.Screen name="Posting" component={Posting} options={{presentation:'modal'}}/><Stack.Screen name="Join" component={Dest} options={{presentation:"modal"}}/><Stack.Screen name="Create" component={Dest} options={{presentation:"modal"}}/></Stack.Navigator></NavigationContainer><ThemedAlertHost/></ErrorProvider></SafeAreaProvider></GestureHandlerRootView>}
registerRootComponent(App);
