// ════════════════════════════════════════════════════════════════════════
//  src/screens/CampaignsScreen.tsx
//
//  Renders dashboard.campaigns verbatim (getDashboard.ts's CampaignCard[] —
//  "every active campaign with its window metrics, sorted by health desc").
//  Deliberately reuses the SAME dashboard payload Home already fetches
//  rather than integrating the separate, richer /campaigns list endpoint
//  (per-objective KPI layout, delivery tiers): one API surface for Alpha's
//  list view keeps the mobile boundary narrow. Recorded as POST_ALPHA — see
//  docs/alpha/ALPHA_LAUNCH.md.
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
import type { DashboardDTO, CampaignCardDTO } from '../api/types';
import { ar } from '../i18n/ar';
import { surface, text as textColor, semantic, fontSize, space, radius } from '../theme/tokens';
import type { MainStackParamList } from '../navigation/types';

const BAND_COLOR: Record<string, string> = {
  excellent: semantic.good, good: semantic.good, attention: semantic.attention,
  poor: semantic.bad, critical: semantic.bad,
};

function bandFor(health: number): string {
  if (health >= 90) return 'excellent';
  if (health >= 70) return 'good';
  if (health >= 50) return 'attention';
  return 'poor';
}

export function CampaignsScreen(): React.ReactElement {
  const { workspaceId } = useWorkspace();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { state, reload } = useApiData<DashboardDTO>(
    () => api.get<DashboardDTO>(`/api/dashboard/${workspaceId}`),
    [workspaceId],
  );

  if (state.phase === 'loading') return <Screen scroll={false}><LoadingState /></Screen>;
  if (state.phase === 'error') return <Screen scroll={false}><ErrorState kind={state.kind} onRetry={reload} /></Screen>;

  const campaigns = state.data.campaigns ?? [];

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

function CampaignRow({ item, onPress }: { item: CampaignCardDTO; onPress: () => void }): React.ReactElement {
  const band = bandFor(item.health);
  const color = BAND_COLOR[band] ?? textColor.faint;
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.rowSub}>
          {ar.campaignHealth} {Math.round(item.health)}
          {item.ctr != null ? `  ·  CTR ${item.ctr.toFixed(2)}%` : ''}
        </Text>
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
  rowSub: { fontSize: fontSize.caption, color: textColor.muted, textAlign: 'right', marginTop: 2 },
});
