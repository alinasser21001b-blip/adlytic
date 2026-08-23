// ════════════════════════════════════════════════════════════════════════
//  src/screens/HomeScreen.tsx — "What is happening? Is my advertising
//  healthy? What deserves attention first?" (ALPHA rule 7).
//
//  Renders api.getDashboard() verbatim. No health score is computed here;
//  no KPI is summed or averaged here; a `null` value prints as ar.notAvailable
//  via <Metric>, never as 0.
// ════════════════════════════════════════════════════════════════════════
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { LoadingState, ErrorState, EmptyState, SkeletonBlock } from '../components/States';
import { Metric } from '../components/Metric';
import { useApiData } from '../api/useApiData';
import { api } from '../api/client';
import { useWorkspace } from '../auth/WorkspaceContext';
import type { DashboardDTO } from '../api/types';
import { ar } from '../i18n/ar';
import { brand, surface, text as textColor, semantic, fontSize, space, radius } from '../theme/tokens';
import type { MainStackParamList } from '../navigation/types';

const BAND_COLOR: Record<string, string> = {
  excellent: semantic.good, good: semantic.good,
  attention: semantic.attention, poor: semantic.bad, critical: semantic.bad,
  none: textColor.faint, unknown: textColor.faint,
};
const BAND_LABEL_AR: Record<string, string> = {
  excellent: 'ممتازة', good: 'جيدة', attention: 'تحتاج انتباه',
  poor: 'ضعيفة', critical: 'حرجة', none: ar.noHealthScore, unknown: ar.insufficientData,
};

function formatRelativeSync(iso: string | null): string {
  if (!iso) return ar.neverSynced;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `قبل ${mins} د`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `قبل ${hours} س`;
  return `قبل ${Math.round(hours / 24)} يوم`;
}

