import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TextInput from '../../components/AppTextInput';
import ActionButton from '../../components/ActionButton';
import HapticPressable from '../../components/HapticPressable';
import ShimmerImage from '../../components/ShimmerImage';
import { Ionicons } from '../../components/Icon';
import api from '../../services/api';
import { BASE_URL, COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../utils/config';

const filters = [['all','All'],['lend','Borrow'],['giveaway','Giveaways'],['sell','For sale']];

export default function PublicMarketplaceScreen({ navigation }) {
  const [items,setItems] = useState([]);
  const [type,setType] = useState('all');
  const [search,setSearch] = useState('');
  const [query,setQuery] = useState('');
  const [page,setPage] = useState(1);
  const [hasMore,setHasMore] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState(false);

  const load = useCallback(async (nextPage=1) => {
    setLoading(true); setError(false);
    try {
      const data = await api.getPublicListings({ type, search:query, page:nextPage });
      setItems(previous => nextPage === 1 ? data.items : [...previous,...data.items]);
      setHasMore(data.hasMore); setPage(nextPage);
    } catch { setError(true); }
    finally { setLoading(false); }
  },[type,query]);
  useEffect(() => { load(1); },[load]);

  return <SafeAreaView style={styles.page}>
    <View style={styles.header}>
      <Text style={styles.title}>Explore Borrowhood</Text>
      <Text style={styles.caption}>Browse items people have chosen to show publicly. Join to borrow, post or connect with neighbors.</Text>
      <TextInput accessibilityLabel="Search public items" placeholder="Search items" value={search} onChangeText={setSearch}
        onSubmitEditing={() => setQuery(search.trim().slice(0,80))} returnKeyType="search" style={styles.search} />
      <View style={styles.filters}>{filters.map(([key,label]) => <HapticPressable key={key} accessibilityRole="button"
        accessibilityState={{ selected:type===key }} style={[styles.filter,type===key && styles.selected]}
        onPress={() => setType(key)}><Text style={[styles.filterText,type===key && styles.selectedText]}>{label}</Text></HapticPressable>)}</View>
    </View>
    <FlatList data={items} keyExtractor={item=>item.id} contentContainerStyle={styles.list}
      refreshing={loading && page===1} onRefresh={() => load(1)}
      onEndReached={() => { if (!loading && hasMore) load(page+1); }} onEndReachedThreshold={0.3}
      renderItem={({item}) => <HapticPressable style={styles.card} accessibilityRole="button"
        accessibilityLabel={`View ${item.title}`} onPress={() => navigation.navigate('PublicListing',{id:item.id})}>
        {item.photoUrl ? <ShimmerImage source={{uri:`${BASE_URL}${item.photoUrl}`}} title={item.title} style={styles.photo} />
          : <View style={[styles.photo,styles.placeholder]}><Ionicons name="basket-outline" size={28} color={COLORS.primary} /></View>}
        <View style={styles.cardCopy}><Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.caption}>{item.category || (item.listingType==='giveaway'?'Giveaway':item.listingType==='sell'?'For sale':'Borrow')}</Text>
        </View><Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
      </HapticPressable>}
      ListEmptyComponent={!loading && <View style={styles.empty}>
        <Ionicons name="basket-outline" size={40} color={COLORS.primary} />
        <Text style={styles.itemTitle}>{error?'Couldn’t load items':'No public items here yet'}</Text>
        <Text style={styles.caption}>{error?'Check your connection and try again.':'Neighbors choose which items can be previewed without an account.'}</Text>
        {error && <ActionButton label="Try again" onPress={() => load(1)} />}
      </View>}
      ListFooterComponent={loading && page>1 ? <ActivityIndicator color={COLORS.primary} /> : null} />
    <View style={styles.footer}><ActionButton variant="primary" label="Sign in or join" onPress={() => navigation.navigate('Welcome')} /></View>
  </SafeAreaView>;
}

const styles=StyleSheet.create({
  page:{flex:1,backgroundColor:COLORS.background},header:{padding:SPACING.lg,gap:SPACING.md},
  title:{...TYPOGRAPHY.title2,color:COLORS.primary},caption:{...TYPOGRAPHY.footnote,color:COLORS.textSecondary},
  search:{...TYPOGRAPHY.body,color:COLORS.text,backgroundColor:COLORS.surface,borderColor:COLORS.border,borderWidth:1,borderRadius:RADIUS.md,padding:14},
  filters:{flexDirection:'row',flexWrap:'wrap',gap:SPACING.sm},filter:{borderWidth:1,borderColor:COLORS.border,borderRadius:RADIUS.md,paddingHorizontal:12,paddingVertical:9},
  selected:{backgroundColor:COLORS.primary,borderColor:COLORS.primary},filterText:{...TYPOGRAPHY.footnote,color:COLORS.primary},selectedText:{color:COLORS.surface},
  list:{paddingHorizontal:SPACING.lg,paddingBottom:SPACING.xl,gap:SPACING.md,flexGrow:1},card:{flexDirection:'row',alignItems:'center',gap:SPACING.md,
    padding:SPACING.sm,borderRadius:RADIUS.md,borderWidth:1,borderColor:COLORS.border,backgroundColor:COLORS.surface},
  photo:{width:72,height:72,borderRadius:RADIUS.sm},placeholder:{backgroundColor:COLORS.primaryMuted,alignItems:'center',justifyContent:'center'},
  cardCopy:{flex:1,gap:4},itemTitle:{...TYPOGRAPHY.headline,color:COLORS.text},empty:{flex:1,alignItems:'center',justifyContent:'center',gap:SPACING.md,padding:SPACING.lg},
  footer:{padding:SPACING.md,borderTopWidth:1,borderTopColor:COLORS.border},
});
