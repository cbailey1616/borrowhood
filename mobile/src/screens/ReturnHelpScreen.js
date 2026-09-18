import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import TextInput from '../components/AppTextInput';
import ActionButton from '../components/ActionButton';
import ActionSheet from '../components/ActionSheet';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { COLORS, RADIUS } from '../utils/config';

const labels={confirm:'Confirm non-return',dismiss:'Dismiss report',uphold:'Uphold decision',overturn:'Overturn decision',ban:'Permanently restrict borrowing',restore:'Restore borrowing'};
const restrictionText={hold:'New borrowing is paused for at least 14 days and until outstanding returns are reviewed.',review:'New borrowing is paused while repeated non-returns are reviewed.',permanent:'You cannot start new exchanges. You can still arrange existing returns and appeal this decision.'};
const dateText=value=>value?new Date(value).toLocaleDateString():'';
const localDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export default function ReturnHelpScreen({route,navigation}) {
  const {user}=useAuth();
  const admin=!!route.params?.admin && !!user?.isAdmin;
  const transactionId=route.params?.transaction?.id;
  const [transaction,setTransaction]=useState(null);
  const [data,setData]=useState({reports:[],restriction:null,page:1,hasMore:false});
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
  const [form,setForm]=useState(null),[note,setNote]=useState(''),[decision,setDecision]=useState(null),[policy,setPolicy]=useState(false);
  const [date,setDate]=useState(new Date(Date.now()+86400000)),[picker,setPicker]=useState(false);
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
  useEffect(()=>{setForm(null);load();return()=>{generation.current++;};},[load]);
  const begin=(kind,report=null)=>{setForm({kind,report});setNote('');setError('');setSuccess('');
    if(kind==='extend'){const end=new Date(transaction.endDate);setDate(new Date(Math.max(end.getTime(),Date.now())+86400000));}};
  const submit=async(action=null)=>{
    if(flight.current||!form)return;
    if(form.kind!=='extend' && note.trim().length<10){setError('Please add a little more detail (at least 10 characters).');return;}
    const token=generation.current;flight.current=true;setBusy(true);setError('');
    try {
      if(form.kind==='report')await api.reportNonReturn(transactionId,note.trim());
      else if(form.kind==='extend')await api.extendReturn(transactionId,localDate(date));
      else if(form.kind==='review')await api.reviewReturnReport(form.report.id,{action,note:note.trim(),version:form.report.version});
      else await api.respondReturnReport(form.report.id,note.trim(),form.report.version,form.kind==='appeal');
      if(token!==generation.current)return;
      setForm(null);setSuccess(form.kind==='report'?'Report saved. Your neighbor has 48 hours to respond. A report alone does not cause a ban.':'Update saved.');await load();
    }catch(e){if(token===generation.current)setError(e.message||'Could not save. Refresh and try again.');}
    finally{flight.current=false;setBusy(false);}
  };
  const action=(label,onPress,danger=false)=> <ActionButton key={label} label={label} onPress={onPress} disabled={busy||loading}
    style={[styles.button,danger&&styles.danger]} destructive={danger} />;
  const activeOwner=transaction?.isLender && !['giveaway','sell'].includes(transaction?.listing?.listingType||transaction?.listingType)
    && ['picked_up','return_pending'].includes(transaction?.status) && transaction.actualPickupAt && !transaction.actualReturnAt;
  const renderForm=()=>form&&<View style={styles.card}>
    <Text style={styles.title}>{form.kind==='report'?'Item not returned':form.kind==='extend'?'Give more time':form.kind==='appeal'?'Appeal this decision':form.kind==='review'?'Review this report':'Your response'}</Text>
    {form.kind==='extend'?<>
      <Text style={styles.body}>Choose the new date you agreed with your neighbor. The item stays unavailable until you confirm its return.</Text>
      {action(`Return by ${date.toLocaleDateString()}`,()=>setPicker(true))}
      {picker&&<DateTimePicker value={date} mode="date" minimumDate={new Date()} maximumDate={new Date(Date.now()+90*86400000)}
        onChange={(event,value)=>{if(Platform.OS!=='ios')setPicker(false);if(value)setDate(value);}} />}
    </>:<>
      <Text style={styles.body}>{form.kind==='review'?'Check the pickup, agreed date, both accounts and the response before deciding. Silence alone is not proof. Your reason is shared with both people.':'Explain what happened, including any agreed return arrangements. Your message is shared with the other person and the review team.'}</Text>
      <TextInput accessibilityLabel="Return details" value={note} onChangeText={setNote} maxLength={2000} multiline editable={!busy}
        placeholder="What happened?" placeholderTextColor={COLORS.textSecondary} style={styles.input}/>
    </>}
    {form.kind==='review'?<>
      {(form.report.status==='open'?['confirm','dismiss']:form.report.appeal_status==='pending'?['overturn','uphold']:[]).map(a=>action(labels[a],()=>setDecision(a),a==='confirm'))}
      {form.report.confirmed_owners>=3 && form.report.restriction?.state==='review' && action(labels.ban,()=>setDecision('ban'),true)}
      {form.report.restriction?.state==='hold' && action(labels.restore,()=>setDecision('restore'))}
    </>:action(form.kind==='report'?'Send report':form.kind==='extend'?'Save return date':form.kind==='appeal'?'Send appeal':'Send response',()=>setDecision(form.kind))}
    {action('Cancel',()=>setForm(null))}
  </View>;
  return <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
    <Text style={styles.heading}>{admin?'Return reviews':transaction?.listing?.title||'Return help'}</Text>
    <Text style={styles.body}>The owner confirms when an item is back. Existing messages and returns stay available during borrowing restrictions.</Text>
    {loading&&<ActivityIndicator color={COLORS.spinner}/>}
    {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!!success&&<Text accessibilityRole="alert" style={styles.body}>{success}</Text>}
    {!!data.restriction&&<View style={styles.notice}><Text style={styles.title}>Borrowing paused</Text><Text style={styles.body}>{restrictionText[data.restriction.state]}</Text>
      {data.restriction.state==='hold'&&<Text style={styles.body}>Earliest review: {dateText(data.restriction.until_at)}</Text>}</View>}
    {!loading&&activeOwner&&!form&&<View style={styles.card}>
      {action('Give more time',()=>begin('extend'))}
      {!data.reports.some(r=>r.transaction_id===transactionId && !(r.status==='dismissed' && r.reported_due_date && new Date(r.due_date)>new Date(r.reported_due_date)))&&action('Item not returned',()=>begin('report'),true)}
      {action('Back to exchange',()=>navigation.goBack())}
    </View>}
    {renderForm()}
    {data.reports.map(r=><View key={r.id} style={styles.card}>
      <Text style={styles.title}>{r.title}</Text><Text style={styles.body}>{r.owner_name} → {r.borrower_name}</Text>
      <Text style={styles.label}>{r.status==='open'?'Awaiting review':r.status==='confirmed'?'Confirmed non-return':'Report dismissed'}{r.resolved_at?' · Return resolved':''}</Text>
      <Text style={styles.body}>Return due: {dateText(r.due_date)} · Pickup: {dateText(r.actual_pickup_at)}</Text>
      <Text style={styles.body}>{r.detail}</Text>
      <Text style={styles.body}>Respond by {new Date(r.response_due_at).toLocaleString()}</Text>
      {!!r.response&&<><Text style={styles.label}>Borrower’s response</Text><Text style={styles.body}>{r.response}</Text></>}
      {!!r.appeal&&<><Text style={styles.label}>Appeal · {r.appeal_status}</Text><Text style={styles.body}>{r.appeal}</Text></>}
      {r.history?.map((h,i)=><View key={i} style={styles.notice}><Text style={styles.label}>{labels[h.action]||h.action}</Text><Text style={styles.body}>{h.note}</Text></View>)}
      {admin&&<Text style={styles.body}>{r.confirmed_owners} different owners with confirmed incidents in the past 12 months. {r.restriction?restrictionText[r.restriction.state]:''}</Text>}
      {!form&&admin&&action('Review',()=>begin('review',r))}
      {!form&&r.borrower_id===user?.id&&r.status==='open'&&action(r.response?'Update response':'Respond',()=>begin('respond',r))}
      {!form&&r.borrower_id===user?.id&&r.status==='confirmed'&&r.appeal_status!=='pending'&&action('Appeal decision',()=>begin('appeal',r))}
      {action('View exchange',()=>navigation.navigate('TransactionDetail',{id:r.transaction_id}))}
    </View>)}
    {!loading&&!data.reports.length&&<Text style={styles.body}>No return reports.</Text>}
    {action('Refresh',()=>{setForm(null);load();})}
    {data.hasMore&&action('Load more',()=>load(data.page+1))}
    {action('How borrowing restrictions work',()=>setPolicy(!policy))}
    {policy&&<View style={styles.card}><Text style={styles.body}>Reports are reviewed before they count. Two confirmed non-returns from different owners within 12 months pause new borrowing for at least 14 days and until outstanding returns are reviewed. A third independent confirmed incident pauses borrowing for a permanent-ban review. Permanent restrictions require an administrator’s decision. You can appeal. Duplicate reports, agreed extensions and late returns alone do not count.</Text></View>}
    {!!decision&&<ActionSheet isVisible variant="confirmation" title={labels[decision]?`${labels[decision]}?`:decision==='extend'?'Save this return date?':'Send this update?'}
      message={decision==='ban'?'This permanently stops new borrowing. Existing messages, returns and appeals remain available.':decision==='confirm'?'Confirm only after reviewing evidence of an actual non-return. This can restrict new borrowing.':'This update will be recorded and shared with your neighbor.'}
      onClose={()=>setDecision(null)} actions={[{label:labels[decision]||'Confirm',destructive:['ban','confirm','report'].includes(decision),onPress:()=>submit(form?.kind==='review'?decision:null)}]}/>}
  </ScrollView>;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:COLORS.background},content:{padding:20,paddingBottom:50,gap:16,maxWidth:720,width:'100%',alignSelf:'center'},heading:{fontSize:28,color:COLORS.primary},title:{fontSize:20,color:COLORS.text},body:{fontSize:16,lineHeight:24,color:COLORS.textSecondary},label:{fontSize:15,lineHeight:22,color:COLORS.primary},card:{padding:18,borderRadius:RADIUS.lg,backgroundColor:COLORS.surface,gap:12},notice:{padding:16,borderRadius:RADIUS.md,backgroundColor:COLORS.primaryMuted,gap:8},input:{minHeight:120,borderRadius:RADIUS.md,padding:14,fontSize:16,color:COLORS.text,backgroundColor:COLORS.surfaceElevated,textAlignVertical:'top'},button:{minHeight:48,borderWidth:1,borderColor:COLORS.borderGreen,borderRadius:RADIUS.md},danger:{borderColor:COLORS.danger},error:{fontSize:16,color:COLORS.danger}});
