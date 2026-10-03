import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../../services/api';
import ShimmerImage from '../../components/ShimmerImage';
import ActionButton from '../../components/ActionButton';
import HapticPressable from '../../components/HapticPressable';
import { Ionicons } from '../../components/Icon';
import { BASE_URL,COLORS,RADIUS,SPACING,TYPOGRAPHY } from '../../utils/config';

export default function PublicListingScreen({navigation,route}) {
  const [item,setItem]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const load=async()=>{
    setLoading(true);setError(false);
    try { setItem(await api.getPublicListing(route.params.id)); }
    catch { setItem(null);setError(true); }
    finally { setLoading(false); }
  };
  useEffect(()=>{load();},[route.params.id]);
  return <SafeAreaView style={styles.page}>
    <HapticPressable accessibilityRole="button" accessibilityLabel="Back to browsing" onPress={()=>navigation.goBack()} style={styles.back}>
      <Ionicons name="chevron-back" size={25} color={COLORS.primary} /><Text style={styles.backText}>Browse</Text>
    </HapticPressable>
    {loading ? <ActivityIndicator color={COLORS.primary} style={styles.center} /> : item ? <>
      <ScrollView contentContainerStyle={styles.content}>
        {item.photoUrl ? <ShimmerImage source={{uri:`${BASE_URL}${item.photoUrl}`}} title={item.title} style={styles.photo} />
          : <View style={[styles.photo,styles.placeholder]}><Ionicons name="basket-outline" size={48} color={COLORS.primary} /></View>}
        <Text style={styles.label}>{item.listingType==='giveaway'?'Free to keep':item.listingType==='sell'?'For sale':'Free to borrow'}</Text>
        <Text style={styles.title}>{item.title}</Text>
        {!!item.category && <Text style={styles.label}>{item.category}</Text>}
        {!!item.description && <Text style={styles.body}>{item.description}</Text>}
        <Text style={styles.caption}>The owner chose to show this preview publicly. Join to arrange an exchange with a neighbor.</Text>
      </ScrollView>
      <View style={styles.footer}><ActionButton variant="primary" label="Sign in or join to continue" onPress={()=>navigation.navigate('Welcome')} /></View>
    </> : <View style={styles.center}><Text style={styles.body}>{error?'This item is no longer available to browse.':'Item unavailable.'}</Text>
      <ActionButton label="Try again" onPress={load} /></View>}
  </SafeAreaView>;
}
const styles=StyleSheet.create({
  page:{flex:1,backgroundColor:COLORS.background},back:{flexDirection:'row',alignItems:'center',gap:6,padding:SPACING.md},
  backText:{...TYPOGRAPHY.body,color:COLORS.primary},content:{padding:SPACING.lg,gap:SPACING.md},
  photo:{width:'100%',height:260,borderRadius:RADIUS.md},placeholder:{backgroundColor:COLORS.primaryMuted,alignItems:'center',justifyContent:'center'},
  title:{...TYPOGRAPHY.title2,color:COLORS.text},label:{...TYPOGRAPHY.subheadline,color:COLORS.primary},
  body:{...TYPOGRAPHY.body,color:COLORS.text},caption:{...TYPOGRAPHY.footnote,color:COLORS.textSecondary},
  center:{flex:1,alignItems:'center',justifyContent:'center',gap:SPACING.md},footer:{padding:SPACING.md,borderTopWidth:1,borderTopColor:COLORS.border},
});
