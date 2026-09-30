import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TextInput, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import api from '../services/api';
import useNavigationTask from '../hooks/useNavigationTask';
import Icon from '../components/Icon';
import ProjectIllustration from '../components/ProjectIllustration';
import FeedWoodlandBackdrop from '../components/FeedWoodlandBackdrop';
import HapticPressable from '../components/HapticPressable';
import ActionButton from '../components/ActionButton';
import ActionSheet from '../components/ActionSheet';
import ShimmerImage from '../components/ShimmerImage';
import { formatCalendarDate } from '../utils/calendarDate';
import { projectProgress, projectItemState } from '../utils/projectProgress';
import { COLORS, TYPOGRAPHY } from '../utils/config';

export default function ProjectsScreen({route,navigation}) {
  const id=route.params?.id;
  const {user,feedWoodlandScene=0}=useAuth();
  const {showError}=useError();
  const insets=useSafeAreaInsets();
  const {width,fontScale}=useWindowDimensions();
  const [adding,setAdding]=useState(false);
  const startNavigationTask=useNavigationTask(navigation,`${user?.id}:${id || 'ideas'}`);
  const [data,setData]=useState(null),[error,setError]=useState(false),[busy,setBusy]=useState(false),[refreshing,setRefreshing]=useState(false);
  const [sheet,setSheet]=useState(null),[custom,setCustom]=useState('');
  const generation=useRef(0), mutating=useRef(false);
  const load=useCallback(async()=> {
    const current=++generation.current;
    try {
      const result=id?await api.getProject(id):await Promise.all([api.getProjectIdeas(),api.getProjects()]);
      if(current===generation.current){setData(result);setError(false);}
    } catch {if(current===generation.current)setError(true);}
    finally {if(current===generation.current)setRefreshing(false);}
  },[id,user?.id]);
  useEffect(()=>{setData(null);setSheet(null);load();const off=navigation.addListener('focus',load);return()=>{generation.current++;off?.();};},[load,navigation]);
  const mutate=async task=> {
    if(mutating.current)return;
    mutating.current=true;setBusy(true);
    try {await task();await load();} catch(e){showError({message:e.message || 'Couldn’t update your plan. Try again.'});}
    finally {mutating.current=false;setBusy(false);}
  };
  const start=templateId=>{const isCurrent=startNavigationTask();return mutate(async()=>{const project=await api.createProject({templateId});if(isCurrent())navigation.push('Projects',{id:project.id});});};
  if(!data) return <View style={styles.center}>{error?<><Text style={styles.body}>Couldn’t load your plans.</Text><ActionButton label="Try again" onPress={load}/></>:<ActivityIndicator color={COLORS.spinner}/>}</View>;
  const progress=id?projectProgress(data.items):null;
  const compact = width < 360 || fontScale > 1.2;
  const openMatches = item => item.matches.length
    ? setSheet({type:'matches',item})
    : navigation.navigate('CreateRequest',{initialTitle:item.label});
  return <>
    <ScrollView style={styles.page} contentContainerStyle={{paddingBottom:insets.bottom+24}}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={COLORS.spinner} onRefresh={()=>{setRefreshing(true);load();}}/>}>
      <View style={[styles.hero,{height:insets.top+88}]}>
        <FeedWoodlandBackdrop width={width} height={Math.max(176,insets.top+130)} topOffset={-32} sceneIndex={feedWoodlandScene}/>
        <HapticPressable accessibilityRole="button" accessibilityLabel="Back" style={[styles.back,{top:insets.top+8}]}
          onPress={()=>navigation.canGoBack?.() !== false ? navigation.goBack() : navigation.navigate('Main')}>
          <Icon name="chevron-back" size={24}/>
        </HapticPressable>
      </View>
      <View style={styles.content}>
        {error&&<ActionButton label="Couldn’t refresh. Try again" onPress={load}/>}
        <Text accessibilityRole="header" style={styles.title}>{id?data.name:'Make a little happen'}</Text>
        {!id?<>
          <Text style={styles.subtitle}>What are you planning?</Text>
          {data[1].length>0&&<>
            <Text style={styles.heading}>Your plans</Text>
            {data[1].map(project=><HapticPressable key={project.id} style={styles.saved} accessibilityRole="button"
              onPress={()=>navigation.push('Projects',{id:project.id})}>
              <Icon name="history-ledger" size={26}/><Text style={[styles.label,{flex:1}]}>{project.name}</Text><Icon name="chevron-forward" size={18}/>
            </HapticPressable>)}
            <Text style={styles.heading}>Try something new</Text>
          </>}
          <View style={styles.ideas}>
            {data[0].map((idea,index)=> {
              const essentials=idea.items.filter(i=>!i.optional);
              const count=essentials.filter(i=>i.matches.length).length;
              return <HapticPressable key={idea.id} disabled={busy} accessibilityRole="button" accessibilityLabel={`Start ${idea.name}`}
                onPress={()=>start(idea.id)} style={[styles.idea,index===0&&styles.featuredIdea]}>
                <View style={styles.ideaText}>
                  <Text style={styles.headingText}>{idea.name}</Text>
                  <Text style={styles.body}>{idea.description}</Text>
                  {!!count&&<Text style={styles.hint}>{count} of {essentials.length} essentials nearby</Text>}
                </View>
                <ProjectIllustration projectId={idea.id} width={compact?96:120} height={116}/>
                <Icon name="chevron-forward" size={16}/>
              </HapticPressable>;
            })}
          </View>
        </>:<>
          <View style={styles.summary}>
            <Text style={styles.headingText}>Your checklist</Text>
            <View style={styles.progressRow}><Text style={styles.body}>{progress.covered} ready{progress.waiting?` · ${progress.waiting} waiting`:''} · {progress.total-progress.covered-progress.waiting} to find</Text><Text style={styles.hint}>{progress.covered} of {progress.total}</Text></View>
            <View accessibilityRole="progressbar" accessibilityValue={{min:0,max:progress.total,now:progress.covered}} style={styles.track}>
              <View style={[styles.fill,{width:`${progress.total?progress.covered/progress.total*100:0}%`}]}/>
            </View>
          </View>
          <View style={styles.checklist}>
            {data.items.map(item=> {
              const state=projectItemState(item);
              const hasExchange=!!item.transactionId;
              return <View key={item.id} style={styles.item}>
                <View style={[styles.row,compact&&styles.compactRow]}>
                  <View style={styles.itemPicture}><Icon name={item.icon} size={46}/></View>
                  <View style={styles.itemText}>
                    <Text style={styles.label}>{item.label}</Text>
                    <Text style={[styles.body,state.covered&&styles.readyText]}>{item.optional?'Optional · ':''}{state.label}</Text>
                    {item.endDate&&['approved','paid','picked_up'].includes(item.transactionStatus)&&<Text style={styles.hint}>Return by {formatCalendarDate(item.endDate,{month:'short',day:'numeric'})}</Text>}
                    {hasExchange&&<HapticPressable accessibilityRole="button" accessibilityLabel={`View exchange for ${item.label}`}
                      onPress={()=>navigation.navigate('TransactionDetail',{id:item.transactionId})}><Text style={styles.textLink}>View exchange</Text></HapticPressable>}
                    {!hasExchange&&!item.owned&&<HapticPressable disabled={busy} accessibilityRole="checkbox"
                      accessibilityState={{checked:false}} accessibilityLabel={`I have ${item.label}`}
                      onPress={()=>mutate(()=>api.updateProjectItem(id,item.id,{owned:true}))} style={styles.haveOption}>
                      <Icon name="selection-check-empty" size={16} illustrated={false}/><Text style={styles.hint}>Already have this</Text>
                    </HapticPressable>}
                  </View>
                  {hasExchange?<Icon name={state.covered?'selection-check':'time'} size={26}/>:item.owned?
                    <HapticPressable disabled={busy} accessibilityRole="checkbox" accessibilityState={{checked:true}}
                      accessibilityLabel={`I have ${item.label}`} onPress={()=>mutate(()=>api.updateProjectItem(id,item.id,{owned:false}))} style={styles.checkControl}>
                      <Icon name="selection-check" size={26}/>
                    </HapticPressable>:
                    <ActionButton label={item.matches.length?'Find':'Ask'} accessibilityLabel={`Find ${item.label}`} onPress={()=>openMatches(item)} style={styles.findButton}/>
                  }
                </View>
                {state.ended&&<HapticPressable disabled={busy} accessibilityRole="button" style={styles.retryItem}
                  onPress={()=>mutate(()=>api.resetProjectItem(id,item.id))}><Text style={styles.textLink}>Find another</Text></HapticPressable>}
              </View>;
            })}
          </View>
          {!adding?<ActionButton label="Add something else" icon="add" style={styles.addButton} onPress={()=>setAdding(true)}/>:<View style={styles.summary}>
            <Text style={styles.label}>Anything else?</Text>
            <TextInput accessibilityLabel="Add a checklist item" placeholder="e.g. Picnic blanket" placeholderTextColor={COLORS.textMuted}
              value={custom} onChangeText={setCustom} maxLength={60} style={styles.input}/>
            <ActionButton disabled={busy||!custom.trim()} label="Add to checklist" onPress={()=>mutate(async()=>{await api.addProjectItem(id,{label:custom.trim()});setCustom('');setAdding(false);})}/>
          </View>}
          <ActionButton label="View pickup & return plan" variant="primary" style={styles.planButton} onPress={()=>setSheet({type:'plan'})}/>
          <HapticPressable accessibilityRole="button" style={styles.remove} onPress={()=>setSheet({type:'remove'})}><Text style={styles.hint}>Remove plan</Text></HapticPressable>
        </>}
      </View>
    </ScrollView>
    <ActionSheet isVisible={!!sheet} onClose={()=>setSheet(null)} title={sheet?.type==='matches'?sheet.item.label:sheet?.type==='plan'?'Pickup & return plan':'Remove this plan?'} message={sheet?.type==='remove'?'This removes your checklist. Existing requests and exchanges stay active.':sheet?.type==='matches'&&!sheet.item.matches.length?'No matching items right now. Check again later or ask your neighbors in Wanted.':sheet?.type==='plan'&&!data.items?.some(i=>i.transactionId)?'Your requests will appear here after you choose an item and send a request.':undefined}
      actions={sheet?.type==='matches'?sheet.item.matches.map(listing=>({label:listing.title,icon:<ShimmerImage source={{uri:listing.photoUrl}} placeholderIcon={sheet.item.icon} style={{width:36,height:36,borderRadius:8}}/>,onPress:()=>navigation.navigate('ListingDetail',{id:listing.id,projectItemId:sheet.item.id})})):sheet?.type==='plan'?(data.items||[]).filter(i=>i.transactionId).map(item=>({label:`${item.label} · ${projectItemState(item).label}${item.endDate && ['approved','paid','picked_up'].includes(item.transactionStatus) ? ` · Return by ${formatCalendarDate(item.endDate,{month:'short',day:'numeric'})}` : ''}`,icon:<Icon name={item.icon} size={26}/>,onPress:()=>navigation.navigate('TransactionDetail',{id:item.transactionId})})):sheet?.type==='remove'?[{label:'Remove checklist',destructive:true,onPress:()=>{const isCurrent=startNavigationTask();return mutate(async()=>{await api.deleteProject(id);if(isCurrent())navigation.goBack();});}}]:[]}/>
  </>;
}
const styles=StyleSheet.create({
  page:{flex:1,backgroundColor:COLORS.background},
  hero:{overflow:'hidden',backgroundColor:COLORS.background},
  back:{position:'absolute',left:20,width:44,height:44,borderRadius:14,backgroundColor:COLORS.surface,alignItems:'center',justifyContent:'center'},
  content:{paddingHorizontal:20,paddingTop:16,gap:16,maxWidth:700,width:'100%',alignSelf:'center'},
  center:{flex:1,backgroundColor:COLORS.background,alignItems:'center',justifyContent:'center',gap:16},
  title:{fontSize:30,lineHeight:36,fontFamily:'DMSans_700Bold',fontWeight:'700',letterSpacing:-0.7,color:COLORS.text},
  subtitle:{...TYPOGRAPHY.body,color:COLORS.textSecondary,marginTop:-8,marginBottom:6},
  heading:{...TYPOGRAPHY.h2,fontFamily:'DMSans_700Bold',fontWeight:'700',color:COLORS.primary,marginTop:8},
  headingText:{fontSize:20,lineHeight:25,fontFamily:'DMSans_700Bold',fontWeight:'700',letterSpacing:-0.4,color:COLORS.text},
  label:{fontSize:17,lineHeight:22,fontFamily:'DMSans_700Bold',fontWeight:'700',color:COLORS.text},
  body:{...TYPOGRAPHY.subheadline,color:COLORS.textSecondary,lineHeight:21},
  hint:{...TYPOGRAPHY.footnote,color:COLORS.textSecondary,lineHeight:18},
  ideas:{gap:14},
  idea:{paddingVertical:14,paddingHorizontal:16,borderRadius:22,backgroundColor:COLORS.surface,flexDirection:'row',gap:6,alignItems:'center',minHeight:148,borderWidth:1,borderColor:COLORS.borderLight},
  ideaText:{flex:1,gap:7},
  featuredIdea:{backgroundColor:'#E5E9D5',borderColor:'#D3DCC4'},
  saved:{padding:16,borderRadius:18,backgroundColor:COLORS.surface,flexDirection:'row',alignItems:'center',gap:12},
  summary:{padding:18,gap:10,borderRadius:20,backgroundColor:COLORS.surface,borderWidth:1,borderColor:COLORS.borderLight},
  progressRow:{flexDirection:'row',justifyContent:'space-between',gap:8,flexWrap:'wrap'},
  track:{height:9,backgroundColor:'#E8E4D6',borderRadius:5,overflow:'hidden'},
  fill:{height:9,backgroundColor:'#82977C',borderRadius:5},
  checklist:{paddingTop:2},
  item:{paddingVertical:16,borderBottomWidth:1,borderBottomColor:COLORS.borderLight,gap:8},
  row:{flexDirection:'row',alignItems:'center',gap:12},
  compactRow:{flexWrap:'wrap'},
  itemPicture:{width:66,height:72,borderRadius:16,backgroundColor:'#EAE5D6',alignItems:'center',justifyContent:'center'},
  itemText:{flex:1,minWidth:100,gap:4},
  haveOption:{minHeight:32,flexDirection:'row',alignItems:'center',gap:6,marginTop:2},
  checkControl:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},
  readyText:{color:COLORS.primary,fontFamily:'DMSans_600SemiBold'},
  findButton:{minHeight:44,paddingHorizontal:12,borderRadius:12},
  textLink:{...TYPOGRAPHY.footnote,color:COLORS.primary,textDecorationLine:'underline',paddingVertical:4},
  retryItem:{alignSelf:'flex-start',marginLeft:78,minHeight:40,justifyContent:'center'},
  addButton:{borderWidth:0,backgroundColor:'#E8E4D6',borderRadius:16,minHeight:50},
  planButton:{borderRadius:16,minHeight:54},
  remove:{padding:12,alignItems:'center'},
  input:{...TYPOGRAPHY.body,color:COLORS.text,minHeight:48,padding:12,borderRadius:12,backgroundColor:COLORS.background},
});
