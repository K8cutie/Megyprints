/* ══════════════════════════════════════════════════════════════════════════
   PICK PHOTOS: the phone's photos in a fast grid, newest first, one block per
   day. Tap a photo to pick it, "Select" picks a whole day, "Select all" picks
   everything. The running count and ONE filled button, "Add N photos", sit at
   the bottom. Photos already in the album say "In album".

   The grid is one FlashList whose items are whole rows (a day heading, or
   four photos), so only the rows on screen exist: smooth with thousands of
   photos. Thumbnails are expo-image (Android makes the small version from
   the photo where it is; nothing is copied).
   ══════════════════════════════════════════════════════════════════════════ */
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { photoWord } from '@web/pages/builder/albumMinimum';
import { releasePickedFiles } from '../../modules/photo-files';
import { Button } from '../components/Button';
import { Thumb } from '../components/Thumb';
import { useDraft } from '../lib/draftStore';
import { accessToGiveBack, pickFromFiles } from '../lib/filePhotos';
import { photosForAlbum, type GalleryPhoto } from '../lib/gallery';
import { formatCount, gridRows, groupByDay, type Day, type GridRow } from '../lib/photoDays';
import { idsInAlbum, pickerProgress } from '../lib/photoDraft';
import { ALLOW_PHOTOS, ALREADY_IN, ASK_LINE, CHOOSE_MORE, FILES, FILES_INSTEAD, FILES_WORKS, LIMITED_HOW, LIMITED_TITLE, SETTINGS_HOW, TAP_TO_PICK, ALL_IN_ALBUM } from '../lib/pickWords';
import { allPicked, countSelected, everythingSelected, groupState, isSelected, keepOnly, nothingSelected, photosToAdd, setMany, toggle, type Selection } from '../lib/photoSelection';
import { colors, space } from '../lib/theme';
import { useGallery } from '../lib/useGallery';

const COLUMNS = 4;
const GAP = 2;

