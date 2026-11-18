/* ══════════════════════════════════════════════════════════════════════════
   BECOME AN AFFILIATE / YOUR AFFILIATE PAGE (0061), the website's
   src/pages/Affiliate.tsx on the phone, in its words.

   A visitor reads how it works and signs in to apply; an applicant sees
   where their application is; an approved (or paused) affiliate sees their
   code and link (copy, share), what they earned and what was paid. Never
   who bought: a sale shows its date, album, amount and status only.
   The rules and the calls are the website's (shared lib/orderCodes.ts).
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { priceOf, type PriceSchedule } from '@web/lib/pricing';
import { ALBUM_SIZES } from '@web/pages/builder/types';
import {
  affiliateTerms, applicationProblem, exampleCommission, saleStatusLabel,
  type AffiliateApplication, type AffiliateProgram, type MyAffiliate, type SaleStatus,
} from '@web/lib/orderCodes';
import { Button } from '../components/Button';
import { affiliateLink, applyAffiliate, fetchAffiliateProgram, fetchMyAffiliate } from '../lib/affiliates';
import { useAuth } from '../lib/auth';
import { copyText } from '../lib/checkout/copyText';
import { loadPriceSchedule } from '../lib/checkout/priceSchedule';
import { sitePage } from '../lib/checkout/site';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { colors, space } from '../lib/theme';

const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "November 15, 2026" in Manila time (the website's en-PH long date). */
function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const d = new Date(t + 8 * 3_600_000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
const sizeName = (preset: string | null) => ALBUM_SIZES.find((s) => s.preset === preset)?.name ?? preset ?? '';
const coverName = (cover: string | null) => (cover == null ? '' : cover === 'softcover' ? 'Softcover' : 'Hardbound');
const messageUs = () => { void Linking.openURL(sitePage('contact')); };

export default function Affiliate() {
  const { loading: authLoading, session } = useAuth();
  const signedIn = !!session;
  const [program, setProgram] = useState<AffiliateProgram | null | undefined>(undefined);
  const [mine, setMine] = useState<MyAffiliate | null>(null);
  const [err, setErr] = useState('');
  const [tries, setTries] = useState(0);
  const [schedule, setSchedule] = useState<PriceSchedule | null>(null);
  // Read once: "can apply again" is decided against when the page opened.
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    if (authLoading) return;
    let alive = true;
    setProgram(undefined);
    if (!signedIn) {
      void fetchAffiliateProgram().then((p) => { if (!alive) return; setErr(''); setMine(null); setProgram(p); });
    } else {
      fetchMyAffiliate()
        .then((m) => { if (!alive) return; setErr(''); setMine(m); setProgram(m.program); })
        .catch((e: Error) => { if (!alive) return; setErr(e.message); setProgram(null); });
    }
    return () => { alive = false; };
  }, [signedIn, authLoading, tries]);
  useEffect(() => {
    let alive = true;
    void loadPriceSchedule(supabase, supabaseConfigured).then((s) => { if (alive) setSchedule(s); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // The example: an 8×8 hardbound with its included pages, at today's price.
  const examplePrice = schedule && (schedule as { sizes?: Record<string, unknown> }).sizes?.['8x8']
    ? priceOf(schedule, '8x8', 'hard', (schedule as { min_pages?: number }).min_pages ?? 40) : null;
  const loading = program === undefined || authLoading;
  const a = mine?.affiliate ?? null;
  const theirs = a?.status === 'approved' || a?.status === 'paused';

  return (
    <ScrollView contentContainerStyle={styles.page} testID="affiliate-page">
      <Text style={styles.h1}>{theirs ? 'Your affiliate page' : 'Become a Megy Prints affiliate'}</Text>
      {loading && (
        <View style={styles.row}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>Loading…</Text></View>
      )}
      {!loading && !!err && (
        <View style={styles.gap}>
          <Text style={styles.bad} accessibilityRole="alert" testID="affiliate-error">{err}</Text>
          <Button label="Try again" onPress={() => setTries((n) => n + 1)} testID="affiliate-retry" />
        </View>
      )}
      {!loading && !err && program === null && (
        <Text style={styles.muted} testID="affiliate-unavailable">The affiliate program can't be loaded right now. Please try again later.</Text>
      )}
      {!loading && program && theirs && mine && <Dashboard mine={mine} program={program} />}
      {!loading && program && !theirs && (
        <>
          <Pitch program={program} examplePrice={examplePrice} />
          <View style={styles.card}>
            {!signedIn ? (
              <View style={styles.gap} testID="affiliate-sign-in">
                <Text style={styles.body}>{program.on ? 'Sign in to apply. It takes two minutes.' : 'Applications are closed right now.'}</Text>
                {program.on && <Button label="Sign in to apply" onPress={() => router.push({ pathname: '/sign-in', params: { then: 'back' } })} testID="affiliate-sign-in-button" />}
              </View>
            ) : a?.status === 'pending' ? (
              <View style={styles.gap} testID="affiliate-pending">
                <Text style={styles.strong}>Thank you, {a.fullName.split(' ')[0]}! We're looking at your application.</Text>
                <Text style={styles.body}>You applied on {fmtDate(a.appliedAt)}. We usually answer within 2 days. When you're approved, your code and link appear right here.</Text>
              </View>
            ) : a?.status === 'rejected' && a.reapplyFrom && new Date(a.reapplyFrom).getTime() > openedAt ? (
              <View style={styles.gap} testID="affiliate-rejected">
                <Text style={styles.strong}>We couldn't approve your application this time.</Text>
                <Text style={styles.body}>You can apply again from {fmtDate(a.reapplyFrom)}. Questions? Message us.</Text>
                <Button label="Message us" kind="plain" onPress={messageUs} testID="affiliate-message-us" />
              </View>
            ) : !program.on ? (
              <Text style={styles.body} testID="affiliate-closed">Applications are closed right now. Please check back soon.</Text>
            ) : (
              <ApplyForm program={program} again={a?.status === 'rejected'} onApplied={(m) => { setMine(m); setProgram(m.program); }} />
            )}
          </View>
          <Terms program={program} />
        </>
      )}
    </ScrollView>
  );
}

function Pitch({ program, examplePrice }: { program: AffiliateProgram; examplePrice: number | null }) {
  const earn = examplePrice != null ? exampleCommission(examplePrice, program) : null;
  const steps: [string, string][] = [
    ['Apply', 'Tell us who you are and where you\'ll share. We answer within 2 days.'],
    ['Share', `Give clients your code, or send your link. It counts for ${program.windowDays} days after they open it.`],
    ['Get paid', `When the album is delivered, it's yours. We send it by GCash once you have ${peso(program.minPayout)}.`],
  ];
  return (
    <View style={styles.gap} testID="affiliate-pitch">
      <Text style={styles.body}>
        Share your own code. Your clients get <Text style={styles.strong}>{peso(program.discount)} off</Text> their album,
        and you earn <Text style={styles.strong}>{program.ratePct}%</Text> of every album they order, paid by GCash.
      </Text>
      {steps.map(([t, d], i) => (
        <View key={t} style={styles.step}>
          <Text style={styles.stepNo}>STEP {i + 1}</Text>
          <Text style={styles.strong}>{t}</Text>
          <Text style={styles.body}>{d}</Text>
        </View>
      ))}
      {examplePrice != null && earn != null && (
        <Text style={styles.body} testID="affiliate-example">
          For example: an 8×8 hardbound album is {peso(examplePrice)}. Your client pays {peso(Math.max(0, examplePrice - program.discount))}, and you earn about <Text style={styles.strong}>{peso(earn)}</Text>.
        </Text>
      )}
      <Text style={styles.muted}>Great for wedding and event photographers, coordinators, schools, parishes and creators.</Text>
    </View>
  );
}

function ApplyForm({ program, again, onApplied }: { program: AffiliateProgram; again: boolean; onApplied: (m: MyAffiliate) => void }) {
  const [f, setF] = useState<AffiliateApplication>({ fullName: '', gcash: '', tin: '', promoteWhere: '', agree: false });
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const set = (patch: Partial<AffiliateApplication>) => { setF((cur) => ({ ...cur, ...patch })); if (err) setErr(''); };
  const send = async () => {
    if (sending) return;
    const problem = applicationProblem(f);
    if (problem) { setErr(problem); return; }
    setSending(true);
    try { onApplied(await applyAffiliate(f)); } catch (e) { setErr(e instanceof Error ? e.message : "We couldn't send your application. Try again."); } finally { setSending(false); }
  };
  return (
    <View style={styles.gap} testID="affiliate-apply">
      <Text style={styles.h2}>{again ? 'Apply again' : 'Apply'}</Text>
      <Text style={styles.label}>Full name (as on your GCash)</Text>
      <TextInput value={f.fullName} maxLength={80} autoComplete="name" onChangeText={(t) => set({ fullName: t })} style={styles.input} accessibilityLabel="Full name (as on your GCash)" testID="aff-name" />
      <Text style={styles.label}>GCash number</Text>
      <TextInput value={f.gcash} keyboardType="phone-pad" autoComplete="tel" placeholder="0917 123 4567" placeholderTextColor={colors.muted}
        onChangeText={(t) => set({ gcash: t })} style={styles.input} accessibilityLabel="GCash number" testID="aff-gcash" />
      <Text style={styles.muted}>Where we send what you earn.</Text>
      <Text style={styles.label}>TIN (if you have one)</Text>
      <TextInput value={f.tin} keyboardType="number-pad" placeholder="123-456-789-000" placeholderTextColor={colors.muted}
        onChangeText={(t) => set({ tin: t })} style={styles.input} accessibilityLabel="TIN, if you have one" testID="aff-tin" />
      <Text style={styles.label}>Where will you share your code?</Text>
      <TextInput value={f.promoteWhere} maxLength={300} multiline numberOfLines={3}
        placeholder="For example: I'm a wedding photographer in Cebu, about 3 weddings a month, and my Facebook page" placeholderTextColor={colors.muted}
        onChangeText={(t) => set({ promoteWhere: t })} style={[styles.input, styles.area]} accessibilityLabel="Where will you share your code?" testID="aff-where" />
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: f.agree }} onPress={() => set({ agree: !f.agree })} style={styles.agree} testID="aff-agree">
        <Text style={[styles.box, f.agree && styles.boxOn]}>{f.agree ? '✓' : ' '}</Text>
        <Text style={[styles.body, styles.flex]}>I agree to the affiliate terms below ({program.ratePct}% of each album, paid by GCash after delivery).</Text>
      </Pressable>
      {!!err && <Text style={styles.bad} accessibilityRole="alert" testID="aff-error">{err}</Text>}
      <Button label={sending ? 'Sending…' : 'Send my application'} busy={sending} onPress={() => void send()} testID="aff-send" />
    </View>
  );
}

function Terms({ program }: { program: AffiliateProgram }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.card} testID="affiliate-terms">
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} testID="affiliate-terms-toggle">
        <Text style={styles.link}>{open ? '▾' : '▸'} Affiliate terms</Text>
      </Pressable>
      {open && affiliateTerms(program).map((t, i) => <Text key={t} style={styles.body}>{i + 1}. {t}</Text>)}
    </View>
  );
}

