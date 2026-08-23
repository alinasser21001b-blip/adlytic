// ════════════════════════════════════════════════════════════════════════
//  src/screens/WhyScreen.tsx — mobile Graphify.
//
//  The intelligence graph, rendered for a phone: a vertical progressive
//  trace (Campaign → Signal → Problem → Evidence → Diagnosis → Action)
//  instead of the desktop node graph, which does not fit — and would not
//  help — on a 390px screen. Tap a stage to expand it; that is the entire
//  interaction model, on purpose (ALPHA rule 9: no unreadable Graphify
//  nodes, no enormous data tables).
//
//  This screen renders GET /api/workspaces/:id/campaigns/:id/why VERBATIM.
//  It computes nothing: no problem class, no confidence, no stage status.
//  See src/services/campaignWhy.ts server-side for what backs every field.
// ════════════════════════════════════════════════════════════════════════
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { LoadingState, ErrorState, EmptyState, InsufficientDataBadge } from '../components/States';
import { useApiData } from '../api/useApiData';
import { api } from '../api/client';
import { useWorkspace } from '../auth/WorkspaceContext';
import { ApiError } from '../api/errors';
import type { CampaignWhyDTO, WhyStageDTO } from '../api/types';
import { ar } from '../i18n/ar';
import { brand, surface, text as textColor, semantic, fontSize, space, radius } from '../theme/tokens';
import type { MainStackParamList } from '../navigation/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = NativeStackScreenProps<MainStackParamList, 'Why'>;

export function WhyScreen({ route }: Props): React.ReactElement {
  const { campaignId } = route.params;
  const { workspaceId } = useWorkspace();
  const { state, reload } = useApiData<CampaignWhyDTO>(
    () => api.get<CampaignWhyDTO>(`/api/workspaces/${workspaceId}/campaigns/${campaignId}/why`),
    [workspaceId, campaignId],
  );

  if (state.phase === 'loading') return <Screen><LoadingState /></Screen>;
  if (state.phase === 'error') {
    if (state.kind === 'NOT_FOUND') {
      return <Screen><EmptyState title={ar.whyUnavailable} body={ar.whyUnavailableBody} /></Screen>;
    }
    return <Screen><ErrorState kind={state.kind} onRetry={reload} /></Screen>;
  }

  const why = state.data;

  return (
    <Screen refreshing={state.refreshing} onRefresh={reload}>
      <Text style={styles.intro}>{ar.whyIntro}</Text>

      {/* ── The chain ── */}
      <View style={styles.chain}>
        {why.chain.map((stage, i) => (
          <ChainNode key={stage.stage} stage={stage} isLast={i === why.chain.length - 1} />
        ))}
      </View>

      {/* ── Data truth ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{ar.dataTruthTitle}</Text>
        <FactRow k={ar.daysStored} v={String(why.dataTruth.daysStored)} />
        <FactRow k={ar.daysMissing} v={String(why.dataTruth.daysMissing)} />
        {!!why.dataTruth.dataConfidenceAr && <FactRow k="" v={why.dataTruth.dataConfidenceAr} />}
        {!!why.dataTruth.settlementAr && <FactRow k="" v={why.dataTruth.settlementAr} />}
      </View>

      {/* ── Counter-evidence ── */}
      {why.diagnosis.breakPresentButNotUnusual && (
        <View style={styles.card}>
          <InsufficientDataBadge label={ar.notUnusualNote} />
        </View>
      )}
      {why.diagnosis.counterEvidenceAr.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{ar.counterEvidenceTitle}</Text>
          {why.diagnosis.counterEvidenceAr.map((c, i) => (
            <Text key={i} style={styles.bullet}>· {c}</Text>
          ))}
        </View>
      )}

      {/* ── Recommendation ── */}
      {why.recommendation?.actionAr && (
        <View style={[styles.card, styles.recCard]}>
          <Text style={styles.cardTitle}>{ar.recommendedAction}</Text>
          <Text style={styles.recText}>{why.recommendation.actionAr}</Text>
          {why.recommendation.forbiddenAr.length > 0 && (
            <View style={styles.forbiddenWrap}>
              <Text style={styles.forbiddenTitle}>{ar.forbiddenTitle}</Text>
              {why.recommendation.forbiddenAr.map((f, i) => (
                <Text key={i} style={styles.forbiddenItem}>✕ {f}</Text>
              ))}
            </View>
          )}
        </View>
      )}

      <Text style={styles.deterministicNote}>
        {why.deterministic ? ar.deterministicNote : ''}
      </Text>
    </Screen>
  );
}

