// ════════════════════════════════════════════════════════════════════════
//  src/components/Metric.tsx — THE ONLY place a KPI number is formatted.
//
//  ALPHA rule 10: never convert unknown information into a reassuring zero.
//  Every KPI DTO already arrives with a finished `display` string built
//  server-side (getDashboard.ts) — this component's job is to print that
//  string, or the honest absence label when the value itself is null. It
//  performs NO arithmetic, NO rounding, NO percentage computation. If a
//  number needs deriving, it belongs in the backend DTO, not here.
// ════════════════════════════════════════════════════════════════════════
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { text as textColor, semantic, fontSize, space } from '../theme/tokens';
import { ar } from '../i18n/ar';

export function Metric({
  label, display, value, deltaPct, direction, goodWhenUp,
}: {
  label: string;
  /** Server-formatted string. Rendered VERBATIM — see file header. */
  display: string;
  /** Only consulted to decide whether to render `display` or the absence label — never formatted directly. */
  value: number | null;
  deltaPct?: number | null;
  direction?: 'up' | 'down' | 'flat';
  goodWhenUp?: boolean;
}): React.ReactElement {
  const isMissing = value === null;
  const deltaColor =
    deltaPct == null || direction === 'flat' ? textColor.faint
      : (direction === 'up') === !!goodWhenUp ? semantic.good : semantic.bad;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <Text style={[styles.value, isMissing && styles.valueMissing]} numberOfLines={1}>
        {isMissing ? ar.notAvailable : display}
      </Text>
      {deltaPct != null && !isMissing && (
        <Text style={[styles.delta, { color: deltaColor }]}>
          {direction === 'up' ? '▲' : direction === 'down' ? '▼' : '—'} {Math.abs(deltaPct).toFixed(1)}%
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minWidth: 104, gap: 2 },
  label: { color: textColor.muted, fontSize: fontSize.caption, fontWeight: '600' },
  value: { color: textColor.primary, fontSize: fontSize.metricSm, fontWeight: '700' },
  valueMissing: { color: textColor.faint, fontWeight: '500', fontSize: fontSize.bodyLg },
  delta: { fontSize: fontSize.caption, fontWeight: '600' },
});