export default function PickPhotos() {
  const gallery = useGallery();
  const { draft, loading: draftLoading, add, peek } = useDraft();
  const [selection, setSelection] = useState<Selection>(nothingSelected);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { width } = useWindowDimensions();
  const cell = Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS);

  const ids = useMemo(() => gallery.photos.map((p) => p.id), [gallery.photos]);
  // Photos already in the album, however they were added (grid or Files),
  // matched by Android's photo number (photoDraft.idsInAlbum).
  const blocked = useMemo(() => idsInAlbum(ids, draft.photos), [ids, draft.photos]);
  const rows = useMemo(() => gridRows(groupByDay(gallery.photos), COLUMNS), [gallery.photos]);
  const picked = useMemo(() => countSelected(selection, ids, blocked), [selection, ids, blocked]);
  const everything = useMemo(() => allPicked(selection, ids, blocked), [selection, ids, blocked]);
  const pickable = ids.length - ids.reduce((n, id) => (blocked.has(id) ? n + 1 : n), 0);

  // Photos that left the phone (or the chosen set) leave the selection too.
  useEffect(() => {
    if (gallery.loadingMore) return;
    setSelection((s) => keepOnly(s, new Set(ids)));
  }, [ids, gallery.loadingMore]);

  useEffect(() => () => clearTimeout(noteTimer.current), []);

  const say = useCallback((text: string) => {
    setNote(text);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 3000);
  }, []);

  const onTap = useCallback((id: string) => {
    if (blocked.has(id)) { say(ALREADY_IN); return; }
    setSelection((s) => toggle(s, id, blocked));
  }, [blocked, say]);

  const onDay = useCallback((day: Day<GalleryPhoto>, on: boolean) => {
    setSelection((s) => setMany(s, day.items.map((p) => p.id), on, blocked));
  }, [blocked]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/photos'));

  const addPicked = async () => {
    setAdding(true);
    try {
      // Select all waits for photos still loading and adds them too.
      const chosen = await photosToAdd(selection, gallery.photos, gallery.whenLoaded, (list) => idsInAlbum(list, peek().photos));
      const result = add(await photosForAlbum(chosen));
      if (result.alreadyIn > 0) {
        Alert.alert(
          result.added ? `Added ${formatCount(result.added)} ${photoWord(result.added)}` : 'No photos added',
          `${formatCount(result.alreadyIn)} ${photoWord(result.alreadyIn)} already in your album`,
        );
      }
      goBack();
    } catch (e) {
      console.warn('Could not add the photos', e);
      setAdding(false);
      say('Could not add the photos. Try again.');
    }
  };

  const fromFiles = async () => {
    try {
      const pick = await pickFromFiles();
      if (!pick) return;
      const result = add(pick.photos);
      // Files that did not go in (could not be opened, already in the album)
      // give their kept access back.
      void releasePickedFiles(accessToGiveBack(pick.kept, peek().photos)).catch(() => 0);
      const told = [pick.note, result.alreadyIn ? `${result.alreadyIn} ${photoWord(result.alreadyIn)} already in your album` : ''].filter(Boolean).join(' · ');
      if (told) Alert.alert(result.added ? `Added ${result.added} ${photoWord(result.added)}` : 'No photos added', told);
      if (result.added) goBack();
    } catch (e) {
      console.warn('Files picker failed', e);
      say('Could not open Files. Try again.');
    }
  };

  const access = gallery.access;
  if (!access || draftLoading) return <Centered><ActivityIndicator color={colors.accent} size="large" /></Centered>;

  if (access.state === 'ask') return <AskForPhotos access={access} onAsk={gallery.ask} onFiles={fromFiles} />;

  const limited = access.state === 'limited';

  if (gallery.loadingFirst) {
    return (
      <Centered>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.muted}>Opening your photos</Text>
      </Centered>
    );
  }

  if (gallery.failed && gallery.photos.length === 0) {
    return (
      <Centered>
        <Text style={styles.heading}>Could not open your photos</Text>
        <Button label="Try again" onPress={gallery.reload} style={styles.wide} testID="gallery-retry" />
        <Button label={FILES} kind="plain" onPress={fromFiles} style={styles.wide} />
      </Centered>
    );
  }

  if (gallery.photos.length === 0) {
    return limited ? (
      <Centered>
        <Text style={styles.heading}>No photos chosen yet</Text>
        <Text style={styles.muted}>Megy Prints can see only the photos you choose.</Text>
        <Button label="Choose photos" onPress={() => { void gallery.chooseMore(); }} style={styles.wide} testID="choose-more" />
        <Button label={FILES} kind="plain" onPress={fromFiles} style={styles.wide} />
      </Centered>
    ) : (
      <Centered>
        <Text style={styles.heading}>No photos on this phone</Text>
        <Text style={styles.muted}>Photos you take or save show here. You can also pick photos from Files.</Text>
        <Button label={FILES} onPress={fromFiles} style={styles.wide} testID="files-empty" />
      </Centered>
    );
  }

  const header = (
    <View style={styles.header}>
      {limited && (
        <View style={styles.limited} testID="limited-banner">
          <Text style={styles.limitedTitle}>{LIMITED_TITLE}</Text>
          <Button label={CHOOSE_MORE} kind="plain" onPress={() => { void gallery.chooseMore(); }} testID="choose-more" />
          <Text style={styles.limitedHow}>{LIMITED_HOW}</Text>
          <Pressable accessibilityRole="button" onPress={() => { void Linking.openSettings(); }} style={styles.link}>
            <Text style={styles.linkText}>Open Settings</Text>
          </Pressable>
        </View>
      )}
      <Text style={styles.total}>
        {formatCount(ids.length)} {photoWord(ids.length)} {limited ? 'you chose' : 'on this phone'}
        {gallery.loadingMore ? ' (still opening more)' : ''}
      </Text>
      {pickable > 0 && (
        <Button
          label={everything ? 'Unselect all' : `Select all ${formatCount(pickable)} ${photoWord(pickable)}`}
          kind="plain"
          onPress={() => setSelection(everything ? nothingSelected() : everythingSelected())}
          testID="select-all"
        />
      )}
      <Pressable accessibilityRole="button" onPress={fromFiles} style={styles.link} testID="files-link">
        <Text style={styles.linkText}>Photos not here? Choose from Files</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.page}>
      <FlashList
        data={rows}
        keyExtractor={(r) => r.key}
        getItemType={(r) => r.kind}
        extraData={selection}
        drawDistance={cell * 6}
        ListHeaderComponent={header}
        contentContainerStyle={styles.listPad}
        renderItem={({ item }: { item: GridRow<GalleryPhoto> }) =>
          item.kind === 'day' ? (
            <DayHeading day={item.day} state={groupState(selection, item.day.items.map((p) => p.id), blocked)} allInAlbum={item.day.items.every((p) => blocked.has(p.id))} onToggle={onDay} />
          ) : (
            <PhotoRow items={item.items} cell={cell} selection={selection} blocked={blocked} onTap={onTap} />
          )
        }
      />
      <SafeAreaView edges={['bottom']} style={styles.bar}>
        {note ? <Text style={styles.note} accessibilityLiveRegion="polite">{note}</Text> : null}
        <Text style={styles.count} testID="picked-count">
          {picked > 0 ? `${formatCount(picked)} ${photoWord(picked)} selected` : pickable > 0 ? TAP_TO_PICK : ALL_IN_ALBUM}
        </Text>
        <Text style={styles.progress}>{pickerProgress(draft.photos.length, picked)}</Text>
        {picked > 0 && (
          <Button label={`Add ${formatCount(picked)} ${photoWord(picked)}`} busy={adding} onPress={() => { void addPicked(); }} testID="add-photos" />
        )}
      </SafeAreaView>
    </View>
  );
}

