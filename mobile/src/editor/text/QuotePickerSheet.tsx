/* ══════════════════════════════════════════════════════════════════════════
   THE QUOTE PICKER (the website's QuotePickerModal, phone sheet).

   • "Write a line for this photo": lines Megy writes from ALL the photos on
     the page (photoQuotes.ts → the website's /api/photo-quotes by its full
     address), for a signed-in account only (it costs per tap). Signed out,
     a tap asks for the sign-in and sends nothing; once signed in, the
     picker opens again by itself on that box and writes (resumeQuote.ts),
     as the website carries on once. Lines are written for the room the box
     has and offered only if they fit it (textFit quoteRoom, captionFits).
     An empty quote box ("Let AI write a quote") starts writing at once.
   • The quote bank (800 lines, offline: themeQuotePool curatedQuotesFor),
     shown only while the shared DEAL_BANK_QUOTES switch is on, exactly as
     the website (owner, 2026-10-21: off, "haiku is now dynamically doing
     the quotes"). One switch turns it on in both.
   • "Type your own words" (no line yet) or "Edit the words" / "Remove
     quote" (a line already there).
   Every pick goes through the website's builder (wordsFlow pickQuote /
   removeQuote: setBoxText or setSlotText, the website's arguments).
   ══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { DEAL_BANK_QUOTES } from '@web/pages/builder/generateAlbum';
import { captionFits, quoteRoom } from '@web/pages/builder/textFit';
import { curatedQuotesFor, MAX_QUOTE_CHARS } from '@web/lib/themeQuotePool';
import { cleanAlbumTheme, MAX_THEME_LENGTH, readAlbumThemeFrom, writeAlbumThemeTo } from '@web/lib/albumThemeRules';
import { colors, space } from '../../lib/theme';
import { EditorSheet } from '../core/EditorSheet';
import type { SheetProps } from '../registry';
import { appPhotoQuoteDeps } from './appPhotoQuotes';
import { pagePhotoUris, writeLinesForPhotos, type PhotoQuoteDeps } from './photoQuotes';
import { askToResume } from './resumeQuote';
import {
  ADD_A_QUOTE, BANK_EMPTY, BANK_HEADING, BANK_PLACEHOLDER, bankSource, CHANGE_QUOTE, consent, EDIT_THE_WORDS, lookingAt,
  MORE_LINES, NO_PHOTO_NOTE, PHOTO_QUOTE_MESSAGES, REMOVE_QUOTE, SIGN_IN, SIGN_IN_FIRST, signInFor, TYPE_YOUR_OWN_WORDS,
  WRITE_3_MORE, writeALine, writtenFor,
} from './words';
import { pickQuote, quoteBoxFor, quoteOpening, removeQuote, type WordsTarget } from './wordsFlow';

export interface QuotePickerParams {
  target: WordsTarget;
  /** Start writing at once (an empty quote box, or back from signing in). */
  autoWrite?: boolean;
  /** Tests: fakes for the token, the photo copies and fetch (never the live endpoint). */
  deps?: PhotoQuoteDeps;
  /** Tests: the bank switch (default: the website's DEAL_BANK_QUOTES). */
  bank?: boolean;
  /** Tests: who is signed in (default: the app's sign-in). */
  signedIn?: boolean;
}

export function QuotePickerSheet(props: SheetProps<QuotePickerParams>) {
  return props.params.signedIn === undefined ? <WithAuth {...props} /> : <Picker {...props} signedIn={props.params.signedIn} />;
}

function WithAuth(props: SheetProps<QuotePickerParams>) {
  // Who is signed in, from the builder's platform (the app's sign-in).
  const user = props.ctx.platform.cloud.useUser();
  return <Picker {...props} signedIn={!!user} />;
}

