import { useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import HapticPressable from '../components/HapticPressable';
import ShimmerImage from '../components/ShimmerImage';
import MemberSummary from '../components/MemberSummary';
import VerifiedBadge from '../components/VerifiedBadge';
import api from '../services/api';
import { useError } from '../context/ErrorContext';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import { listingAvailability } from '../utils/listingAvailability';

const date = value => value ? new Date(value.slice(0,10) + 'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'}) : '';
export default function RequestQueueScreen({ route, navigation }) {
  const { listingId } = route.params;
  const [data,setData] = useState(null);
  const [error,setError] = useState(false);
  const [refreshing,setRefreshing] = useState(false);
  const [busy,setBusy] = useState(null);
  const action = useRef(false);
  const { showError,showToast } = useError();
  const load = useCallback(async () => {
    try { setData(await api.getRequestQueue(listingId));setError(false); }
    catch { setError(true); }
    finally { setRefreshing(false); }
  },[listingId]);
  useFocusEffect(useCallback(() => { load(); },[load]));
  const choose = async item => {
    if (action.current) return;
    action.current=true;setBusy(item.id);
    try { await api.approveRental(item.id); await load();showToast(`Reserved for ${item.borrower.firstName}`,'success');navigation.navigate('TransactionDetail',{id:item.id}); }
    catch (err) { showError({ message:err.message || 'This item may already be reserved. Refresh and try again.' });await load(); }
    finally { action.current=false;setBusy(null); }
  };
  if (!data) return <View style={styles.center}>{error ? <HapticPressable accessibilityRole="button" onPress={load}><Text style={styles.body}>Couldn’t load requests. Tap to retry.</Text></HapticPressable> : <ActivityIndicator color={COLORS.primary} />}</View>;
  const available = listingAvailability(data.listing).available;
  return <FlatList style={{backgroundColor:COLORS.background}} contentContainerStyle={{padding:SPACING.lg,paddingBottom:40}}
    data={data.requests} keyExtractor={item=>item.id} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}} tintColor={COLORS.primary} />}
    ListHeaderComponent={<View style={{gap:8,marginBottom:20}}>
      <Text style={{...TYPOGRAPHY.title2,color:COLORS.primary,fontWeight:'700'}}>{data.listing.title}</Text>
      <Text style={styles.body}>{data.requests.length} {data.requests.length===1 ? 'person waiting' : 'people waiting'} · First requested, first shown</Text>
      <Text style={styles.body}>{available ? 'Choose who works best for you.' : `${listingAvailability(data.listing).label}. You can choose someone when it’s available again.`}</Text>
      {!!data.activeTransactionId && <HapticPressable accessibilityRole="button" onPress={()=>navigation.navigate('TransactionDetail',{id:data.activeTransactionId})} style={styles.outline}><Text style={styles.action}>View current exchange</Text></HapticPressable>}
      {error && <Text accessibilityRole="alert" style={styles.body}>Couldn’t refresh. Pull down to try again.</Text>}
    </View>}
    ListEmptyComponent={<Text style={styles.body}>No one is waiting. New requests will appear here.</Text>}
    renderItem={({item})=><View style={styles.card}>
      <View style={{flexDirection:'row',gap:12,alignItems:'center'}}>
        <ShimmerImage source={item.borrower.profilePhotoUrl ? {uri:item.borrower.profilePhotoUrl} : null} placeholderIcon="person" style={{width:44,height:44,borderRadius:22}} />
        <View style={{flex:1,minWidth:0}}>
          <MemberSummary user={item.borrower}>
            <HapticPressable style={{flexShrink:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:6,minHeight:44}} accessibilityRole="button" accessibilityLabel={`View ${item.borrower.firstName}'s profile${item.borrower.isVerified === true ? ', verified identity' : ''}`} onPress={()=>navigation.navigate('UserProfile',{id:item.borrower.id})}>
              <Text style={{...TYPOGRAPHY.headline,color:COLORS.primary,flexShrink:1}}>{item.borrower.firstName}</Text>
              {item.borrower.isVerified === true && <VerifiedBadge size={18} />}
            </HapticPressable>
          </MemberSummary>
        </View>
        <Text style={styles.body}>#{item.position}</Text>
      </View>
      {!['giveaway','sell'].includes(data.listing.listingType) && <Text style={styles.body}>{date(item.startDate)} – {date(item.endDate)}</Text>}
      {!!item.message && <Text style={styles.body}>{item.message}</Text>}
      <View style={{flexDirection:'row',gap:12}}>
        <HapticPressable accessibilityRole="button" accessibilityLabel={`Message ${item.borrower.firstName}`} style={[styles.outline,{flex:1}]} onPress={()=>navigation.navigate('Chat',{recipientId:item.borrower.id,recipient:item.borrower,listingId,listing:data.listing})}><Text style={styles.action}>Message</Text></HapticPressable>
        <HapticPressable accessibilityRole="button" accessibilityLabel={`Choose ${item.borrower.firstName}`} disabled={!(item.canChoose ?? available) || !!busy || error} onPress={()=>choose(item)} style={[styles.choose,{flex:1,opacity:(item.canChoose ?? available) && !busy && !error ? 1 : 0.45}]}>{busy===item.id ? <ActivityIndicator color={COLORS.surface} /> : <Text style={{color:COLORS.surface,fontWeight:'700'}}>Choose</Text>}</HapticPressable>
      </View>
      <HapticPressable accessibilityRole="button" accessibilityLabel={`View ${item.borrower.firstName}'s request`} style={{minHeight:44,justifyContent:'center'}} onPress={()=>navigation.navigate('TransactionDetail',{id:item.id})}><Text style={styles.action}>View request</Text></HapticPressable>
    </View>} />;
}
const styles = {
  center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:COLORS.background},
  body:{...TYPOGRAPHY.footnote,color:COLORS.textSecondary},action:{color:COLORS.primary,fontWeight:'600'},
  card:{backgroundColor:COLORS.surface,borderWidth:1,borderColor:COLORS.borderGreen,borderRadius:RADIUS.lg,padding:SPACING.lg,marginBottom:12,gap:12},
  outline:{minHeight:48,borderWidth:1,borderColor:COLORS.primary,borderRadius:RADIUS.md,alignItems:'center',justifyContent:'center'},
  choose:{minHeight:48,backgroundColor:COLORS.primary,borderRadius:RADIUS.md,alignItems:'center',justifyContent:'center'},
};
