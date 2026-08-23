// ════════════════════════════════════════════════════════════════════════
//  src/components/States.tsx — the ONLY renderers for loading / empty /
//  error. Every screen routes through these instead of writing its own, so
//  the tester never sees `undefined`, a stack trace, or a raw status code —
//  see ALPHA rule 19.
// ════════════════════════════════════════════════════════════════════════
import React from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { brand, semantic, surface, text as textColor, fontSize, space, radius, a11y } from '../theme/tokens';
import { ar } from '../i18n/ar';
import type { ApiErrorKind } from '../api/errors';

export function LoadingState({ label }: { label?: string }): React.ReactElement {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={brand.base} size="large" />
      <Text style={styles.loadingLabel}>{label ?? ar.loading}</Text>
    </View>
  );
}

/** Skeleton block — communicates "content is arriving here", not a spinner floating in space. */
export function SkeletonBlock({ height = 80 }: { height?: number }): React.ReactElement {
  return <View style={[styles.skeleton, { height }]} />;
}

const ERROR_COPY: Record<ApiErrorKind, { title: string; body: string }> = {
  OFFLINE:      { title: ar.offline, body: ar.offlineBody },
  TIMEOUT:      { title: ar.serverSlow, body: ar.offlineBody },
  UNAUTHORIZED: { title: ar.sessionExpired, body: '' },
  FORBIDDEN:    { title: ar.forbidden, body: '' },
  NOT_FOUND:    { title: ar.notFound, body: '' },
  RATE_LIMITED: { title: ar.tooManyAttempts, body: '' },
  SERVER_DOWN:  { title: ar.serverDown, body: ar.serverDownBody },
  TIMED_OUT_UPSTREAM: { title: ar.serverSlow, body: ar.serverDownBody },
  BAD_RESPONSE: { title: ar.unexpected, body: '' },
  UNKNOWN:      { title: ar.unexpected, body: '' },
};

export function ErrorState({
  kind, onRetry,
}: { kind: ApiErrorKind; onRetry?: () => void }): React.ReactElement {
  const copy = ERROR_COPY[kind];
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>{copy.title}</Text>
      {!!copy.body && <Text style={styles.errorBody}>{copy.body}</Text>}
      {onRetry && (
        <Pressable onPress={onRetry} style={styles.retryBtn} accessibilityRole="button">
          <Text style={styles.retryLabel}>{ar.retry}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }): React.ReactElement {
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>{title}</Text>
      {!!body && <Text style={styles.errorBody}>{body}</Text>}
    </View>
  );
}

/** Small inline pill — used for "still counting", never phrased as an error. */
export function InsufficientDataBadge({ label }: { label?: string }): React.ReactElement {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{label ?? ar.insufficientData}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[5], gap: space[2] },
  loadingLabel: { marginTop: space[3], color: textColor.muted, fontSize: fontSize.body, textAlign: 'center' },
  skeleton: { backgroundColor: surface.raised, borderRadius: radius.unit, width: '100%', marginBottom: space[3] },
  errorTitle: { color: textColor.primary, fontSize: fontSize.h4, fontWeight: '700', textAlign: 'center' },
  errorBody: { color: textColor.muted, fontSize: fontSize.body, textAlign: 'center' },
  retryBtn: {
    marginTop: space[3], backgroundColor: brand.base, paddingHorizontal: space[5], paddingVertical: space[3],
    borderRadius: radius.unit, minHeight: a11y.touchMin, alignItems: 'center', justifyContent: 'center',
  },
  retryLabel: { color: '#FFFFFF', fontSize: fontSize.bodyLg, fontWeight: '600' },
  badge: {
    backgroundColor: semantic.info + '1A', paddingHorizontal: space[2], paddingVertical: 4,
    borderRadius: radius.pill, alignSelf: 'flex-start',
  },
  badgeText: { color: semantic.info, fontSize: fontSize.caption, fontWeight: '600' },
});
