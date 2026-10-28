import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PlanStep } from '../../lib/checkout/orderPayload';
import { colors, space } from '../../lib/theme';

/** One line per step: what it writes, where. */
export function stepLine(s: PlanStep): string {
  switch (s.kind) {
    case 'read': return `READ   ${s.table} (${Object.entries(s.filter).map(([k, v]) => `${k}=${v}`).join(', ')})`;
    case 'insert': return `INSERT ${s.table}: 1 row`;
    case 'upload': return `UPLOAD ${s.bucket}/${s.path} (${s.contentType}, create-only${s.tries ? `, up to ${s.tries} tries` : ''})`;
    case 'upsert': return `UPSERT ${s.table}: ${s.rows.length} rows (existing codes kept)`;
    case 'rpc': return `RPC    ${s.name}(${JSON.stringify(s.args)})`;
    case 'next': return 'THEN   the payment step';
  }
}

/** Only in this test build (nothing is ever sent from it): what the order
 *  would send, so it can be checked against the website's. */
export function TestPanel({ title, note, steps, data }: { title: string; note: string; steps?: PlanStep[]; data: unknown }) {
  const [showData, setShowData] = useState(false);
  const json = JSON.stringify(data, null, 2);
  return (
    <View style={styles.panel} testID="test-panel">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.note}>{note}</Text>
      {steps?.map((s, i) => (
        <View key={i} style={styles.step}>
          <Text style={styles.code}>{i + 1}. {stepLine(s)}</Text>
          <Text style={styles.what}>{s.what}</Text>
        </View>
      ))}
      <Pressable accessibilityRole="button" onPress={() => setShowData((v) => !v)} style={styles.toggle} testID="test-panel-toggle">
        <Text style={styles.toggleText}>{showData ? 'Hide' : 'Show'} the data ({json.length < 1024 ? 'under 1 KB' : `${Math.round(json.length / 1024)} KB`})</Text>
      </Pressable>
      {showData && (
        <ScrollView nestedScrollEnabled style={styles.box}>
          <ScrollView horizontal nestedScrollEnabled>
            <Text selectable style={styles.code}>{json.length > 60_000 ? `${json.slice(0, 60_000)}\n… (${json.length - 60_000} more characters)` : json}</Text>
          </ScrollView>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#8A5A12', backgroundColor: '#FFF6E5', borderRadius: 12, padding: space.md, gap: space.sm },
  title: { fontSize: 15, fontWeight: '800', color: '#8A5A12' },
  note: { fontSize: 14, color: '#8A5A12' },
  step: { gap: 2 },
  what: { fontSize: 13, color: colors.muted },
  code: { fontFamily: 'monospace', fontSize: 12, color: colors.text },
  toggle: { paddingVertical: space.xs },
  toggleText: { fontSize: 14, fontWeight: '700', color: '#8A5A12', textDecorationLine: 'underline' },
  box: { maxHeight: 360, backgroundColor: colors.card, borderRadius: 8, padding: space.sm },
});