function Picker({ ctx, params, close, signedIn }: SheetProps<QuotePickerParams> & { signedIn: boolean }) {
  const { builder, page, pageIndex, platform } = ctx;
  const { target } = params;
  const deps = params.deps ?? appPhotoQuoteDeps;
  const bank = params.bank ?? DEAL_BANK_QUOTES;
  const { initial, autoWrite: emptyBox } = quoteOpening(page, target);
  const autoWrite = params.autoWrite ?? emptyBox;
  const photoUris = pagePhotoUris(page, builder.uploadedPhotos);
  const many = photoUris.length > 1;
  const quoteBox = quoteBoxFor(page, target, builder.albumSize, pageIndex);

  const pick = (quote: string) => { pickQuote(builder, page, pageIndex, target, quote); close(); };
  const remove = () => { removeQuote(builder, pageIndex, target); close(); };
  const edit = () => { close(); ctx.openSheet('text:edit', { target }); };

  // ── "Write a line for this photo" ──
  const [theme, setTheme] = useState(() => readAlbumThemeFrom(platform.deviceStore));
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [needSignIn, setNeedSignIn] = useState(false);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const write = useCallback(async () => {
    if (!signedIn) { setNeedSignIn(true); return; }
    setNeedSignIn(false);
    setNote(null);
    setBusy(true);
    const m = platform.textMeasurer();
    const room = quoteBox ? quoteRoom(quoteBox.box, quoteBox.style, 100, m) : null;
    const r = await writeLinesForPhotos(deps, photoUris, cleanAlbumTheme(theme), lines, room ?? undefined);
    if (!live.current) return;
    setBusy(false);
    if ('lines' in r) {
      // Offered only if it prints whole in this box, checked the way print wraps.
      const fit = quoteBox ? r.lines.filter((l) => captionFits(l, quoteBox.style, quoteBox.box, m)?.fits ?? true) : r.lines;
      if (fit.length) { setLines(fit); return; }
      setNote(PHOTO_QUOTE_MESSAGES.no_fit);
      return;
    }
    if (r.error === 'sign_in') { setNeedSignIn(true); return; }
    setNote(PHOTO_QUOTE_MESSAGES[r.error]);
    // photoUris / quoteBox are worked out from the page each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, deps, theme, lines, platform]);

  // An empty quote box ("Let AI write a quote"): start at once, ONCE.
  const auto = useRef(autoWrite);
  useEffect(() => {
    if (!auto.current || photoUris.length === 0) return;
    auto.current = false;
    void Promise.resolve().then(write);
  }, [photoUris.length, write]);

  const signIn = () => {
    // The sheet closes first (a sheet would sit over the sign-in screen); the
    // editor opens it again on this box once the sign-in is done.
    askToResume({ pageIndex, target });
    close();
    // Back here once signed in (sign-in.tsx), where the picker opens again.
    router.push({ pathname: '/sign-in', params: { then: 'back' } });
  };

  // ── The bank (only while DEAL_BANK_QUOTES is on) ──
  const [bankLines, setBankLines] = useState<string[]>(() => (bank ? curatedQuotesFor(cleanAlbumTheme(theme)) : []));
  const moreLines = () => {
    const q = cleanAlbumTheme(theme);
    if (q) writeAlbumThemeTo(platform.deviceStore, q, platform.occasionChanged);
    setBankLines(curatedQuotesFor(q));
  };

  return (
    <EditorSheet title={initial ? CHANGE_QUOTE : ADD_A_QUOTE} onClose={close} scroll testID="quote-picker">
      {photoUris.length > 0 && (
        <View testID="photo-quote">
          {busy ? (
            <View style={styles.busy}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.muted}>{lookingAt(many)}</Text>
            </View>
          ) : lines.length > 0 ? (
            <View style={styles.gap}>
              <Text style={styles.small} testID="photo-quote-heading">{writtenFor(many)}</Text>
              {lines.map((q) => (
                <Pressable key={q} accessibilityRole="button" accessibilityLabel={q} onPress={() => pick(q)} testID="photo-quote-line"
                  style={({ pressed }) => [styles.line, styles.lineNew, pressed && styles.pressed]}>
                  <Text style={styles.lineText}>{q}</Text>
                </Pressable>
              ))}
              <Pressable accessibilityRole="button" accessibilityLabel={WRITE_3_MORE} onPress={() => void write()} testID="photo-quote-more" style={styles.link}>
                <Text style={styles.linkText}>{`✦ ${WRITE_3_MORE}`}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.gap}>
              <Pressable accessibilityRole="button" accessibilityLabel={writeALine(many)} onPress={() => void write()} testID="photo-quote-write"
                style={({ pressed }) => [styles.write, pressed && styles.pressed]}>
                <Text style={styles.writeText}>{`✦ ${writeALine(many)}`}</Text>
              </Pressable>
              <Text style={styles.consent}>{consent(many)}</Text>
            </View>
          )}
          {needSignIn && (
            <View style={styles.signIn} testID="photo-quote-sign-in">
              <Text style={styles.signInText}><Text style={styles.bold}>{SIGN_IN_FIRST}</Text>{` ${signInFor(many)}`}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={SIGN_IN} onPress={signIn} testID="photo-quote-sign-in-button"
                style={({ pressed }) => [styles.signInButton, pressed && styles.pressed]}>
                <Text style={styles.signInButtonText}>{SIGN_IN}</Text>
              </Pressable>
            </View>
          )}
          {note && <Text style={styles.note} testID="photo-quote-note">{note}</Text>}
        </View>
      )}

      {bank && (
        <View style={styles.gap} testID="quote-bank">
          <Text style={styles.small}>{BANK_HEADING}</Text>
          <View style={styles.themeRow}>
            <TextInput value={theme} onChangeText={setTheme} maxLength={MAX_THEME_LENGTH} placeholder={BANK_PLACEHOLDER}
              onSubmitEditing={moreLines} style={styles.themeInput} accessibilityLabel={BANK_HEADING} testID="quote-bank-theme" />
            <Pressable accessibilityRole="button" accessibilityLabel={MORE_LINES} onPress={moreLines} testID="quote-bank-more"
              style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
              <Text style={styles.moreText}>{MORE_LINES}</Text>
            </Pressable>
          </View>
          {bankLines.length > 0 ? (
            <>
              {bankLines.map((q) => (
                <Pressable key={q} accessibilityRole="button" accessibilityLabel={q} onPress={() => pick(q)} testID="quote-bank-line"
                  style={({ pressed }) => [styles.line, q === initial && styles.lineNow, pressed && styles.pressed]}>
                  <Text style={styles.lineText}>{q}</Text>
                </Pressable>
              ))}
              <Text style={styles.consent}>{bankSource(theme, MAX_QUOTE_CHARS)}</Text>
            </>
          ) : <Text style={styles.muted}>{BANK_EMPTY}</Text>}
        </View>
      )}

      {!initial ? (
        <View style={styles.gap}>
          {photoUris.length === 0 && <Text style={styles.noPhoto} testID="quote-no-photo">{NO_PHOTO_NOTE}</Text>}
          <Pressable accessibilityRole="button" accessibilityLabel={TYPE_YOUR_OWN_WORDS} onPress={edit} testID="quote-own-words"
            style={({ pressed }) => [styles.own, pressed && styles.pressed]}>
            <Text style={styles.ownText}>{TYPE_YOUR_OWN_WORDS}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.footer}>
          {photoUris.length === 0 && <Text style={styles.noPhoto} testID="quote-no-photo">{NO_PHOTO_NOTE}</Text>}
          <View style={styles.footerRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={EDIT_THE_WORDS} onPress={edit} testID="quote-edit-words"
              style={({ pressed }) => [styles.footerButton, pressed && styles.pressed]}>
              <Text style={styles.footerText}>{`✎ ${EDIT_THE_WORDS}`}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={REMOVE_QUOTE} onPress={remove} testID="quote-remove"
              style={({ pressed }) => [styles.footerButton, pressed && styles.pressed]}>
              <Text style={[styles.footerText, { color: colors.bad }]}>{REMOVE_QUOTE}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </EditorSheet>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.sm },
  busy: { paddingVertical: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  muted: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  small: { fontSize: 12, color: colors.muted },
  line: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'center' },
  lineNew: { borderColor: '#EBC3AE', backgroundColor: '#FFF1EA' },
  lineNow: { borderColor: colors.accent, backgroundColor: '#FFF1EA' },
  lineText: { fontSize: 15, lineHeight: 21, color: colors.text, fontStyle: 'italic', fontFamily: 'serif' },
  pressed: { opacity: 0.85 },
  link: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontSize: 14, fontWeight: '700', color: colors.accent },
  write: { minHeight: 52, borderRadius: 12, borderWidth: 2, borderColor: '#EBC3AE', alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md },
  writeText: { fontSize: 15, fontWeight: '700', color: colors.accent, textAlign: 'center' },
  consent: { fontSize: 11, color: '#9A8D7F', textAlign: 'center' },
  signIn: { marginTop: space.sm, borderRadius: 10, borderWidth: 1, borderColor: '#EBC3AE', backgroundColor: '#FFF1EA', padding: space.sm, gap: space.sm },
  signInText: { fontSize: 13, lineHeight: 18, color: '#7A3A1E' },
  bold: { fontWeight: '800' },
  signInButton: { alignSelf: 'flex-start', minHeight: 48, paddingHorizontal: space.lg, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  signInButtonText: { color: colors.accentText, fontWeight: '800', fontSize: 15 },
  note: { marginTop: space.sm, fontSize: 13, color: '#7A3A1E' },
  themeRow: { flexDirection: 'row', gap: space.sm },
  themeInput: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: space.sm, fontSize: 15, color: colors.text },
  more: { minHeight: 48, paddingHorizontal: space.md, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  moreText: { color: colors.accentText, fontWeight: '700', fontSize: 14 },
  noPhoto: { fontSize: 13, color: '#7A3A1E', textAlign: 'center' },
  own: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  ownText: { fontSize: 15, fontWeight: '600', color: colors.text },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm, gap: space.sm },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  footerButton: { minHeight: 48, paddingHorizontal: space.sm, justifyContent: 'center' },
  footerText: { fontSize: 14, fontWeight: '600', color: colors.text },
});