/* ── Asking for photo access, in plain words, with Files as the way round ── */

function AskForPhotos({ access, onAsk, onFiles }: { access: { canAskAgain: boolean; refused: boolean }; onAsk: () => Promise<void>; onFiles: () => Promise<void> }) {
  const off = !access.canAskAgain;
  const refused = access.refused && !off;
  return (
    <SafeAreaView edges={['bottom']} style={styles.ask}>
      <View style={styles.askText}>
        <Text style={styles.heading}>{off ? 'Photo access is off' : refused ? 'Photo access was not allowed' : 'Pick photos from your phone'}</Text>
        <Text style={styles.body}>{ASK_LINE}</Text>
        {off && <Text style={styles.body}>{SETTINGS_HOW}</Text>}
        <Text style={styles.small}>{FILES_WORKS}</Text>
      </View>
      <View style={styles.askButtons}>
        {off || refused ? (
          <>
            <Button label={FILES} onPress={() => { void onFiles(); }} testID="files-main" />
            {off ? (
              <Button label="Open Settings" kind="plain" onPress={() => { void Linking.openSettings(); }} testID="open-settings" />
            ) : (
              <Button label="Ask for photo access again" kind="plain" onPress={() => { void onAsk(); }} testID="ask-again" />
            )}
          </>
        ) : (
          <>
            <Button label={ALLOW_PHOTOS} onPress={() => { void onAsk(); }} testID="allow-photos" />
            <Button label={FILES_INSTEAD} kind="plain" onPress={() => { void onFiles(); }} testID="files-instead" />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

/* ── Grid rows ─────────────────────────────────────────────────────────── */

const DayHeading = memo(function DayHeading({ day, state, allInAlbum, onToggle }: {
  day: Day<GalleryPhoto>;
  state: 'all' | 'some' | 'none';
  allInAlbum: boolean;
  onToggle: (day: Day<GalleryPhoto>, on: boolean) => void;
}) {
  const n = day.items.length;
  const on = state !== 'all';
  return (
    <View style={styles.day}>
      <View style={styles.dayText}>
        <Text style={styles.dayLabel}>{day.label}</Text>
        <Text style={styles.dayCount}>{formatCount(n)} {photoWord(n)}</Text>
      </View>
      {allInAlbum ? (
        <Text style={styles.dayDone}>In album</Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={on ? `Select the photos from ${day.label}` : `Unselect the photos from ${day.label}`}
          onPress={() => onToggle(day, on)}
          style={({ pressed }) => [styles.dayButton, !on && styles.dayButtonOn, pressed && styles.pressed]}
          hitSlop={8}
        >
          <Text style={[styles.dayButtonText, !on && styles.dayButtonTextOn]}>{on ? 'Select' : 'Unselect'}</Text>
        </Pressable>
      )}
    </View>
  );
});

const PhotoRow = memo(function PhotoRow({ items, cell, selection, blocked, onTap }: {
  items: GalleryPhoto[];
  cell: number;
  selection: Selection;
  blocked: ReadonlySet<string>;
  onTap: (id: string) => void;
}) {
  return (
    <View style={[styles.row, { height: cell + GAP }]}>
      {items.map((p) => (
        <PhotoCell key={p.id} photo={p} cell={cell} selected={isSelected(selection, p.id, blocked)} inAlbum={blocked.has(p.id)} onTap={onTap} />
      ))}
    </View>
  );
});

const PhotoCell = memo(function PhotoCell({ photo, cell, selected, inAlbum, onTap }: {
  photo: GalleryPhoto;
  cell: number;
  selected: boolean;
  inAlbum: boolean;
  onTap: (id: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onTap(photo.id)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled: false }}
      accessibilityLabel={inAlbum ? 'Photo, already in your album' : 'Photo'}
      style={{ width: cell, height: cell }}
    >
      <Thumb uri={photo.id} size={cell} recyclingKey={photo.id} />
      {inAlbum ? (
        <View style={styles.inAlbum}>
          <Text style={styles.inAlbumText}>In album</Text>
        </View>
      ) : (
        <>
          {selected && <View style={styles.selectedFrame} />}
          <View style={[styles.tick, selected && styles.tickOn]}>
            {selected && <Text style={styles.tickMark}>✓</Text>}
          </View>
        </>
      )}
    </Pressable>
  );
});

function Centered({ children }: { children: ReactNode }) {
  return <View style={styles.center}>{children}</View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.sm, backgroundColor: colors.background },
  heading: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  body: { fontSize: 17, lineHeight: 24, color: colors.text, textAlign: 'center' },
  small: { fontSize: 15, lineHeight: 21, color: colors.muted, textAlign: 'center' },
  muted: { fontSize: 16, lineHeight: 22, color: colors.muted, textAlign: 'center' },
  wide: { alignSelf: 'stretch', marginTop: space.sm },
  ask: { flex: 1, backgroundColor: colors.background, padding: space.lg, justifyContent: 'space-between' },
  askText: { flex: 1, justifyContent: 'center', gap: space.md },
  askButtons: { gap: space.md, paddingBottom: space.md },
  listPad: { paddingBottom: space.md },
  header: { padding: space.md, gap: space.sm },
  limited: { backgroundColor: '#FBEDE6', borderRadius: 14, borderWidth: 1, borderColor: '#EBC9B8', padding: space.md, gap: space.sm },
  limitedTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  limitedHow: { fontSize: 14, lineHeight: 20, color: colors.muted },
  total: { fontSize: 15, color: colors.muted },
  link: { alignSelf: 'flex-start', paddingVertical: space.xs },
  linkText: { fontSize: 15, color: colors.accent, fontWeight: '600', textDecorationLine: 'underline' },
  day: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, backgroundColor: colors.background },
  dayText: { flex: 1 },
  dayLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  dayCount: { fontSize: 13, color: colors.muted },
  dayDone: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  dayButton: { borderWidth: 1.5, borderColor: colors.accent, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 6, backgroundColor: colors.card },
  dayButtonOn: { backgroundColor: '#FBEDE6' },
  dayButtonText: { fontSize: 15, fontWeight: '700', color: colors.accent },
  dayButtonTextOn: { color: colors.accent },
  pressed: { opacity: 0.8 },
  row: { flexDirection: 'row', gap: GAP },
  selectedFrame: { ...StyleSheet.absoluteFill, borderWidth: 4, borderColor: colors.accent },
  tick: {
    position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center',
  },
  tickOn: { backgroundColor: colors.accent, borderColor: '#FFFFFF' },
  tickMark: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', lineHeight: 18 },
  inAlbum: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(46,46,46,0.55)', alignItems: 'center', justifyContent: 'center' },
  inAlbumText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  bar: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.sm, gap: 6 },
  note: { fontSize: 14, color: colors.text, fontWeight: '600' },
  count: { fontSize: 17, fontWeight: '700', color: colors.text },
  progress: { fontSize: 14, color: colors.muted },
});