export function HomeScreen(): React.ReactElement {
  const { workspaceId } = useWorkspace();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { state, reload } = useApiData<DashboardDTO>(
    () => api.get<DashboardDTO>(`/api/dashboard/${workspaceId}`),
    [workspaceId],
  );

  if (state.phase === 'loading') {
    return <Screen><SkeletonBlock height={140} /><SkeletonBlock height={90} /><SkeletonBlock height={200} /></Screen>;
  }
  if (state.phase === 'error') return <Screen><ErrorState kind={state.kind} onRetry={reload} /></Screen>;

  const { data: dto, refreshing } = state;
  if (dto.empty || !dto.workspace) {
    return (
      <Screen refreshing={refreshing} onRefresh={reload}>
        <EmptyState title={ar.metaNotConnected} body={ar.metaUnavailable} />
        <Pressable style={styles.connectCta} onPress={() => nav.navigate('MetaConnect')} accessibilityRole="button">
          <Text style={styles.connectCtaLabel}>{ar.metaConnect}</Text>
        </Pressable>
      </Screen>
    );
  }

  const bandColor = BAND_COLOR[dto.health.band] ?? textColor.faint;

  return (
    <Screen refreshing={refreshing} onRefresh={reload}>
      <Text style={styles.greeting}>{ar.homeGreeting}</Text>

      {/* ── Account health ── */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{ar.accountHealth}</Text>
        <View style={styles.healthRow}>
          <Text style={[styles.healthScore, { color: bandColor }]}>
            {dto.health.score === null ? '—' : Math.round(dto.health.score)}
          </Text>
          <View style={[styles.bandPill, { backgroundColor: bandColor + '1F' }]}>
            <Text style={[styles.bandPillText, { color: bandColor }]}>
              {BAND_LABEL_AR[dto.health.band] ?? dto.health.band}
            </Text>
          </View>
        </View>
        <Text style={styles.syncedAt}>{ar.lastSynced}: {formatRelativeSync(dto.workspace.lastSyncedAt)}</Text>
      </View>

      {/* ── Priority action ── */}
      {dto.priorityAction ? (
        <View style={[styles.card, styles.priorityCard]}>
          <Text style={styles.cardLabel}>{ar.priorityAction}</Text>
          <Text style={styles.priorityText}>{dto.priorityAction.text}</Text>
          {!!dto.priorityAction.costDisplay && (
            <Text style={styles.priorityCost}>{ar.costLabel}: {dto.priorityAction.costDisplay}</Text>
          )}
          {!!dto.priorityAction.evidence?.length && (
            <View style={styles.evidenceWrap}>
              <Text style={styles.evidenceLabel}>{ar.evidenceLabel}</Text>
              {dto.priorityAction.evidence.slice(0, 3).map((e, i) => (
                <Text key={i} style={styles.evidenceItem}>· {e}</Text>
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={styles.card}>
          <EmptyState title={ar.noAttentionItems} />
        </View>
      )}

      {/* ── KPIs ── */}
      {dto.kpis.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{ar.keyNumbers}</Text>
          <View style={styles.kpiGrid}>
            {dto.kpis.map((k) => (
              <Metric
                key={k.key}
                label={k.label}
                display={k.display}
                value={k.value}
                deltaPct={k.deltaPct}
                direction={k.direction}
                goodWhenUp={k.goodWhenUp}
              />
            ))}
          </View>
        </View>
      )}

      {/* ── Best/worst campaign ── */}
      {(dto.bestCampaign || dto.worstCampaign) && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{ar.attentionItems}</Text>
          {dto.worstCampaign && (
            <Pressable
              style={styles.campaignRow}
              onPress={() => nav.navigate('CampaignDetail', { campaignId: dto.worstCampaign!.id, name: dto.worstCampaign!.name })}
            >
              <Text style={styles.campaignName} numberOfLines={1}>{dto.worstCampaign.name}</Text>
              <Text style={[styles.campaignHealth, { color: semantic.bad }]}>{dto.worstCampaign.health}</Text>
            </Pressable>
          )}
          {dto.bestCampaign && (
            <Pressable
              style={styles.campaignRow}
              onPress={() => nav.navigate('CampaignDetail', { campaignId: dto.bestCampaign!.id, name: dto.bestCampaign!.name })}
            >
              <Text style={styles.campaignName} numberOfLines={1}>{dto.bestCampaign.name}</Text>
              <Text style={[styles.campaignHealth, { color: semantic.good }]}>{dto.bestCampaign.health}</Text>
            </Pressable>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: fontSize.h3, fontWeight: '700', color: textColor.primary, marginBottom: space[3], textAlign: 'right' },
  card: {
    backgroundColor: surface.surface, borderRadius: radius.unit, borderWidth: 1, borderColor: surface.border,
    padding: space[4], marginBottom: space[3],
  },
  cardLabel: { fontSize: fontSize.bodySm, fontWeight: '700', color: textColor.muted, marginBottom: space[2], textAlign: 'right' },
  healthRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: space[3] },
  healthScore: { fontSize: 48, fontWeight: '800' },
  bandPill: { paddingHorizontal: space[3], paddingVertical: 6, borderRadius: radius.pill },
  bandPillText: { fontSize: fontSize.bodySm, fontWeight: '700' },
  syncedAt: { marginTop: space[2], fontSize: fontSize.caption, color: textColor.faint, textAlign: 'right' },
  priorityCard: { borderColor: brand.base + '55', backgroundColor: brand.base + '0A' },
  priorityText: { fontSize: fontSize.bodyLg, fontWeight: '600', color: textColor.primary, textAlign: 'right', lineHeight: 22 },
  priorityCost: { marginTop: space[2], fontSize: fontSize.bodySm, color: semantic.attention, textAlign: 'right', fontWeight: '600' },
  evidenceWrap: { marginTop: space[3], gap: 4 },
  evidenceLabel: { fontSize: fontSize.caption, fontWeight: '700', color: textColor.faint, textAlign: 'right' },
  evidenceItem: { fontSize: fontSize.bodySm, color: textColor.muted, textAlign: 'right' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[4] },
  campaignRow: {
    flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: space[3], borderTopWidth: 1, borderTopColor: surface.border,
  },
  campaignName: { flex: 1, fontSize: fontSize.body, color: textColor.primary, textAlign: 'right', marginStart: space[3] },
  campaignHealth: { fontSize: fontSize.bodyLg, fontWeight: '700' },
  connectCta: {
    backgroundColor: brand.base, borderRadius: radius.unit, paddingVertical: space[3], alignItems: 'center', marginTop: space[3],
  },
  connectCtaLabel: { color: '#FFFFFF', fontWeight: '700', fontSize: fontSize.bodyLg },
});