function CopyButton({ text, label, testID }: { text: string; label: string; testID: string }) {
  const [done, setDone] = useState(false);
  const copy = useCallback(async () => {
    if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1800); }
  }, [text]);
  return <Button label={done ? 'Copied' : label} kind="plain" onPress={() => void copy()} style={styles.half} testID={testID} />;
}

const STATUS_COLOR: Record<SaleStatus, string> = { pending: '#8A5A12', payable: '#1F4E99', paid: '#2E7D4A', void: '#8A8A8A' };

function Dashboard({ mine, program }: { mine: MyAffiliate; program: AffiliateProgram }) {
  const a = mine.affiliate!;
  const code = a.code ?? '';
  const link = affiliateLink(code);
  const t = mine.totals;
  const share = () => {
    void Share.share({ message: `Make your photo album with Megy Prints and get ${peso(program.discount)} off with my code ${code}. ${link}` }).catch(() => {});
  };
  const totals: [string, number, string][] = [
    ['This month', t.thisMonth, 'affiliate-this-month'],
    ['Waiting for delivery', t.pending, 'affiliate-pending-total'],
    ['To be paid', t.payable, 'affiliate-payable'],
    ['Paid to you', t.paid, 'affiliate-paid'],
  ];
  return (
    <View style={styles.gap} testID="affiliate-dashboard">
      {a.status === 'paused' ? (
        <View style={styles.gap}>
          <Text style={styles.body} testID="affiliate-paused">Your code is paused, so it doesn't take money off right now. What you already earned is still paid. Questions? Message us.</Text>
          <Button label="Message us" kind="plain" onPress={messageUs} testID="affiliate-message-us" />
        </View>
      ) : (
        <Text style={styles.body}>
          Your clients get <Text style={styles.strong}>{peso(program.discount)} off</Text>. You earn <Text style={styles.strong}>{a.ratePct}%</Text> of each album they order.
        </Text>
      )}
      <View style={styles.card}>
        <Text style={styles.label}>Your code</Text>
        <Text style={styles.code} selectable testID="affiliate-code">{code}</Text>
        <Text style={styles.label}>Your link</Text>
        <Text style={styles.small} selectable testID="affiliate-link">{link}</Text>
        <View style={styles.row}>
          <CopyButton text={code} label="Copy code" testID="affiliate-copy-code" />
          <CopyButton text={link} label="Copy link" testID="affiliate-copy-link" />
        </View>
        <Button label="Share my code" onPress={share} testID="affiliate-share" />
        <Text style={styles.muted}>The link counts for {program.windowDays} days after your client opens it, on the same phone or computer. In the app, your client types your code at checkout.</Text>
      </View>
      <View style={styles.totals} testID="affiliate-totals">
        {totals.map(([label, amount, id]) => (
          <View key={id} style={styles.total}>
            <Text style={styles.muted}>{label}</Text>
            <Text style={styles.amount} testID={id}>{peso(amount)}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.body} testID="affiliate-payout-note">
        {t.payable >= program.minPayout
          ? `Your next GCash payout (${peso(t.payable)}) goes to the number ending ${a.gcashLast4}.`
          : `We send a payout by GCash (number ending ${a.gcashLast4}) once you have ${peso(program.minPayout)} to be paid. ${t.sales} ${t.sales === 1 ? 'sale' : 'sales'} so far, ${peso(t.allTime)} earned in all.`}
      </Text>
      <Text style={styles.h2}>Your sales</Text>
      {mine.sales.length === 0 ? (
        <Text style={styles.muted} testID="affiliate-no-sales">No sales yet. Share your code with your next client!</Text>
      ) : (
        <View style={styles.gap} testID="affiliate-sales">
          {mine.sales.map((s, i) => (
            <View key={`${s.earnedAt}-${i}`} style={styles.line}>
              <View style={styles.flex}>
                <Text style={styles.strong}>{[sizeName(s.albumSize), coverName(s.cover)].filter(Boolean).join(' · ') || 'Album'}</Text>
                <Text style={styles.muted}>{fmtDate(s.earnedAt)}</Text>
              </View>
              <View style={styles.right}>
                <Text style={[styles.strong, s.status === 'void' && styles.struck]}>{peso(s.amount)}</Text>
                <Text style={[styles.small, { color: STATUS_COLOR[s.status] }]}>{saleStatusLabel(s.status)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
      {mine.payouts.length > 0 && (
        <>
          <Text style={styles.h2}>Payouts</Text>
          <View style={styles.gap} testID="affiliate-payouts">
            {mine.payouts.map((p, i) => (
              <View key={`${p.paidAt}-${i}`} style={styles.line}>
                <View style={styles.flex}>
                  <Text style={styles.strong}>{fmtDate(p.paidAt)}</Text>
                  <Text style={styles.muted}>GCash reference {p.reference}</Text>
                </View>
                <Text style={styles.strong}>{peso(p.amount)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
      <Terms program={program} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.md, gap: space.md, paddingBottom: space.xl * 2, backgroundColor: colors.background },
  h1: { fontSize: 24, fontWeight: '800', color: colors.text },
  h2: { fontSize: 18, fontWeight: '800', color: colors.text },
  body: { fontSize: 16, lineHeight: 23, color: colors.text },
  strong: { fontSize: 16, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, lineHeight: 20, color: colors.muted },
  small: { fontSize: 14, color: colors.text },
  bad: { fontSize: 15, lineHeight: 21, color: colors.bad },
  link: { fontSize: 16, fontWeight: '700', color: colors.accent, paddingVertical: space.xs },
  label: { fontSize: 14, fontWeight: '700', color: colors.text },
  gap: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  half: { flex: 1, paddingHorizontal: space.sm },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
  step: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: 2 },
  stepNo: { fontSize: 12, fontWeight: '800', color: colors.accent, letterSpacing: 1 },
  input: { borderWidth: 1, borderColor: '#C9BBAF', borderRadius: 10, backgroundColor: '#FFFAF6', paddingHorizontal: space.sm, minHeight: 48, fontSize: 16, color: colors.text },
  area: { minHeight: 90, textAlignVertical: 'top', paddingTop: space.sm },
  agree: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', paddingVertical: space.xs },
  box: { width: 26, height: 26, borderWidth: 2, borderColor: colors.accent, borderRadius: 6, textAlign: 'center', fontWeight: '800', color: colors.accentText },
  boxOn: { backgroundColor: colors.accent },
  code: { fontSize: 28, fontWeight: '800', color: colors.accent, letterSpacing: 2, fontFamily: 'monospace' },
  totals: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  total: { flexBasis: '47%', flexGrow: 1, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: space.md },
  amount: { fontSize: 20, fontWeight: '800', color: colors.text },
  line: { flexDirection: 'row', gap: space.sm, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: space.md },
  right: { alignItems: 'flex-end' },
  struck: { textDecorationLine: 'line-through', color: colors.muted },
});