function ChainNode({ stage, isLast }: { stage: WhyStageDTO; isLast: boolean }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const reached = stage.status === 'REACHED';
  const color = reached ? brand.base : textColor.faint;
  const detail = reached ? stage.findingAr : stage.absenceAr;

  function toggle(): void {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  }

  return (
    <View style={styles.nodeRow}>
      <View style={styles.nodeRail}>
        <View style={[styles.nodeDot, { backgroundColor: reached ? brand.base : surface.borderStrong }]} />
        {!isLast && <View style={[styles.nodeLine, { backgroundColor: reached ? brand.base + '55' : surface.border }]} />}
      </View>
      <Pressable style={styles.nodeBody} onPress={toggle} accessibilityRole="button">
        <View style={styles.nodeHeaderRow}>
          <Text style={[styles.nodeOrdinal, { color }]}>{stage.ordinal}</Text>
          <Text style={[styles.nodeLabel, !reached && styles.nodeLabelDim]} numberOfLines={open ? undefined : 1}>
            {stage.labelAr}
          </Text>
        </View>
        {!reached && !detail && (
          <Text style={styles.nodeNotReached}>{ar.stageNotReached}</Text>
        )}
        {open && (
          <Text style={styles.nodeDetail}>
            {detail ?? (reached ? '' : ar.stageNoReason)}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

function FactRow({ k, v }: { k: string; v: string }): React.ReactElement {
  return (
    <View style={styles.factRow}>
      {!!k && <Text style={styles.factKey}>{k}</Text>}
      <Text style={styles.factValue}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: fontSize.bodySm, color: textColor.muted, textAlign: 'right', marginBottom: space[4] },
  chain: { marginBottom: space[4] },
  nodeRow: { flexDirection: 'row-reverse' },
  nodeRail: { alignItems: 'center', width: 28 },
  nodeDot: { width: 16, height: 16, borderRadius: 8 },
  nodeLine: { width: 2, flex: 1, minHeight: 24 },
  nodeBody: { flex: 1, marginEnd: space[3], paddingBottom: space[4] },
  nodeHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: space[2] },
  nodeOrdinal: { fontSize: fontSize.caption, fontWeight: '800', width: 18, textAlign: 'center' },
  nodeLabel: { flex: 1, fontSize: fontSize.body, fontWeight: '700', color: textColor.primary, textAlign: 'right' },
  nodeLabelDim: { color: textColor.faint, fontWeight: '500' },
  nodeNotReached: { fontSize: fontSize.caption, color: textColor.faint, textAlign: 'right', marginTop: 2 },
  nodeDetail: { fontSize: fontSize.bodySm, color: textColor.muted, textAlign: 'right', marginTop: 4, lineHeight: 19 },
  card: {
    backgroundColor: surface.surface, borderRadius: radius.unit, borderWidth: 1, borderColor: surface.border,
    padding: space[4], marginBottom: space[3],
  },
  cardTitle: { fontSize: fontSize.bodySm, fontWeight: '700', color: textColor.muted, textAlign: 'right', marginBottom: space[2] },
  factRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 4 },
  factKey: { fontSize: fontSize.bodySm, color: textColor.muted },
  factValue: { fontSize: fontSize.bodySm, color: textColor.primary, textAlign: 'right', flex: 1 },
  bullet: { fontSize: fontSize.bodySm, color: textColor.muted, textAlign: 'right', marginTop: 4, lineHeight: 19 },
  recCard: { borderColor: semantic.good + '55', backgroundColor: semantic.good + '0D' },
  recText: { fontSize: fontSize.bodyLg, fontWeight: '700', color: textColor.primary, textAlign: 'right' },
  forbiddenWrap: { marginTop: space[3], gap: 4 },
  forbiddenTitle: { fontSize: fontSize.caption, fontWeight: '700', color: textColor.faint, textAlign: 'right' },
  forbiddenItem: { fontSize: fontSize.bodySm, color: semantic.bad, textAlign: 'right' },
  deterministicNote: { fontSize: fontSize.caption, color: textColor.faint, textAlign: 'center', marginTop: space[2] },
});
