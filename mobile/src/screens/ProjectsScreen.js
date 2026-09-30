import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, ActivityIndicator, Keyboard, Platform, useWindowDimensions } from 'react-native';
import BorrowhoodRefreshScrollView from '../components/BorrowhoodRefreshScrollView';
import TextInput from '../components/AppTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import api from '../services/api';
import useNavigationTask from '../hooks/useNavigationTask';
import Icon from '../components/Icon';
import ProjectIllustration from '../components/ProjectIllustration';
import ProjectItemIllustration from '../components/ProjectItemIllustration';
import PlanSwipeRow from '../components/PlanSwipeRow';
import FeedWoodlandBackdrop from '../components/FeedWoodlandBackdrop';
import HapticPressable from '../components/HapticPressable';
import ActionButton from '../components/ActionButton';
import ActionSheet from '../components/ActionSheet';
import ShimmerImage from '../components/ShimmerImage';
import { formatCalendarDate } from '../utils/calendarDate';
import { projectProgress, projectItemState } from '../utils/projectProgress';
import { resolveProjectSlot } from '../utils/projectRequest';
import { COLORS, TYPOGRAPHY } from '../utils/config';

export default function ProjectsScreen({route,navigation,embedded=false}) {
  const [promotedId,setPromotedId]=useState(null);
  const id=route.params?.id || promotedId;
  const templateId=route.params?.templateId;
  const newCustom=!!route.params?.custom;
  const creating=newCustom&&!id;
  const isPlan=!!(id||templateId||newCustom);
  const {user,feedWoodlandScene=0}=useAuth();
  const {showError}=useError();
  const insets=useSafeAreaInsets();
  const tabBarHeight=useContext(BottomTabBarHeightContext) || 0;
  const {width,fontScale}=useWindowDimensions();
  const [adding,setAdding]=useState(false);
  const [editing,setEditing]=useState(false);
  const [planName,setPlanName]=useState('');
  const [editedItem,setEditedItem]=useState(null),[editedLabel,setEditedLabel]=useState('');
  const startNavigationTask=useNavigationTask(navigation,`${user?.id}:${id || templateId || (newCustom?'custom':'ideas')}`);
  const [data,setData]=useState(null),[error,setError]=useState(false),[busy,setBusy]=useState(false),[refreshing,setRefreshing]=useState(false);
  const [sheet,setSheet]=useState(null),[custom,setCustom]=useState('');
  const generation=useRef(0), mutating=useRef(false);
  const load=useCallback(async()=> {
    const current=++generation.current;
    try {
      let result=id?await api.getProject(id):newCustom?{name:'Create your own plan',templateId:'custom',preview:true,items:[]}:await Promise.all([api.getProjectIdeas(),api.getProjects()]);
      if(templateId&&!id) {
        const saved=result[1].find(p=>p.templateId===templateId);
        if(saved) {
          result=await api.getProject(saved.id);
          if(current===generation.current)setPromotedId(saved.id);
        } else {
          const idea=result[0].find(p=>p.id===templateId);
          if(!idea)throw new Error('Idea not found');
          result={...idea,templateId,preview:true,items:idea.items.map((item,index)=>({...item,id:`preview-${templateId}-${index}`,owned:false}))};
        }
      }
      if(current===generation.current){setData(previous=>!id&&result.preview&&previous?.templateId===result.templateId?previous:result);setError(false);}
    } catch {if(current===generation.current)setError(true);}
    finally {if(current===generation.current)setRefreshing(false);}
  },[id,templateId,newCustom,user?.id]);
  useEffect(()=>{setData(null);setSheet(null);setEditing(false);setAdding(false);setEditedItem(null);load();const off=navigation.addListener('focus',load);return()=>{generation.current++;off?.();};},[load,navigation]);
  const mutate=async task=> {
    if(mutating.current)return;
    mutating.current=true;setBusy(true);
    try {await task();await load();} catch(e){showError({message:e.message || 'Couldn’t update your plan. Try again.'});}
    finally {mutating.current=false;setBusy(false);}
  };
  const save=()=>{
    const items=data.items.map(({label,owned})=>({label,owned:!!owned}));
    const pending=custom.trim();
    if(pending){
      if(items.length>=20)return showError({message:'A plan can have up to 20 items.'});
      if(items.some(i=>i.label.toLowerCase()===pending.toLowerCase()))return showError({message:'That item is already on your list.'});
      items.push({label:pending,owned:false});
    }
    const isCurrent=startNavigationTask();
    return mutate(async()=>{const project=await api.createProject({templateId:newCustom?'custom':templateId,...(newCustom?{name:planName.trim()}:{}),items});if(isCurrent())navigation.replace('Projects',{id:project.id});});
  };
  const setOwned=(item,owned)=>id?mutate(()=>api.updateProjectItem(id,item.id,{owned})):setData(p=>({...p,items:p.items.map(i=>i.id===item.id?{...i,owned}:i)}));
  const removeItem=item=>id?mutate(()=>api.deleteProjectItem(id,item.id)):setData(p=>({...p,items:p.items.filter(i=>i.id!==item.id)}));
  const requestRemoveItem=item=>item.transactionId?setSheet({type:'removeItem',item}):removeItem(item);
  const planContext=item=>id?{projectId:id,projectItemId:item.id}:{projectDraft:{templateId:newCustom?'custom':templateId,...(newCustom?{name:planName.trim()}:{}),items:data.items.map(({label,owned})=>({label,owned:!!owned})),label:item.label}};
  const openExchanges=async item=>{
    if(mutating.current)return;
    mutating.current=true;setBusy(true);
    const current=generation.current;
    try {
      const exchanges=(await api.getTransactions({role:'borrower'})).filter(t=>t.isBorrower&&(!t.listingType||t.listingType==='lend')&&['pending','approved','paid','picked_up','return_pending'].includes(t.status)&&!Number(t.rentalFee)&&!Number(t.depositAmount));
      if(current===generation.current)setSheet({type:'exchanges',item,exchanges});
    } catch(e){showError({message:e.message||'Couldn’t load your exchanges. Try again.'});}
    finally {mutating.current=false;setBusy(false);}
  };
  const linkExchange=async(item,exchange)=>{
    const isCurrent=startNavigationTask();
    let linkedProjectId;
    await mutate(async()=>{
      const slot=await resolveProjectSlot(api,planContext(item));
      await api.linkProjectExchange(slot.projectId,slot.itemId,exchange.id);
      linkedProjectId=slot.projectId;
    });
    if(!id&&linkedProjectId&&isCurrent())setPromotedId(linkedProjectId);
  };
  const editItem=item=>{setEditedItem(item.id);setEditedLabel(item.label);};
  const saveItem=()=>{
    const label=editedLabel.trim();
    if(!label)return;
    if(data.items.some(i=>i.id!==editedItem&&i.label.toLowerCase()===label.toLowerCase()))return showError({message:'That item is already on your list.'});
    const finish=()=>{Keyboard.dismiss();setEditedItem(null);};
    return id?mutate(async()=>{await api.updateProjectItem(id,editedItem,{label});finish();}):(setData(p=>({...p,items:p.items.map(i=>i.id===editedItem?{...i,label,icon:'basket',matches:[]}:i)})),finish());
  };
  const addItem=()=>{
    const label=custom.trim();
    if(data.items.length>=20)return showError({message:'A plan can have up to 20 items.'});
    if(data.items.some(i=>i.label.toLowerCase()===label.toLowerCase()))return showError({message:'That item is already on your list.'});
    const finish=()=>{Keyboard.dismiss();setCustom('');setAdding(false);};
    return id?mutate(async()=>{await api.addProjectItem(id,{label});finish();}):(setData(p=>({...p,items:[...p.items,{id:`custom-${Date.now()}`,label,icon:'basket',owned:false,matches:[]}]})),finish());
  };
  if(!data) return <View style={styles.center}>{error?<><Text style={styles.body}>Couldn’t load your plans.</Text><ActionButton label="Try again" onPress={load}/></>:<ActivityIndicator color={COLORS.spinner}/>}</View>;
  const progress=isPlan?projectProgress(data.items):null;
  const compact = width < 360 || fontScale > 1.2;
  const openMatches = item => item.matches.length
    ? setSheet({type:'matches',item})
    : navigation.navigate('CreateRequest',{initialTitle:item.label,projectItemId:item.id});
  return <>
    <BorrowhoodRefreshScrollView testID="Projects.scroll" style={styles.page} contentContainerStyle={{paddingBottom:Math.max(embedded?tabBarHeight:0,insets.bottom)+24}}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" enableOnAndroid extraScrollHeight={Platform.OS==='ios'?32:16}
      refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}}>
      {!embedded&&<View style={[styles.hero,{height:insets.top+(creating?64:88)}]}>
        <FeedWoodlandBackdrop width={width} height={Math.max(creating?136:176,insets.top+(creating?84:130))} topOffset={-32} sceneIndex={feedWoodlandScene}/>
        <HapticPressable accessibilityRole="button" accessibilityLabel="Back" style={[styles.back,{top:insets.top+8}]}
          onPress={()=>navigation.canGoBack?.() !== false ? navigation.goBack() : navigation.navigate('Main')}>
          <Icon name="chevron-back" size={24}/>
        </HapticPressable>
      </View>}
      <View style={styles.content}>
        {error&&<ActionButton label="Couldn’t refresh. Try again" onPress={load}/>}
        {!embedded&&<Text accessibilityRole="header" style={styles.title}>{creating?'New plan':isPlan?data.name:'Ideas'}</Text>}
        {!isPlan?<>
          <Text style={styles.subtitle}>Make a plan. Borrow from neighbors.</Text>
          <ActionButton label="Create your own plan" icon="history-ledger" onPress={()=>navigation.push('Projects',{custom:true})}/>
          {data[1].length>0&&<>
            <Text style={styles.heading}>Your plans</Text>
            {data[1].map(project=><PlanSwipeRow key={project.id} label={project.name} disabled={busy} onRemove={()=>setSheet({type:'removeSaved',project})}><HapticPressable style={styles.saved} accessibilityRole="button"
              onPress={()=>navigation.push('Projects',{id:project.id})}>
              <Icon name="history-ledger" size={26}/><Text style={[styles.label,{flex:1}]}>{project.name}</Text><Icon name="chevron-forward" size={18}/>
            </HapticPressable></PlanSwipeRow>)}
          </>}
          {data[1].length>0&&<Text style={styles.heading}>Ideas</Text>}
          <View style={styles.ideas}>
            {data[0].map(idea=> {
              const essentials=idea.items;
              const count=essentials.filter(i=>i.matches.length).length;
              return <HapticPressable key={idea.id} disabled={busy} accessibilityRole="button" accessibilityLabel={`View ${idea.name}`}
                onPress={()=>{const saved=data[1].find(p=>p.templateId===idea.id);navigation.push('Projects',saved?{id:saved.id}:{templateId:idea.id});}} style={styles.idea}>
                <View style={styles.ideaText}>
                  <Text style={styles.headingText}>{idea.name}</Text>
                  <Text style={styles.body}>{idea.description}</Text>
                  {!!count&&<Text style={styles.hint}>{count} of {essentials.length} items nearby</Text>}
                </View>
                <ProjectIllustration projectId={idea.id} width={compact?96:120} height={116}/>
                <Icon name="chevron-forward" size={16}/>
              </HapticPressable>;
            })}
          </View>
        </>:<>
          <View style={creating?styles.builder:undefined}>
          {creating&&<View style={styles.nameField}><Text style={styles.label}>Plan name</Text><TextInput accessibilityLabel="Plan name" value={planName} onChangeText={setPlanName} maxLength={80} placeholder="e.g. Backyard cookout" placeholderTextColor={COLORS.textMuted} style={styles.input}/></View>}
          <View style={creating?styles.builderHeading:styles.summary}>
            <View style={styles.progressRow}><Text style={styles.headingText}>{creating?'What you’ll need':'Your checklist'}</Text>
              {!!data.items.length&&<HapticPressable disabled={busy} accessibilityRole="button" accessibilityLabel={editing?'Finish editing checklist':'Edit checklist'} onPress={()=>setEditing(!editing)} style={styles.editControl}><Text style={styles.editText}>{editing?'Done':'Edit list'}</Text></HapticPressable>}
            </View>
            {!data.items.length?<Text style={styles.body}>Add what you need for this plan.</Text>:id&&<>
            <View style={styles.progressRow}><Text style={styles.body}>{progress.covered} ready{progress.waiting?` · ${progress.waiting} waiting`:''} · {progress.total-progress.covered-progress.waiting} to find</Text><Text style={styles.hint}>{progress.covered} of {progress.total}</Text></View>
            <View accessibilityRole="progressbar" accessibilityValue={{min:0,max:progress.total,now:progress.covered}} style={styles.track}>
              <View style={[styles.fill,{width:`${progress.total?progress.covered/progress.total*100:0}%`}]}/>
            </View>
            </>}
          </View>
          <View style={styles.checklist}>
            {data.items.map(item=> {
              const state=projectItemState(item);
              const hasExchange=!!item.transactionId;
              return <PlanSwipeRow key={item.id} label={item.label} backgroundColor={creating?COLORS.surface:COLORS.background} disabled={busy||editedItem===item.id} onRemove={()=>requestRemoveItem(item)}><View style={styles.item}>
                {editedItem===item.id?<View style={styles.itemEditor}>
                  <Text style={styles.label}>Item name</Text>
                  <TextInput accessibilityLabel="Checklist item name" value={editedLabel} onChangeText={setEditedLabel} maxLength={60} autoFocus style={styles.input}/>
                  <View style={styles.editorActions}>
                    <ActionButton label="Cancel" disabled={busy} onPress={()=>{Keyboard.dismiss();setEditedItem(null);}} style={styles.editorButton}/>
                    <ActionButton label="Save item" variant="primary" disabled={busy||!editedLabel.trim()} onPress={saveItem} style={styles.editorButton}/>
                  </View>
                </View>:<>
                <View style={[styles.row,compact&&styles.compactRow]}>
                  <HapticPressable disabled={busy} accessibilityRole="button" accessibilityLabel={`Options for ${item.label}`} onPress={()=>setSheet({type:'item',item})} style={styles.itemPicture}><ProjectItemIllustration label={item.label} icon={item.icon} size={66}/></HapticPressable>
                  <View style={styles.itemText}>
                    <HapticPressable disabled={busy} accessibilityRole="button" accessibilityLabel={`Edit or remove ${item.label}`} onPress={()=>setSheet({type:'item',item})} style={styles.itemName}>
                      <Text style={[styles.label,{flex:1}]}>{item.label}</Text><Icon name="ellipsis-horizontal" size={18}/>
                    </HapticPressable>
                    {!creating&&<Text style={[styles.body,state.covered&&styles.readyText]}>{state.label}</Text>}
                    {item.endDate&&['approved','paid','picked_up'].includes(item.transactionStatus)&&<Text style={styles.hint}>Return by {formatCalendarDate(item.endDate,{month:'short',day:'numeric'})}</Text>}
                    {hasExchange&&<HapticPressable accessibilityRole="button" accessibilityLabel={`View exchange for ${item.label}`}
                      onPress={()=>navigation.navigate('TransactionDetail',{id:item.transactionId})}><Text style={styles.textLink}>View exchange</Text></HapticPressable>}
                    {!creating&&!editing&&!hasExchange&&!item.owned&&<HapticPressable disabled={busy} accessibilityRole="checkbox"
                      accessibilityState={{checked:false}} accessibilityLabel={`I have ${item.label}`}
                      onPress={()=>setOwned(item,true)} style={styles.haveOption}>
                      <Icon name="selection-check-empty" size={16} illustrated={false}/><Text style={styles.hint}>Already have this</Text>
                    </HapticPressable>}
                  </View>
                  {editing?<HapticPressable disabled={busy} accessibilityRole="button" accessibilityLabel={`Remove ${item.label}`} style={styles.checkControl}
                    onPress={()=>requestRemoveItem(item)}><Icon name="trash" size={24}/></HapticPressable>:hasExchange?<Icon name={state.covered?'selection-check':'time'} size={26}/>:item.owned?
                    <HapticPressable disabled={busy} accessibilityRole="checkbox" accessibilityState={{checked:true}}
                      accessibilityLabel={`I have ${item.label}`} onPress={()=>setOwned(item,false)} style={styles.checkControl}>
                      <Icon name="selection-check" size={26}/>
                    </HapticPressable>:
                    !creating&&<ActionButton label={item.matches.length?'Find':'Ask'} accessibilityLabel={`Find ${item.label}`} onPress={()=>openMatches(item)} style={styles.findButton}/>
                  }
                </View>
                {!editing&&state.ended&&<HapticPressable disabled={busy} accessibilityRole="button" style={styles.retryItem}
                  onPress={()=>mutate(()=>api.resetProjectItem(id,item.id))}><Text style={styles.textLink}>Find another</Text></HapticPressable>}
                </>}
              </View></PlanSwipeRow>;
            })}
          </View>
          {!creating&&!adding?<ActionButton label="Add item" icon="add" style={styles.addButton} onPress={()=>setAdding(true)}/>:<View style={creating?styles.builderAdd:styles.summary}>
            {!creating&&<Text style={styles.label}>Add an item</Text>}
            <TextInput accessibilityLabel="Add a checklist item" placeholder="e.g. Folding chairs" placeholderTextColor={COLORS.textMuted}
              value={custom} onChangeText={setCustom} maxLength={60} returnKeyType="done" onSubmitEditing={()=>!busy&&custom.trim()&&addItem()} style={styles.input}/>
            <ActionButton disabled={busy||!custom.trim()} label="Add item" icon="add" onPress={addItem}/>
          </View>}
          </View>
          {!id&&<ActionButton testID="Projects.savePlan" disabled={busy||(newCustom&&!planName.trim())} loading={busy} label="Save plan" variant="primary" style={styles.planButton} onPress={save}/>}
          {id&&<><ActionButton label="View pickup & return plan" variant="primary" style={styles.planButton} onPress={()=>setSheet({type:'plan'})}/>
          <HapticPressable accessibilityRole="button" style={styles.remove} onPress={()=>setSheet({type:'remove'})}><Text style={styles.hint}>Remove plan</Text></HapticPressable></>}
        </>}
      </View>
    </BorrowhoodRefreshScrollView>
    <ActionSheet key={sheet?.type||'closed'} variant={sheet?.type==='item'?'item':'menu'} icon={sheet?.type==='item'?<ProjectItemIllustration label={sheet.item.label} icon={sheet.item.icon} size={56}/>:undefined} isVisible={!!sheet} onClose={()=>setSheet(null)} title={['matches','item','exchanges'].includes(sheet?.type)?sheet.item.label:sheet?.type==='plan'?'Pickup & return plan':sheet?.type==='removeItem'?`Remove ${sheet.item.label}?`:'Remove this plan?'} message={sheet?.type==='exchanges'?sheet.exchanges.length?'Choose the borrow for this checklist item.':'No active borrows yet.':sheet?.type==='item'&&sheet.item.transactionId?'Removing this item keeps its request or exchange active in Your exchanges.':sheet?.type==='removeItem'?'This removes it from your checklist. Its request or exchange stays active in Your exchanges.':['remove','removeSaved'].includes(sheet?.type)?'This removes your checklist. Existing requests and exchanges stay active.':sheet?.type==='matches'&&!sheet.item.matches.length?'No matching items right now. Check again later or ask your neighbors in Wanted.':sheet?.type==='plan'&&!data.items?.some(i=>i.transactionId)?'Your requests will appear here after you choose an item and send a request.':undefined}
      actions={sheet?.type==='item'?[...(sheet.item.transactionId?[{label:'View exchange',icon:<Icon name="swap-horizontal" size={24}/>,onPress:()=>navigation.navigate('TransactionDetail',{id:sheet.item.transactionId})}]:[{label:'Edit item',icon:<Icon name="pencil" size={28}/>,onPress:()=>editItem(sheet.item)},...(!sheet.item.owned?[{label:'Use an existing exchange',icon:<Icon name="handshake" size={28}/>,onPress:()=>openExchanges(sheet.item)}]:[])]),{label:'Remove item',destructive:true,icon:<Icon name="trash" size={27} color={COLORS.danger} fillColor={COLORS.dangerMuted} illustrated/>,onPress:()=>removeItem(sheet.item)}]:sheet?.type==='exchanges'?sheet.exchanges.map(exchange=>({label:`${exchange.listing.title} · ${projectItemState({transactionId:exchange.id,transactionStatus:exchange.status}).label}`,icon:<Icon name="swap-horizontal" size={24}/>,onPress:()=>linkExchange(sheet.item,exchange)})):sheet?.type==='matches'?sheet.item.matches.map(listing=>({label:listing.title,icon:<ShimmerImage source={{uri:listing.photoUrl}} placeholderIcon={sheet.item.icon} style={{width:36,height:36,borderRadius:8}}/>,onPress:()=>navigation.navigate('ListingDetail',{id:listing.id,...planContext(sheet.item)})})):sheet?.type==='plan'?(data.items||[]).filter(i=>i.transactionId).map(item=>({label:`${item.label} · ${projectItemState(item).label}${item.endDate && ['approved','paid','picked_up'].includes(item.transactionStatus) ? ` · Return by ${formatCalendarDate(item.endDate,{month:'short',day:'numeric'})}` : ''}`,icon:<ProjectItemIllustration label={item.label} icon={item.icon} size={34}/>,onPress:()=>navigation.navigate('TransactionDetail',{id:item.transactionId})})):sheet?.type==='removeItem'?[{label:'Remove from checklist',destructive:true,onPress:()=>removeItem(sheet.item)}]:sheet?.type==='removeSaved'?[{label:'Remove plan',destructive:true,onPress:()=>mutate(()=>api.deleteProject(sheet.project.id))}]:sheet?.type==='remove'?[{label:'Remove checklist',destructive:true,onPress:()=>{const isCurrent=startNavigationTask();return mutate(async()=>{await api.deleteProject(id);if(isCurrent())navigation.goBack();});}}]:[]}/>
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
  editControl:{minHeight:44,justifyContent:'center',paddingHorizontal:6},
  editText:{...TYPOGRAPHY.footnote,color:COLORS.primary,fontFamily:'DMSans_600SemiBold'},
  saved:{padding:16,borderRadius:18,backgroundColor:COLORS.surface,flexDirection:'row',alignItems:'center',gap:12},
  summary:{padding:18,gap:10,borderRadius:20,backgroundColor:COLORS.surface,borderWidth:1,borderColor:COLORS.borderLight},
  builder:{padding:18,borderRadius:20,backgroundColor:COLORS.surface,borderWidth:1,borderColor:COLORS.borderLight},
  nameField:{gap:10,paddingBottom:20,borderBottomWidth:1,borderBottomColor:COLORS.borderLight},
  builderHeading:{gap:8,paddingTop:16},
  builderAdd:{gap:10,paddingTop:16},
  progressRow:{flexDirection:'row',justifyContent:'space-between',gap:8,flexWrap:'wrap'},
  track:{height:9,backgroundColor:'#E8E4D6',borderRadius:5,overflow:'hidden'},
  fill:{height:9,backgroundColor:'#82977C',borderRadius:5},
  checklist:{paddingTop:2},
  item:{paddingVertical:16,borderBottomWidth:1,borderBottomColor:COLORS.borderLight,gap:8},
  row:{width:'100%',minWidth:0,flexDirection:'row',alignItems:'center',gap:12},
  compactRow:{flexWrap:'wrap'},
  itemPicture:{width:66,height:72,borderRadius:16,backgroundColor:'#EAE5D6',alignItems:'center',justifyContent:'center'},
  itemText:{flex:1,minWidth:0,gap:4},
  itemName:{minWidth:0,paddingRight:6,flexDirection:'row',alignItems:'center',gap:4,minHeight:32},
  itemEditor:{gap:10},
  editorActions:{flexDirection:'row',gap:10},
  editorButton:{flex:1},
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
