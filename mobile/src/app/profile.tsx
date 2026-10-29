/* ══════════════════════════════════════════════════════════════════════════
   MY PROFILE (Phase 6): the website's Profile page on the phone
   (src/pages/Profile.tsx): the account's name ("Edit Profile"), its email,
   the delivery details from the newest order, Change password (the
   website's emailed link), Your orders, Sign out, and Delete my account
   (the website's DeleteAccountSection: its words, its typed DELETE).
   ══════════════════════════════════════════════════════════════════════════ */
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Field } from '../components/checkout/Field';
import { SECTION_TEXT, SECTION_TITLE } from '../lib/account/deletionWords';
import {
  accountName,
  CANCEL,
  DELIVERY_FAILED,
  DELIVERY_TITLE,
  deliveryFrom,
  deliveryLines,
  displayName,
  EDIT,
  initials,
  NAME_LABEL,
  NAME_PLACEHOLDER,
  NO_DELIVERY,
  SAVE,
  SAVE_FAILED,
  SAVED,
  SAVING,
  saveName,
} from '../lib/account/profile';
import { useAuth } from '../lib/auth';
import { lastShipping, type LastShipping } from '../lib/orders/myOrders';
import { supabase } from '../lib/supabase';
import { colors, space } from '../lib/theme';

type Delivery = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; shipping: LastShipping | null };

export default function Profile() {
  const { loading: authLoading, session, signOut } = useAuth();
  const user = session?.user ?? null;
  const userId = user?.id;

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [delivery, setDelivery] = useState<Delivery>({ state: 'loading' });
  const [deliveryTry, setDeliveryTry] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    lastShipping(supabase, userId)
      .then((shipping) => { if (alive) setDelivery({ state: 'ready', shipping }); })
      .catch(() => { if (alive) setDelivery({ state: 'failed' }); });
    return () => { alive = false; };
  }, [userId, deliveryTry]);

  // "Saved!" shows for two seconds, "Error saving" for three (the website's).
  useEffect(() => {
    if (saveStatus !== 'saved' && saveStatus !== 'error') return;
    const t = setTimeout(() => setSaveStatus('idle'), saveStatus === 'saved' ? 2000 : 3000);
    return () => clearTimeout(t);
  }, [saveStatus]);

  const startEdit = () => { setName(accountName(user)); setSaveStatus('idle'); setEditing(true); };
  const cancelEdit = () => { setEditing(false); setName(accountName(user)); setSaveStatus('idle'); };
  const save = useCallback(async () => {
    setSaveStatus('saving');
    const ok = await saveName(supabase, name);
    if (ok) { setEditing(false); setSaveStatus('saved'); } else setSaveStatus('error');
  }, [name]);
  const doSignOut = async () => {
    await signOut().catch(() => { /* offline: the sign-in on the phone is dropped anyway */ });
    // Back to the start screen, with nothing of the account left behind it.
    if (router.canDismiss()) router.dismissAll(); else router.replace('/');
  };

  if (!authLoading && !session) return <Redirect href="/sign-in" />;
  if (authLoading || !user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.muted}>Loading profile...</Text>
      </View>
    );
  }

  const shown = editing && name.trim() ? name.trim() : displayName(user);

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" testID="profile">
      <View style={styles.card}>
        <View style={styles.who}>
          <View style={styles.badge}><Text style={styles.badgeText}>{initials(shown)}</Text></View>
          <View style={styles.flex}>
            <Text style={styles.name} testID="profile-name">{shown}</Text>
            <Text style={styles.small} testID="profile-email">{user.email}</Text>
          </View>
        </View>
        {editing ? (
          <View style={styles.edit}>
            <Field label={NAME_LABEL} value={name} onChangeText={setName} placeholder={NAME_PLACEHOLDER} autoComplete="name" maxLength={80} testID="profile-name-input" />
            <Button label={saveStatus === 'saving' ? SAVING : SAVE} busy={saveStatus === 'saving'} onPress={() => void save()} testID="profile-save" />
            <Button label={CANCEL} kind="plain" onPress={cancelEdit} testID="profile-cancel" />
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={startEdit} style={styles.linkWrap} testID="profile-edit">
            <Text style={styles.link}>{EDIT}</Text>
          </Pressable>
        )}
        {saveStatus === 'saved' && <Text style={styles.good} testID="profile-saved">{SAVED}</Text>}
        {saveStatus === 'error' && <Text style={styles.bad} testID="profile-save-error">{SAVE_FAILED}</Text>}
      </View>

      <View style={styles.card} testID="profile-delivery">
        <Text style={styles.h2}>{DELIVERY_TITLE}</Text>
        {delivery.state === 'loading' ? (
          <ActivityIndicator color={colors.accent} />
        ) : delivery.state === 'failed' ? (
          <>
            <Text style={styles.small}>{DELIVERY_FAILED}</Text>
            <Button label="Try again" kind="plain" onPress={() => { setDelivery({ state: 'loading' }); setDeliveryTry((n) => n + 1); }} testID="profile-delivery-retry" />
          </>
        ) : delivery.shipping ? (
          <>
            {deliveryLines(delivery.shipping).map((l) => (
              <View key={l.label} style={styles.row}>
                <Text style={styles.rowLabel}>{l.label}</Text>
                <Text style={styles.rowValue} testID={`profile-delivery-${l.label.toLowerCase()}`}>{l.value}</Text>
              </View>
            ))}
            <Text style={styles.small}>{deliveryFrom(delivery.shipping.order_number)}</Text>
          </>
        ) : (
          <Text style={styles.small} testID="profile-no-delivery">{NO_DELIVERY}</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Your orders</Text>
        <Text style={styles.small}>Where each album is now.</Text>
        <Button label="See your orders" kind="plain" onPress={() => router.push('/orders')} testID="profile-orders" />
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Password</Text>
        <Text style={styles.small}>We email you a link to make a new password.</Text>
        <Button label="Change password" kind="plain" onPress={() => router.push('/change-password')} testID="profile-change-password" />
      </View>

      <Button label="Sign out" kind="plain" onPress={() => void doSignOut()} testID="profile-sign-out" />

      <View style={[styles.card, styles.danger]} testID="profile-delete">
        <Text style={styles.h2}>{SECTION_TITLE}</Text>
        <Text style={styles.small}>{SECTION_TEXT}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/delete-account')} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]} testID="profile-delete-account">
          <Text style={styles.deleteText}>{SECTION_TITLE}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.md, gap: space.md, paddingBottom: space.xl * 2, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, backgroundColor: colors.background },
  muted: { fontSize: 16, color: colors.muted },
  flex: { flex: 1 },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  badge: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 24, fontWeight: '800', color: colors.accentText },
  name: { fontSize: 21, fontWeight: '800', color: colors.text },
  small: { fontSize: 14, lineHeight: 20, color: colors.muted },
  edit: { gap: space.sm },
  linkWrap: { alignSelf: 'flex-start', paddingVertical: space.xs },
  link: { fontSize: 15, fontWeight: '700', color: colors.accent, textDecorationLine: 'underline' },
  good: { fontSize: 14, fontWeight: '700', color: colors.good },
  bad: { fontSize: 14, fontWeight: '700', color: colors.bad },
  h2: { fontSize: 18, fontWeight: '800', color: colors.text },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  rowLabel: { width: 72, fontSize: 14, color: colors.muted, fontWeight: '600' },
  rowValue: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.text },
  danger: { borderColor: '#F1C9C4' },
  deleteButton: { minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.bad, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 17, fontWeight: '700', color: colors.bad },
  pressed: { opacity: 0.85 },
});
