import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import type { HomeStackParamList } from '@/navigation/types';
import * as profileApi from '@/api/profile';
import * as productsApi from '@/api/products';
import { ProductListItem } from '@/components/ProductListItem';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';

const BAND_COLORS = [colors.info, colors.success, '#8B5FBF'];

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Products'>;

export function ProductsScreen() {
  const navigation = useNavigation<Nav>();
  const [reorderOnly, setReorderOnly] = useState(false);
  const [search, setSearch] = useState('');

  const assignmentQuery = useQuery({ queryKey: ['assignment', 'today'], queryFn: profileApi.getTodayAssignment });
  const productsQuery = useQuery({
    queryKey: ['products', assignmentQuery.data?.campaign.id, assignmentQuery.data?.outlet.id, reorderOnly],
    queryFn: () =>
      productsApi.getCampaignProducts(assignmentQuery.data!.campaign.id, assignmentQuery.data!.outlet.id, {
        reorderOnly,
      }),
    enabled: !!assignmentQuery.data,
  });

  const filtered = productsQuery.data?.filter((p) =>
    p.product.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.frame} edges={['top']}>
      <View style={styles.topnav}>
        <Pressable style={styles.backRow} onPress={() => navigation.goBack()}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M15 5l-7 7 7 7" stroke="#F4F6F3" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <View>
            <Text style={styles.title}>{assignmentQuery.data?.campaign.name ?? 'Campaign products'}</Text>
            <Text style={styles.subtitle}>{assignmentQuery.data?.outlet.name}</Text>
          </View>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.searchBar}>
          <TextInput
            placeholder="Search products"
            placeholderTextColor="#A9B2AC"
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>{filtered?.length ?? 0} products</Text>
          <View style={styles.filterToggle}>
            <Text style={styles.filterToggleLabel}>Reorder only</Text>
            <ToggleSwitch value={reorderOnly} onValueChange={setReorderOnly} />
          </View>
        </View>

        {filtered?.map((item, i) => (
          <ProductListItem
            key={item.campaignProductAssignmentId}
            item={item}
            variant="detailed"
            bandColor={BAND_COLORS[i % BAND_COLORS.length]}
            onPress={() =>
              navigation.navigate('ProductUpdate', {
                campaignProductAssignmentId: item.campaignProductAssignmentId,
                productId: item.product.id,
                productName: item.product.name,
                unitPrice: item.product.unitPrice,
                sku: item.product.sku,
                openingStock: item.openingStock,
                soldToday: item.soldToday,
                otherInterestedCustomers: item.otherInterestedCustomers,
                reorderFlag: item.reorderFlag,
                bandColor: BAND_COLORS[i % BAND_COLORS.length],
              })
            }
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.surface },
  topnav: { backgroundColor: colors.ink, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.white },
  subtitle: { color: '#9FB2AA', fontSize: 12.5, marginTop: 2 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  searchBar: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 1,
    marginTop: spacing.lg,
  },
  searchInput: { fontSize: fontSize.md, color: colors.textPrimary, padding: 0 },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
  filterLabel: { fontSize: fontSize.base, fontWeight: '700', color: colors.textPrimary },
  filterToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filterToggleLabel: { fontSize: 12.5, color: colors.textMuted, fontWeight: '600' },
});
