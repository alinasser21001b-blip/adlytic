import React from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { surface } from '../theme/tokens';

/** Every screen sits on this. Safe-area correct on notch/Dynamic-Island devices by construction. */
export function Screen({
  children, scroll = true, onRefresh, refreshing,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}): React.ReactElement {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.flexFill}>{children}</View>
  );
  return <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>{body}</SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: surface.ground },
  flexFill: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 16, paddingBottom: 40 },
});
