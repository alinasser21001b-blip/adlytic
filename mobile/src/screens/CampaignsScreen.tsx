// ════════════════════════════════════════════════════════════════════════
//  src/screens/CampaignsScreen.tsx
//
//  Renders GET /api/workspaces/:id/campaigns — the SAME endpoint the web
//  app's campaignsPage.ts already uses for its own campaign list, on
//  purpose: dashboard.campaigns/bestCampaign/worstCampaign look like the
//  natural source but depend on a CAMPAIGN-level `health_scores` row that
//  nothing in the current sync pipeline ever writes (verified live against
//  a locally booted server — see api/types.ts's CampaignListItemDTO header
//  and docs/alpha/ALPHA_LAUNCH.md's POST_ALPHA list). This endpoint computes
//  its per-objective KPI cards live from DailyStat on every request, so it
//  has no such gap.
//
//  Renders the headline objective KPI card verbatim — no health score
//  substitute is invented here. `deliveryTier` is a closed, 8-value enum
//  (campaignLifecycle.ts), mapped to Arabic in this file exactly the way
//  the web client already maps it inline — not a new merchant vocabulary.
// ════════════════════════════════════════════════════════════════════════
import React from 'react';
import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { useApiData } from '../api/useApiData';
import { api } from '../api/client';
import { useWorkspace } from '../auth/WorkspaceContext';
import type { CampaignListItemDTO, DeliveryTier } from '../api/types';
import { ar } from '../i18n/ar';
import { surface, text as textColor, semantic, fontSize, space, radius } from '../theme/tokens';
import type { MainStackParamList } from '../navigation/types';

const TIER_LABEL_AR: Record<DeliveryTier, string> = {
  DELIVERING_TODAY: 'تعمل الآن',
  DELIVERING_WINDOW: 'تعمل',
  ACCOUNT_HALTED: 'الحساب موقوف',
  DORMANT_ACTIVE: 'نشطة بلا إنفاق',
  NOT_DELIVERING: 'لا تعمل',
  PAUSED: 'متوقفة مؤقتاً',
  ARCHIVED: 'مؤرشفة',
  DELETED: 'محذوفة',
};
const TIER_COLOR: Record<DeliveryTier, string> = {
  DELIVERING_TODAY: semantic.good, DELIVERING_WINDOW: semantic.good,
  ACCOUNT_HALTED: semantic.bad, NOT_DELIVERING: semantic.attention,
  DORMANT_ACTIVE: semantic.attention, PAUSED: textColor.faint,
  ARCHIVED: textColor.faint, DELETED: textColor.faint,
};

export function CampaignsScreen(): React.ReactElement {
  const { workspaceId } = useWorkspace();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { state, reload } = useApiData<CampaignListItemDTO[]>(
    () => api.get<CampaignListItemDTO[]>(`/api/workspaces/${workspaceId}/campaigns`),
    [workspaceId],
  );

  if (state.phase === 'loading') return <Screen scroll={false}><LoadingState /></Screen>;
  if (state.phase === 'error') return <Screen scroll={false}><ErrorState kind={state.kind} onRetry={reload} /></Screen>;

  const campaigns = state.data;

  return (
    <Screen scroll={false}>
      <Text style={styles.title}>{ar.campaignsTitle}</Text>
      <FlatList
        data={campaigns}
        keyExtractor={(c) => c.id}
        refreshing={state.refreshing}
        onRefresh={reload}
        contentContainerStyle={campaigns.length === 0 ? styles.emptyContainer : styles.list}
        ListEmptyComponent={<EmptyState title={ar.noCampaigns} body={ar.noCampaignsBody} />}
        renderItem={({ item }) => <CampaignRow item={item} onPress={() =>
          nav.navigate('CampaignDetail', { campaignId: item.id, name: item.name })
        } />}
      />
    </Screen>
  );
}

function CampaignRow({ item, onPress }: { item: CampaignListItemDTO; onPress: () => void }): React.ReactElement {
  const color = TIER_COLOR[item.deliveryTier] ?? textColor.faint;
  const headline = item.objectiveKpis?.cards?.[0] ?? null;
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.rowSubLine}>
          <Text style={styles.rowSub}>{TIER_LABEL_AR[item.deliveryTier] ?? item.deliveryTier}</Text>
          {headline && (
            <Text style={styles.rowSub} numberOfLines={1}>
              {'  ·  '}{headline.labelAr} {headline.value === null ? ar.notAvailable : headline.display}
              {headline.approximate ? ' ≈' : ''}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.h3, fontWeight: '700', color: textColor.primary, padding: space[4], paddingBottom: space[2], textAlign: 'right' },
  list: { paddingHorizontal: space[4], paddingBottom: space[5] },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  row: {
    flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: surface.surface,
    borderWidth: 1, borderColor: surface.border, borderRadius: radius.unit, padding: space[3], marginBottom: space[2],
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginStart: space[3] },
  rowBody: { flex: 1 },
  rowName: { fontSize: fontSize.body, fontWeight: '600', color: textColor.primary, textAlign: 'right' },
  rowSubLine: { flexDirection: 'row-reverse', flexWrap: 'wrap', marginTop: 2 },
  rowSub: { fontSize: fontSize.caption, color: textColor.muted, textAlign: 'right' },
});
