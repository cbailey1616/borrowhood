import { useCallback, useRef, useState } from 'react';
import { View, Text, Image, ScrollView, StyleSheet, ActivityIndicator, Platform, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import TextInput from '../components/AppTextInput';
import ActionButton from '../components/ActionButton';
import ActionRow from '../components/ActionRow';
import LayeredCard from '../components/LayeredCard';
import HapticPressable from '../components/HapticPressable';
import { Ionicons } from '../components/Icon';
import ActionSheet from '../components/ActionSheet';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../utils/config';
import { parseCalendarDate, formatCalendarDate } from '../utils/calendarDate';
import { returnExtensionDates, returnHelpGuidance } from '../utils/returnHelpGuidance';
import useNavigationTask from '../hooks/useNavigationTask';

const labels={confirm:'Confirm non-return',dismiss:'Dismiss report',uphold:'Uphold decision',overturn:'Overturn decision',ban:'Permanently restrict borrowing',restore:'Restore borrowing'};
const restrictionText={hold:'New borrowing is paused for at least 14 days and until outstanding returns are reviewed.',review:'New borrowing is paused while repeated non-returns are reviewed.',permanent:'You cannot start new exchanges. You can still arrange existing returns and appeal this decision.'};
const dateText=value=>value?new Date(value).toLocaleDateString():'';
const localDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const returnDateLabel=value=>formatCalendarDate(value,{weekday:'short',month:'short',day:'numeric',year:'numeric'});
export default function ReturnHelpScreen({route,navigation}) {
  const {user}=useAuth();
  const admin=!!route.params?.admin && !!user?.isAdmin;
  const transactionId=route.params?.transaction?.id;
  const startNavigationTask=useNavigationTask(navigation,transactionId);
  const [transaction,setTransaction]=useState(null);
  const [data,setData]=useState({reports:[],restriction:null,page:1,hasMore:false});
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
  const [form,setForm]=useState(null),[note,setNote]=useState(''),[decision,setDecision]=useState(null),[policy,setPolicy]=useState(false);
  const [date,setDate]=useState(()=>new Date()),[picker,setPicker]=useState(false);
  const [messaging,setMessaging]=useState(false);
  const generation=useRef(0),flight=useRef(false);
  const load=useCallback(async(page=1)=>{
    const token=++generation.current;setLoading(true);setError('');
    try {
      const [result,t]=await Promise.all([api.getReturnHelp(admin,page,transactionId),transactionId?api.getTransaction(transactionId):null]);
      if(token!==generation.current)return;
      setData(previous=>({...result,reports:page===1?result.reports:[...previous.reports,...result.reports]}));setTransaction(t);
    }catch(e){if(token===generation.current)setError(e.message||'Could not load return help.');}
    finally{if(token===generation.current)setLoading(false);}
  },[admin,transactionId]);
  useFocusEffect(useCallback(()=>{
    setForm(null);setDecision(null);setPicker(false);setSuccess('');setMessaging(false);
    setTransaction(null);setData({reports:[],restriction:null,page:1,hasMore:false});load();
    return()=>{generation.current++;};
  },[load]));
  const begin=(kind,report=null)=>{setForm({kind,report});setPicker(false);setNote('');setError('');setSuccess('');
    if(kind==='extend')setDate(returnExtensionDates(transaction.endDate).initialDate);};
  const submit=async(action=null)=>{
    if(flight.current||!form)return;
    if(form.kind!=='extend' && note.trim().length<10){setError('Please add a little more detail (at least 10 characters).');return;}
    if(form.kind==='extend'){
      const {minimumDate,maximumDate,available}=returnExtensionDates(transaction.endDate);
      const selected=parseCalendarDate(localDate(date));
      if(!available||!selected||selected<minimumDate||selected>maximumDate){setError('Choose a later return date within the next 90 days.');return;}
    }
    const token=generation.current;flight.current=true;setBusy(true);setError('');
    try {
      if(form.kind==='report')await api.reportNonReturn(transactionId,note.trim());
      else if(form.kind==='extend')await api.extendReturn(transactionId,localDate(date));
      else if(form.kind==='review')await api.reviewReturnReport(form.report.id,{action,note:note.trim(),version:form.report.version});
      else await api.respondReturnReport(form.report.id,note.trim(),form.report.version,form.kind==='appeal');
      if(token!==generation.current)return;
      setForm(null);setPicker(false);setSuccess(form.kind==='report'?'Report saved. Your neighbor has 48 hours to respond. A report alone does not cause a ban.':form.kind==='extend'?`Return date saved: ${returnDateLabel(date)}.`:'Update saved.');await load();
    }catch(e){if(token===generation.current)setError(e.message||'Could not save. Refresh and try again.');}
    finally{flight.current=false;setBusy(false);}
  };
  const action=(label,onPress,danger=false,primary=false)=> <ActionButton key={label} label={label} onPress={onPress} disabled={busy||loading}
    variant={primary?'primary':'secondary'} destructive={danger} />;
  const refresh=()=>{if(!busy&&!form)load();};
  const guidance=returnHelpGuidance(transaction);
  const editingDate=form?.kind==='extend';
  const extensionDates=returnExtensionDates(transaction?.endDate);
  const viewExchange=()=>navigation.navigate('TransactionDetail',{id:transactionId});
  const messageNeighbor=async()=>{
    if(!guidance?.canMessage||messaging)return;
    const isCurrent=startNavigationTask();setMessaging(true);
    const params={recipientId:guidance.neighbor.id,recipient:guidance.neighbor,listingId:transaction.listing?.id,
      listing:transaction.listing,threadContext:{id:transaction.listing?.id,title:transaction.listing?.title,type:'listing'}};
    try {
      const conversations=await api.getConversations();
      if(isCurrent())navigation.navigate('Chat',{...params,conversationId:conversations.find(chat=>chat.otherUser?.id===guidance.neighbor.id)?.id});
    }catch{if(isCurrent())navigation.navigate('Chat',params);}
    finally{if(isCurrent())setMessaging(false);}
  };
  const existingReport=data.reports.some(r=>r.transaction_id===transactionId && !(r.status==='dismissed' && r.reported_due_date && new Date(r.due_date)>new Date(r.reported_due_date)));
  const exchangeFirst=guidance?.exchangeFirst||!guidance?.canMessage;
  const showOptions=guidance&&(guidance.canExtend||guidance.canMessage||!exchangeFirst);
  const showSecondary=guidance?.canMessage||!exchangeFirst;
  const renderForm=()=>form&&<LayeredCard style={styles.card}>
    <View style={styles.statusHeading}>
      {editingDate&&<View style={styles.iconTile}><Ionicons name="calendar-outline" size={28} color={COLORS.primary}/></View>}
      <Text style={styles.statusTitle}>{form.kind==='report'?'Item not returned':editingDate?'Give more time':form.kind==='appeal'?'Appeal this decision':form.kind==='review'?'Review this report':'Your response'}</Text>
    </View>
    {editingDate?<>
      <Text style={styles.body}>Choose a new date you’ve agreed with {guidance.neighbor?.firstName||'your neighbor'}.</Text>
      <View style={styles.currentDate}>
        <Text style={styles.dateLabel}>Current return date</Text>
        <Text style={styles.dateValue}>{returnDateLabel(transaction.endDate)||'Not set'}</Text>
      </View>
      {extensionDates.available?<>
        <HapticPressable accessibilityLabel={`Change return date, ${returnDateLabel(date)}`} accessibilityState={{expanded:picker,disabled:busy}}
          disabled={busy} onPress={()=>setPicker(!picker)} style={[styles.dateButton,picker&&styles.dateButtonActive]}>
          <View style={styles.dateCopy}><Text style={styles.dateLabel}>New return date</Text><Text style={styles.dateValue}>{returnDateLabel(date)}</Text></View>
          <Ionicons name={picker?'chevron-up':'chevron-down'} size={20} color={COLORS.primary}/>
        </HapticPressable>
        {picker&&<View style={styles.datePickerCard}>
          <DateTimePicker accessibilityLabel="New return date" value={date} mode="date" display={Platform.OS==='ios'?'spinner':'default'}
            themeVariant="light" textColor={COLORS.text} accentColor={COLORS.primary} style={styles.datePicker} disabled={busy}
            minimumDate={extensionDates.minimumDate} maximumDate={extensionDates.maximumDate}
            onChange={(event,value)=>{if(busy)return;if(Platform.OS!=='ios')setPicker(false);if(event.type!=='dismissed'&&value){setDate(value);setError('');}}}/>
          {Platform.OS==='ios'&&<HapticPressable accessibilityLabel="Done choosing return date" disabled={busy} style={styles.dateDone} onPress={()=>setPicker(false)}><Text style={styles.dateDoneLabel}>Done</Text></HapticPressable>}
        </View>}
        <View style={styles.dateNote}>
          <Ionicons name="notifications-outline" size={20} color={COLORS.primary}/>
          <Text style={[styles.body,styles.dateCopy]}>We’ll let {guidance.neighbor?.firstName||'your neighbor'} know. You’ll still confirm when the item is back.</Text>
        </View>
      </>:<Text style={styles.body}>This return is already at the latest date available. You can still message your neighbor to arrange the handoff.</Text>}
      {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </>:<>
      <Text style={styles.body}>{form.kind==='review'?'Check the pickup, agreed date, both accounts and the response before deciding. Silence alone is not proof. Your reason is shared with both people.':'Explain what happened, including any agreed return arrangements. Your message is shared with the other person and the review team.'}</Text>
      <TextInput accessibilityLabel="Return details" value={note} onChangeText={setNote} maxLength={2000} multiline editable={!busy}
        placeholder="What happened?" placeholderTextColor={COLORS.textSecondary} style={styles.input}/>
    </>}
    {form.kind==='review'?<>
      {(form.report.status==='open'?['confirm','dismiss']:form.report.appeal_status==='pending'?['overturn','uphold']:[]).map(a=>action(labels[a],()=>setDecision(a),a==='confirm'))}
      {form.report.confirmed_owners>=3 && form.report.restriction?.state==='review' && action(labels.ban,()=>setDecision('ban'),true)}
      {form.report.restriction?.state==='hold' && action(labels.restore,()=>setDecision('restore'))}
    </>:editingDate?<ActionButton label="Save return date" variant="primary" icon="checkmark" loading={busy} disabled={loading||!extensionDates.available} onPress={()=>submit()}/>
      :action(form.kind==='report'?'Send report':form.kind==='appeal'?'Send appeal':'Send response',()=>setDecision(form.kind),form.kind==='report',true)}
    {action('Cancel',()=>{setForm(null);setPicker(false);setError('');})}
  </LayeredCard>;
  return <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
    refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} enabled={!busy&&!form} tintColor={COLORS.spinner} colors={[COLORS.spinner]} />}>
    {transaction?.listing ? <LayeredCard radius={RADIUS.xl}>
      <View style={styles.itemSummary}>
        {transaction.listing.photos?.[0] ? <Image source={{uri:transaction.listing.photos[0]}} style={styles.itemPhoto} resizeMode="cover" />
          : <View style={[styles.itemPhoto,styles.placeholder]}><Ionicons name="cube-outline" size={36} color={COLORS.primary} /></View>}
        <View style={styles.itemCopy}>
          <Text style={styles.eyebrow}>{transaction.isLender?'Your item':'You borrowed'}</Text>
          <Text style={styles.heading}>{transaction.listing.title}</Text>
          {!!guidance?.neighbor?.firstName&&<Text style={styles.body}>{transaction.isLender?'With':'From'} {guidance.neighbor.firstName}</Text>}
        </View>
      </View>
    </LayeredCard> : !transactionId&&<View style={styles.pageHeading}>
      <View style={styles.iconTile}><Ionicons name="return-down-back-outline" size={28} color={COLORS.primary} /></View>
      <Text style={styles.heading}>{admin?'Return reviews':'Return help'}</Text>
    </View>}
    {loading&&!guidance&&!data.reports.length&&<ActivityIndicator color={COLORS.spinner} accessibilityLabel="Loading return details"/>}
    {!!error&&!editingDate&&<View style={styles.section}><Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      {!form&&<ActionButton label="Try again" icon="refresh-outline" disabled={loading||busy} onPress={refresh}/>}</View>}
    {!!success&&<View style={styles.successNotice} accessibilityRole="alert"><Ionicons name="checkmark-circle-outline" size={24} color={COLORS.primary}/><Text style={styles.success}>{success}</Text></View>}
    {!!data.restriction&&<View style={styles.notice}><Text style={styles.title}>Borrowing paused</Text><Text style={styles.body}>{restrictionText[data.restriction.state]}</Text>
      {data.restriction.state==='hold'&&<Text style={styles.body}>Earliest review: {dateText(data.restriction.until_at)}</Text>}</View>}
    {guidance&&!form&&<>
      <View style={[styles.returnStatus,guidance.overdue&&styles.overdueStatus]}>
        <View style={styles.statusHeading}>
          <Ionicons name={guidance.icon} size={28} color={guidance.overdue?COLORS.warning:COLORS.primary}/>
          <Text style={styles.statusTitle}>{guidance.title}</Text>
        </View>
        {guidance.overdue&&!!guidance.dueLabel&&<Text style={styles.dueDate}>Was due {guidance.dueLabel}</Text>}
        <Text style={styles.body}>{guidance.detail}</Text>
        <ActionButton label={exchangeFirst?'View exchange':guidance.messageLabel} icon={exchangeFirst?'receipt-outline':'chatbubble-outline'}
          variant="primary" disabled={busy||loading} loading={!exchangeFirst&&messaging} onPress={exchangeFirst?viewExchange:messageNeighbor}/>
      </View>
      {showOptions&&<View style={styles.section}>
        <Text style={styles.sectionLabel}>Return options</Text>
        <LayeredCard>
          {guidance.canExtend&&<ActionRow label="Give more time" description="Agree on a later return date" icon="calendar-outline" disabled={busy||loading} onPress={()=>begin('extend')}/>}
          {guidance.canRequestTime&&guidance.canMessage&&<ActionRow label="Need more time?" description="Ask the owner about a new date" icon="calendar-outline" disabled={busy||loading||messaging} onPress={messageNeighbor}/>}
          {(guidance.canExtend||guidance.canRequestTime)&&showSecondary&&<View style={styles.divider}/>}
          {exchangeFirst&&guidance.canMessage?<ActionRow label={guidance.messageLabel} description="Keep return arrangements in one place" icon="chatbubble-outline" disabled={busy||loading||messaging} onPress={messageNeighbor}/>
            :!exchangeFirst?<ActionRow label="View exchange" description={guidance.exchangeDescription} icon="receipt-outline" disabled={busy||loading} onPress={viewExchange}/>:null}
          {guidance.canReport&&!existingReport&&<><View style={styles.divider}/><ActionRow label="Item not returned" description="Ask for help with a missing return" icon="flag-outline" variant="danger" style={styles.reportRow} disabled={busy||loading} onPress={()=>begin('report')}/></>}
        </LayeredCard>
      </View>}
    </>}
    {!loading&&!error&&!transactionId&&!admin&&<View style={styles.returnStatus}>
      <Text style={styles.statusTitle}>Need help with a return?</Text>
      <Text style={styles.body}>Choose an exchange to arrange a return, agree on more time, or report a missing item.</Text>
      <ActionButton label="View my exchanges" icon="swap-horizontal-outline" variant="primary" onPress={()=>navigation.navigate('Main',{screen:'Activity',params:{tab:'activity'}})}/>
    </View>}
    {renderForm()}
    {!editingDate&&(admin||data.reports.length>0||!!data.restriction)&&<>
    {(data.reports.length>0||(admin&&!loading&&!error))&&<View style={styles.sectionHeader}>
      {data.reports.length>0?<Text style={styles.title}>Return reports</Text>:<View style={styles.quietStatus}>
        <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.primary}/>
        <Text style={[styles.body,styles.quietStatusText]}>No reports to review</Text>
      </View>}
      <HapticPressable onPress={refresh} disabled={busy||loading||!!form} style={styles.refreshButton} accessibilityLabel="Refresh reports">
        {loading?<ActivityIndicator color={COLORS.spinner}/>:<Ionicons name="refresh-outline" size={22} color={COLORS.primary} />}
      </HapticPressable>
    </View>}
    {data.reports.map(r=><LayeredCard key={r.id} style={styles.card}>
      <Text style={styles.title}>{r.title}</Text><Text style={styles.body}>{r.owner_name} → {r.borrower_name}</Text>
      <Text style={styles.label}>{r.status==='open'?'Awaiting review':r.status==='confirmed'?'Confirmed non-return':'Report dismissed'}{r.resolved_at?' · Return resolved':''}</Text>
      <Text style={styles.body}>Return due: {formatCalendarDate(r.due_date)} · Pickup: {dateText(r.actual_pickup_at)}</Text>
      <Text style={styles.body}>{r.detail}</Text>
      <Text style={styles.body}>Respond by {new Date(r.response_due_at).toLocaleString()}</Text>
      {!!r.response&&<><Text style={styles.label}>Borrower’s response</Text><Text style={styles.body}>{r.response}</Text></>}
      {!!r.appeal&&<><Text style={styles.label}>Appeal · {r.appeal_status}</Text><Text style={styles.body}>{r.appeal}</Text></>}
      {r.history?.map((h,i)=><View key={i} style={styles.notice}><Text style={styles.label}>{labels[h.action]||h.action}</Text><Text style={styles.body}>{h.note}</Text></View>)}
      {admin&&<Text style={styles.body}>{r.confirmed_owners} different owners with confirmed incidents in the past 12 months. {r.restriction?restrictionText[r.restriction.state]:''}</Text>}
      {!form&&admin&&action('Review',()=>begin('review',r))}
      {!form&&r.borrower_id===user?.id&&r.status==='open'&&action(r.response?'Update response':'Respond',()=>begin('respond',r),false,true)}
      {!form&&r.borrower_id===user?.id&&r.status==='confirmed'&&r.appeal_status!=='pending'&&action('Appeal decision',()=>begin('appeal',r),false,true)}
      {action('View exchange',()=>navigation.navigate('TransactionDetail',{id:r.transaction_id}))}
    </LayeredCard>)}
    {data.hasMore&&action('Load more',()=>load(data.page+1))}
    <HapticPressable style={styles.policyButton} onPress={()=>setPolicy(!policy)} accessibilityLabel="How return reports work" accessibilityState={{expanded:policy}}>
      <Ionicons name="information-circle-outline" size={20} color={COLORS.textSecondary}/>
      <Text style={styles.policyLabel}>How return reports work</Text>
      <Ionicons name={policy?'chevron-up':'chevron-down'} size={18} color={COLORS.textSecondary}/>
    </HapticPressable>
    {policy&&<LayeredCard style={styles.card}>
      <Text style={styles.body}>Existing messages and returns stay available during borrowing restrictions.</Text>
      <Text style={styles.body}>Reports are reviewed before they count. Two confirmed non-returns from different owners within 12 months pause new borrowing for at least 14 days and until outstanding returns are reviewed. A third independent confirmed incident pauses borrowing for a permanent-ban review. Permanent restrictions require an administrator’s decision. You can appeal. Duplicate reports, agreed extensions and late returns alone do not count.</Text>
    </LayeredCard>}
    </>}
    {!!decision&&<ActionSheet isVisible variant="confirmation" title={labels[decision]?`${labels[decision]}?`:'Send this update?'}
      message={decision==='ban'?'This permanently stops new borrowing. Existing messages, returns and appeals remain available.':decision==='confirm'?'Confirm only after reviewing evidence of an actual non-return. This can restrict new borrowing.':'This update will be recorded and shared with your neighbor.'}
      onClose={()=>setDecision(null)} actions={[{label:labels[decision]||'Confirm',destructive:['ban','confirm','report'].includes(decision),onPress:()=>submit(form?.kind==='review'?decision:null)}]}/>}
  </ScrollView>;
}
const styles=StyleSheet.create({
  page:{flex:1,backgroundColor:COLORS.background},
  content:{padding:20,paddingBottom:50,gap:SPACING.lg,maxWidth:720,width:'100%',alignSelf:'center'},
  heading:{...TYPOGRAPHY.title3,color:COLORS.primary},title:{...TYPOGRAPHY.title3,color:COLORS.primary},
  body:{...TYPOGRAPHY.bodySmall,lineHeight:22,color:COLORS.textSecondary},label:{...TYPOGRAPHY.subheadline,color:COLORS.primary},
  card:{padding:18,gap:SPACING.md},section:{gap:SPACING.md,marginTop:SPACING.sm},
  notice:{padding:SPACING.lg,borderRadius:RADIUS.md,backgroundColor:COLORS.primaryMuted,gap:SPACING.sm},
  input:{...TYPOGRAPHY.body,minHeight:120,borderRadius:RADIUS.md,padding:14,color:COLORS.text,backgroundColor:COLORS.surfaceElevated,textAlignVertical:'top'},
  error:{...TYPOGRAPHY.body,color:COLORS.danger},
  success:{...TYPOGRAPHY.bodySmall,lineHeight:22,color:COLORS.primary,flex:1},
  successNotice:{padding:SPACING.lg,borderRadius:RADIUS.md,backgroundColor:COLORS.primaryMuted,flexDirection:'row',alignItems:'center',gap:SPACING.md},
  itemSummary:{flexDirection:'row',alignItems:'center',padding:SPACING.lg,gap:SPACING.lg},
  itemPhoto:{width:76,height:86,borderRadius:RADIUS.md,backgroundColor:COLORS.primaryMuted},
  placeholder:{alignItems:'center',justifyContent:'center'},itemCopy:{flex:1,minWidth:0,gap:SPACING.xs},
  eyebrow:{...TYPOGRAPHY.footnote,color:COLORS.textSecondary},
  sectionHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:SPACING.md},
  refreshButton:{width:44,height:44,borderRadius:RADIUS.full,backgroundColor:COLORS.surface,alignItems:'center',justifyContent:'center'},
  returnStatus:{padding:SPACING.lg,borderRadius:RADIUS.lg,backgroundColor:COLORS.primaryMuted,gap:SPACING.md},
  overdueStatus:{backgroundColor:COLORS.warningMuted},
  statusHeading:{flexDirection:'row',alignItems:'center',gap:SPACING.md},
  statusTitle:{...TYPOGRAPHY.title3,color:COLORS.primary,flexShrink:1},
  dueDate:{...TYPOGRAPHY.footnote,color:COLORS.warning},
  sectionLabel:{...TYPOGRAPHY.headline,color:COLORS.primary},
  divider:{height:1,backgroundColor:COLORS.border,marginHorizontal:SPACING.lg},
  reportRow:{borderWidth:0},
  quietStatus:{flex:1,flexDirection:'row',alignItems:'center',gap:SPACING.sm},
  quietStatusText:{flex:1},
  policyButton:{minHeight:44,flexDirection:'row',alignItems:'center',gap:SPACING.sm},
  policyLabel:{...TYPOGRAPHY.footnote,color:COLORS.textSecondary,flex:1},
  iconTile:{width:48,height:48,borderRadius:RADIUS.md,backgroundColor:COLORS.primaryMuted,alignItems:'center',justifyContent:'center'},
  pageHeading:{flexDirection:'row',alignItems:'center',gap:SPACING.md},
  currentDate:{paddingHorizontal:SPACING.sm,gap:SPACING.xs},
  dateLabel:{...TYPOGRAPHY.footnote,color:COLORS.textSecondary},
  dateValue:{...TYPOGRAPHY.headline,color:COLORS.primary},
  dateCopy:{flex:1,minWidth:0,gap:SPACING.xs},
  dateButton:{minHeight:76,padding:SPACING.md,borderWidth:1,borderColor:COLORS.primary,borderRadius:RADIUS.md,backgroundColor:COLORS.surface,flexDirection:'row',alignItems:'center',gap:SPACING.md},
  dateButtonActive:{backgroundColor:COLORS.primaryMuted},
  datePickerCard:{borderRadius:RADIUS.md,backgroundColor:COLORS.surfaceElevated,borderWidth:1,borderColor:COLORS.border,overflow:'hidden'},
  datePicker:{width:'100%',backgroundColor:COLORS.surfaceElevated},
  dateDone:{minHeight:44,minWidth:68,alignSelf:'flex-end',alignItems:'center',justifyContent:'center',margin:SPACING.sm,borderRadius:RADIUS.full,backgroundColor:COLORS.primaryMuted},
  dateDoneLabel:{...TYPOGRAPHY.headline,color:COLORS.primary},
  dateNote:{flexDirection:'row',alignItems:'flex-start',gap:SPACING.sm,paddingVertical:SPACING.sm},
});
