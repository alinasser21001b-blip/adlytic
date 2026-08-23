// ════════════════════════════════════════════════════════════════════════
//  src/screens/CampaignDetailScreen.tsx
//
//  "What happened? → Why? → Evidence → Diagnosis → What should I do?"
//  (ALPHA rule 8). This screen answers the FIRST and LAST steps from the
//  campaign's own record; WhyScreen (one tap away) answers the middle three
//  from the customer's Why projection. Splitting them keeps this screen
//  fast (one cheap Prisma read) and the reasoning chain opt-in.
// ════════════════════════════════════════════════════════════════════════
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { LoadingState, ErrorState } from '../components/States';
import { useApiData } from '../api/useApiData';
import { api } from '../api/client';
import { useWorkspace } from '../auth/WorkspaceContext';
import type { CampaignDetailDTO } from '../api/types';
import { ar } from '../i18n/ar';
import { brand, surface, text as textColor, fontSize, space, radius } from '../theme/tokens';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'CampaignDetail'>;

const STATUS_LABEL_AR: Record<string, string> = {
  ACTIVE: 'نشطة', PAUSED: 'متوقفة مؤقتاً', DELETED: 'محذوفة', ARCHIVED: 'مؤرشفة',
};

export function CampaignDetailScreen({ route, navigation }: Props): React.ReactElement {
  const { campaignId, name } = route.params;
  const { workspaceId } = useWorkspace();
  const { state, reload } = useApiData<CampaignDetailDTO>(
    () => api.get<CampaignDetailDTO>(`/api/workspaces/${workspaceId}/campaigns/${campaignId}`),
    [workspaceId, campaignId],
  );

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: name });
  }, [navigation, name]);

  if (state.phase === 'loading') return <Screen><LoadingState /></Screen>;
  if (state.phase === 'error') return <Screen><ErrorState kind={state.kind} onRetry={reload} /></Screen>;

  const campaign = state.data;

  return (
    <Screen refreshing={state.refreshing} onRefresh={reload}>
      <Text style={styles.title}>{campaign.name}</Text>
      <View style={styles.statusRow}>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{STATUS_LABEL_AR[campaign.status] ?? campaign.status}</Text>
        </View>
      </View>

      <Pressable
        style={styles.whyCard}
        onPress={() => navigation.navigate('Why', { campaignId, name: campaign.name })}
        accessibilityRole="button"
      >
        <Text style={styles.whyCardTitle}>{ar.whyButton}</Text>
        <Text style={styles.whyCardChevron}>‹</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.h3, fontWeight: '700', color: textColor.primary, textAlign: 'right', marginBottom: space[2] },
  statusRow: { flexDirection: 'row-reverse', marginBottom: space[4] },
  statusPill: { backgroundColor: surface.raised, borderRadius: radius.pill, paddingHorizontal: space[3], paddingVertical: 4 },
  statusText: { fontSize: fontSize.bodySm, color: textColor.muted, fontWeight: '600' },
  whyCard: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: brand.base, borderRadius: radius.unit, padding: space[4],
  },
  whyCardTitle: { color: '#FFFFFF', fontSize: fontSize.bodyLg, fontWeight: '700', textAlign: 'right', flex: 1 },
  whyCardChevron: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', marginStart: space[2] },
});
