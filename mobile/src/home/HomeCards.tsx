/* ══════════════════════════════════════════════════════════════════════════
   THE START SCREEN'S TWO CARDS, the website's home cards
   (src/pages/home/HomeCards.tsx, the owner's board "Home with Albums and
   Events"), drawn the same way at the same sizes (owner, 2026-11-03, the
   1.x and 2.0 start screens side by side: "1.x looks more 2.0 than 2.0").

   Each card: its label and headline stay put, its middle plays the steps by
   itself (a slide every 4 s, dots to jump, Pause/Play), its button stays
   put. The Albums slides move half a beat after the Events ones, so the two
   never slide together. A finger swipes them and, while it is on them, holds
   the clock. With "reduce motion" on the slides still change every 4 s, but
   jump instead of sliding, and the pictures hold still.

   Album card's button: "Start Creating" (the website's); with an album in
   progress, "Continue my album" and "Start a new album" instead, as before.
   ══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Image, type ImageSourcePropType, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { GOLD, VideoMark } from '../editor/core/GoldButton';
import { useHomeMotion } from './homeMotion';
import { useType } from './homeFonts';
import { ArrowUp, Calendar, Sparkle, Tick, Truck } from './homeIcons';
import { ALBUMS_CARD, EVENTS_CARD, HOME, type HomeStep } from './homeWords';

/* eslint-disable @typescript-eslint/no-require-imports */
const FAMILY: ImageSourcePropType = require('../../assets/home/family.jpg');
const TRAVEL: ImageSourcePropType = require('../../assets/home/travel.jpg');
const WEDDING: ImageSourcePropType = require('../../assets/home/wedding.jpg');
const MEGY: ImageSourcePropType = require('../../assets/home/megy.png');
/* eslint-enable @typescript-eslint/no-require-imports */

/** One slide's time on screen (the website's). */
export const SLIDE_MS = 4000;

/** The website's colours for the cards. */
export const INK = {
  dark: '#2D2D2D',
  body: '#4A423F',
  soft: '#6B625E',
  label: '#9A4A2C',
  peach: '#B85C38',
  paper: '#FBF1EB',
  circle: '#F3DCCF',
  goldPaper: '#FBF4E6',
  goldCircle: '#F3E2BE',
  goldLabel: '#8A6420',
  goldNumber: '#B8862B',
  sparkleGold: '#C9962F',
} as const;

const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

/* ── The carousel ─────────────────────────────────────────────────────── */

export function StepCarousel({ name, slides, startDelayMs = 0, testID }: {
  /** "Megyprints Albums", for the dots' and Pause's names. */
  name: string;
  /** The slides; each gets `go(k)` for an in-slide "Here's how ›". */
  slides: (go: (k: number) => void) => ReactNode[];
  /** The first advance waits this much longer (the half beat). */
  startDelayMs?: number;
  testID: string;
}) {
  const { still } = useHomeMotion();
  const t = useType();
  const [width, setWidth] = useState(0);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  // A finger on the slides holds the clock.
  const [held, setHeld] = useState(false);
  // A jump restarts the clock (no half beat after the first run).
  const [epoch, setEpoch] = useState(0);
  const scroller = useRef<ScrollViewInstance>(null);
  const go = useCallback((k: number) => { setI(k); setEpoch((e) => e + 1); }, []);
  const list = slides(go);
  const n = list.length;

  useEffect(() => {
    if (paused || held || n < 2) return undefined;
    let tick: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      setI((k) => (k + 1) % n);
      tick = setInterval(() => setI((k) => (k + 1) % n), SLIDE_MS);
    }, SLIDE_MS + (epoch === 0 ? startDelayMs : 0));
    return () => { clearTimeout(first); if (tick) clearInterval(tick); };
  }, [paused, held, n, epoch, startDelayMs]);

  useEffect(() => {
    if (width > 0) scroller.current?.scrollTo({ x: i * width, animated: !still });
  }, [i, width, still]);

  return (
    <View testID={testID} accessibilityLabel={`${name}, how it works`}>
      <View style={styles.region} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        <ScrollView ref={scroller} horizontal pagingEnabled showsHorizontalScrollIndicator={false} testID={`${testID}-track`}
          onScrollBeginDrag={() => setHeld(true)}
          onScrollEndDrag={() => setHeld(false)}
          onMomentumScrollEnd={(e) => {
            const k = width > 0 ? Math.round(e.nativeEvent.contentOffset.x / width) : i;
            if (k !== i && k >= 0 && k < n) go(k);
          }}>
          {list.map((slide, k) => (
            <View key={k} style={{ width: width || undefined }} testID={`${testID}-slide-${k}`}
              accessibilityElementsHidden={k !== i} importantForAccessibility={k === i ? 'auto' : 'no-hide-descendants'}>
              {slide}
            </View>
          ))}
        </ScrollView>
      </View>
      <View style={styles.dots}>
        {list.map((_s, k) => (
          <Pressable key={k} onPress={() => go(k)} accessibilityRole="button" accessibilityLabel={HOME.slideOf(name, k, n)}
            accessibilityState={{ selected: k === i }} testID={`${testID}-dot-${k}`} hitSlop={4} style={styles.dotHit}>
            <View style={[styles.dot, k === i && styles.dotNow]} />
          </Pressable>
        ))}
        <Pressable onPress={() => setPaused((p) => !p)} accessibilityRole="button" testID={`${testID}-pause`}
          accessibilityLabel={paused ? HOME.playSlides(name) : HOME.pauseSlides(name)} style={styles.pause}>
          <Text style={[t.bodyBold, styles.pauseText]}>{paused ? HOME.play : HOME.pause}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ── Pieces of the scenes ─────────────────────────────────────────────── */

type Crop = { width: number; left: number; top: number };
/** The website's photos are 896 × 1200. */
const PHOTO_TALL = 1200 / 896;

/** The board's crop: region (x0, y0, w, h) of an 896-wide photo, to cover a W×H box. */
export function crop(W: number, H: number, x0: number, y0: number, w: number, h: number): Crop {
  const s = Math.max(W / w, H / h);
  return { width: 896 * s, left: -(x0 * s) - (w * s - W) / 2, top: -(y0 * s) - (h * s - H) / 2 };
}

/** The website's photo shadows: a 3 px white edge and a soft drop. */
const RING = '0 0 0 3px #FFFFFF, 0 8px 16px rgba(45, 30, 20, 0.3)';
const RING_DEEP = '0 0 0 3px #FFFFFF, 0 10px 20px rgba(45, 30, 20, 0.35)';

function Photo({ src, w, h, c, radius = 0, shadow, style }: {
  src: ImageSourcePropType; w: number; h: number; c: Crop; radius?: number; shadow?: string; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ width: w, height: h, borderRadius: radius }, shadow ? { boxShadow: shadow } : null, style]}>
      <View style={{ width: w, height: h, borderRadius: radius, overflow: 'hidden' }}>
        <Image source={src} style={{ position: 'absolute', width: c.width, height: c.width * PHOTO_TALL, left: c.left, top: c.top }} />
      </View>
    </View>
  );
}

/** The website's decorative QR: finders and noise. It looks like a QR; it isn't one. */
export function qrCells(seed: number): boolean[][] {
  const n = 21;
  let x = seed;
  const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  const finders = [[0, 0], [0, n - 7], [n - 7, 0]];
  const rows: boolean[][] = [];
  for (let r = 0; r < n; r++) {
    const row: boolean[] = [];
    for (let col = 0; col < n; col++) {
      let v = -1;
      for (const [fr, fc] of finders) {
        if (r >= fr - 1 && r <= fr + 7 && col >= fc - 1 && col <= fc + 7) {
          const rr = r - fr, cc = col - fc;
          if (rr < 0 || rr > 6 || cc < 0 || cc > 6) v = 0;
          else if (rr === 0 || rr === 6 || cc === 0 || cc === 6) v = 1;
          else v = rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4 ? 1 : 0;
        }
      }
      if (v === -1) v = r === 6 || col === 6 ? ((r + col) % 2 === 0 ? 1 : 0) : (rnd() < 0.5 ? 1 : 0);
      row.push(v === 1);
    }
    rows.push(row);
  }
  return rows;
}

/** Each row's dark runs, [row, first column, length]: a few views, not 441. */
function darkRuns(seed: number): [number, number, number][] {
  const runs: [number, number, number][] = [];
  qrCells(seed).forEach((row, r) => {
    let start = -1;
    row.forEach((dark, c) => {
      if (dark && start < 0) start = c;
      if ((!dark || c === row.length - 1) && start >= 0) {
        runs.push([r, start, (dark ? c + 1 : c) - start]);
        start = -1;
      }
    });
  });
  return runs;
}

function FakeQr({ seed, cell }: { seed: number; cell: number }) {
  const runs = useMemo(() => darkRuns(seed), [seed]);
  return (
    <View {...hidden} style={{ width: 21 * cell, height: 21 * cell, backgroundColor: '#FFFFFF' }}>
      {runs.map(([r, c, len], k) => (
        <View key={k} style={{ position: 'absolute', left: c * cell, top: r * cell, width: len * cell, height: cell, backgroundColor: INK.dark }} />
      ))}
    </View>
  );
}

function Twinkle({ x, y, size, color }: { x: number; y: number; size: number; color: string }) {
  const m = useHomeMotion();
  return (
    <Animated.View style={[{ position: 'absolute', left: x, top: y }, m.twinkle]}>
      <Sparkle size={size} color={color} />
    </Animated.View>
  );
}

function TruckChip({ label, x, y }: { label: string; x: number; y: number }) {
  const m = useHomeMotion();
  const t = useType();
  // On one line, past the picture's edge if it must (the website's nowrap):
  // a wide, see-through holder lets the chip be as wide as its words.
  return (
    <View style={[styles.truckHolder, { left: x, top: y }]}>
      <View style={styles.truckChip}>
        <Animated.View style={m.drive}><Truck color={INK.peach} /></Animated.View>
        <Text style={[t.bodyBold, styles.truckText]} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

/** A phone: dark frame, white screen. */
function Phone({ w, h, children }: { w: number; h: number; children: ReactNode }) {
  return (
    <View style={[styles.phone, { width: w, height: h }]}>
      <View style={styles.phoneScreen}>{children}</View>
    </View>
  );
}

/** A slide: 150 px of warm paper, a big soft circle behind the picture. */
function Scene({ gold = false, circle = 'left', children }: { gold?: boolean; circle?: 'left' | 'right'; children: ReactNode }) {
  return (
    <View style={[styles.scene, { backgroundColor: gold ? INK.goldPaper : INK.paper }]}>
      <View {...hidden} style={[styles.circle, circle === 'left' ? styles.circleLeft : styles.circleRight, { backgroundColor: gold ? INK.goldCircle : INK.circle }]} />
      {children}
    </View>
  );
}

/** The 150 × 150 picture beside a step's words. */
function Picture({ children }: { children: ReactNode }) {
  return <View {...hidden} style={styles.picture}>{children}</View>;
}

/** "STEP 1", its title and its line, beside the picture. */
function StepText({ n, step, gold = false }: { n: number; step: HomeStep; gold?: boolean }) {
  const t = useType();
  return (
    <View style={styles.stepText}>
      <View style={styles.stepRow}>
        <Text style={[t.bodyBold, styles.stepWord, { color: gold ? INK.goldLabel : INK.label }]}>STEP</Text>
        <Text style={[t.display, styles.stepNumber, { color: gold ? INK.goldNumber : INK.peach }]}>{n}</Text>
      </View>
      <Text style={[t.bodyBold, styles.stepTitle]}>{step.title}</Text>
      <Text style={[t.body, styles.stepDesc]}>{step.desc}</Text>
    </View>
  );
}

/** The fan of photos on the first slide: x, y, turn, crop. */
type Fanned = [number, number, number, Crop];
const ALBUM_FAN: Fanned[] = [[6, 46, -14, { width: 349.6, left: -252, top: -172.5 }], [70, 46, 13, { width: 362.9, left: -196.2, top: -153.9 }], [38, 30, -2, { width: 229.4, left: -52.4, top: -115.2 }]];
const EVENT_FAN: Fanned[] = [[4, 50, -15, { width: 401, left: -216.5, top: -270.8 }], [72, 48, 14, { width: 372.4, left: -267.7, top: -270.1 }], [38, 28, -2, { width: 362.9, left: -196.2, top: -153.9 }]];
/** Where each fanned photo's little phone sits (Events). */
const FAN_PHONES: ViewStyle[] = [{ left: -6, top: -8 }, { right: -6, top: -8 }, { left: 19, top: -14 }];

/** The hook slide: the card's line and "Here's how ›", a fan of photos. */
function HookSlide({ text, how, onHow, phones = false, testID }: { text: string; how: string; onHow: () => void; phones?: boolean; testID: string }) {
  const t = useType();
  const m = useHomeMotion();
  return (
    <Scene circle="right">
      <View style={styles.hookText}>
        <Text style={[t.body, styles.hookLine]}>{text}</Text>
        <Pressable onPress={onHow} accessibilityRole="button" testID={testID} hitSlop={8}>
          <Text style={[t.bodyBold, styles.how]}>{how} ›</Text>
        </Pressable>
      </View>
      <View {...hidden} style={styles.fan}>
        <Animated.View style={[StyleSheet.absoluteFill, m.float]}>
          {(phones ? EVENT_FAN : ALBUM_FAN).map(([x, y, rot, c], k) => (
            <View key={k} style={{ position: 'absolute', left: x, top: y, transform: [{ rotate: `${rot}deg` }] }}>
              <Photo src={FAMILY} w={54} h={64} c={c} radius={3} shadow={k === 2 ? RING_DEEP : RING} />
              {phones && <View style={[styles.fanPhone, FAN_PHONES[k]]} />}
            </View>
          ))}
        </Animated.View>
      </View>
    </Scene>
  );
}

const FAMILY_REGIONS: [number, number, number, number][] = [
  [472, 380, 158, 158], [470, 605, 148, 143], [634, 650, 150, 154],
  [200, 450, 220, 250], [642, 442, 146, 164], [160, 380, 270, 440],
];
const region = (k: number) => FAMILY_REGIONS[k % FAMILY_REGIONS.length];

/* ── The Albums slides ────────────────────────────────────────────────── */

function AlbumsUpload() {
  const t = useType();
  const m = useHomeMotion();
  return (
    <Scene>
      <Picture>
        <View style={{ position: 'absolute', left: 38, top: 12, transform: [{ rotate: '-5deg' }] }}>
          <Animated.View style={m.float}>
            <Phone w={70} h={126}>
              <View style={styles.phoneGrid}>
                {Array.from({ length: 12 }, (_x, k) => {
                  const r = region(k);
                  return <Photo key={k} src={FAMILY} w={17} h={20} c={crop(17, 20, r[0], r[1], r[2], r[3])} radius={2} />;
                })}
              </View>
            </Phone>
          </Animated.View>
        </View>
        <View style={styles.uploadCircle}>
          <Animated.View style={m.rise}><ArrowUp size={18} color="#FFFFFF" /></Animated.View>
        </View>
        <View style={styles.fortyChip}><Text style={[t.bodyBold, styles.fortyText]}>40+</Text></View>
      </Picture>
      <StepText n={1} step={ALBUMS_CARD.steps[0]} />
    </Scene>
  );
}

function AlbumsDesign() {
  const m = useHomeMotion();
  return (
    <Scene>
      <Picture>
        <View style={{ position: 'absolute', left: 16, top: 18, transform: [{ rotate: '3deg' }] }}>
          <Photo src={FAMILY} w={128} h={110} c={{ width: 156.4, left: -13.7, top: -46.3 }} radius={8} shadow="0 0 0 3px #FFFFFF, 0 14px 26px rgba(45, 30, 20, 0.32)" />
        </View>
        <Animated.View style={[{ position: 'absolute', left: -4, top: 86 }, m.float]}>
          <Image source={MEGY} style={styles.megy} />
        </Animated.View>
        <Twinkle x={126} y={6} size={22} color={INK.sparkleGold} />
      </Picture>
      <StepText n={2} step={ALBUMS_CARD.steps[1]} />
    </Scene>
  );
}

/** The video memory always shines: the editor's own gold button. */
function AlbumsVideo() {
  const t = useType();
  const m = useHomeMotion();
  return (
    <Scene gold>
      <Picture>
        <Animated.View style={[{ position: 'absolute', left: 16, top: 8 }, m.float]}>
          <View style={{ transform: [{ rotate: '-3deg' }] }}>
            <Photo src={FAMILY} w={104} h={88} c={crop(104, 88, 180, 440, 250, 200)} radius={3} shadow="0 14px 24px rgba(45, 30, 20, 0.32)" />
            <Animated.View style={[styles.qrChip, m.pop]}><FakeQr seed={31} cell={1} /></Animated.View>
          </View>
        </Animated.View>
        <View style={styles.shine}>
          <VideoMark color={GOLD.text} size={0.85} />
          <Text style={[t.bodyBold, styles.shineText]}>Add a video memory</Text>
        </View>
      </Picture>
      <StepText n={3} step={ALBUMS_CARD.steps[2]} gold />
    </Scene>
  );
}

function AlbumsShip() {
  const m = useHomeMotion();
  return (
    <Scene>
      <Picture>
        <Animated.View style={[{ position: 'absolute', left: 22, top: 12 }, m.float]}>
          <Photo src={TRAVEL} w={106} h={112} c={{ width: 162.3, left: -40.8, top: -56.5 }} radius={8} shadow="0 16px 28px rgba(45, 30, 20, 0.35)" style={{ transform: [{ rotate: '-4deg' }] }} />
        </Animated.View>
        <TruckChip label="To your door" x={58} y={116} />
      </Picture>
      <StepText n={4} step={ALBUMS_CARD.steps[3]} />
    </Scene>
  );
}

/* ── The Events slides ────────────────────────────────────────────────── */

function EventsBook() {
  const t = useType();
  const m = useHomeMotion();
  return (
    <Scene>
      <Picture>
        <View style={{ position: 'absolute', left: 40, top: 12, transform: [{ rotate: '-6deg' }] }}>
          <Animated.View style={m.float}>
            <Phone w={70} h={126}>
              <View style={styles.eventScreen}>
                <Text style={[t.displayItalic, styles.couple]}>{'Ana & Ben'}</Text>
                <FakeQr seed={7} cell={2} />
                <View style={styles.readyChip}>
                  <Tick size={7} color="#2E7D4A" stroke={1.4} />
                  <Text style={[t.bodyBold, styles.readyText]}>QR ready</Text>
                </View>
              </View>
            </Phone>
          </Animated.View>
        </View>
        <Twinkle x={112} y={6} size={22} color={INK.sparkleGold} />
        <Twinkle x={24} y={104} size={14} color={INK.peach} />
      </Picture>
      <StepText n={1} step={EVENTS_CARD.steps[0]} />
    </Scene>
  );
}

/** The four corners of the camera's frame on the scanning phone. */
const CORNERS: ViewStyle[] = [
  { left: 1, top: 1, borderTopWidth: 2.4, borderLeftWidth: 2.4 },
  { left: 27, top: 1, borderTopWidth: 2.4, borderRightWidth: 2.4 },
  { left: 27, top: 37, borderBottomWidth: 2.4, borderRightWidth: 2.4 },
  { left: 1, top: 37, borderBottomWidth: 2.4, borderLeftWidth: 2.4 },
];

function EventsScan() {
  const t = useType();
  const m = useHomeMotion();
  return (
    <Scene>
      <Picture>
        <View style={styles.table} />
        <View style={styles.tableCard}>
          <FakeQr seed={23} cell={2} />
          <Text style={[t.bodyBold, styles.tableText]}>TABLE 7</Text>
        </View>
        <View style={{ position: 'absolute', left: 80, top: 10, transform: [{ rotate: '9deg' }] }}>
          <View style={styles.scanPhone}>
            <View style={styles.scanScreen}>
              <View style={styles.scanQr}><FakeQr seed={23} cell={1} /></View>
              <View style={styles.scanFrame}>
                {CORNERS.map((c, k) => <View key={k} style={[styles.corner, c]} />)}
              </View>
              <Animated.View style={[styles.scanLine, m.scan]} />
            </View>
          </View>
        </View>
      </Picture>
      <StepText n={2} step={EVENTS_CARD.steps[1]} />
    </Scene>
  );
}

const GUEST_PHONES: [number, number, number][] = [[4, 8, 0], [22, 54, 3], [4, 100, 2]];

function EventsCollect() {
  const t = useType();
  const m = useHomeMotion();
  return (
    <Scene>
      <Picture>
        {GUEST_PHONES.map(([x, y, k]) => {
          const r = region(k);
          return (
            <View key={k} style={[styles.guestPhone, { left: x, top: y }]}>
              <Photo src={FAMILY} w={26} h={40} c={crop(26, 40, r[0], r[1], r[2], r[3])} radius={5} />
            </View>
          );
        })}
        <View style={styles.album}>
          <View style={styles.albumSpine} />
          <Text style={[t.displayItalicLight, styles.albumTitle]}>Our album</Text>
        </View>
        <View style={{ position: 'absolute', left: 86, top: 30, transformOrigin: 'top left', transform: [{ rotate: '-8deg' }, { scale: 0.75 }] }}>
          <Photo src={FAMILY} w={54} h={64} c={{ width: 349.6, left: -252, top: -172.5 }} radius={3} shadow={RING} />
        </View>
        <Animated.View style={[{ position: 'absolute', left: 92, top: 26, transformOrigin: 'top left' }, m.fly]}>
          <Photo src={FAMILY} w={54} h={64} c={{ width: 401, left: -216.5, top: -270.8 }} radius={3} shadow={RING} />
        </Animated.View>
      </Picture>
      <StepText n={3} step={EVENTS_CARD.steps[2]} />
    </Scene>
  );
}

function EventsPrint() {
  const m = useHomeMotion();
  return (
    <Scene>
      <Picture>
        <Animated.View style={[{ position: 'absolute', left: 18, top: 12 }, m.float]}>
          <Photo src={WEDDING} w={112} h={112} c={{ width: 154.4, left: -21.6, top: -46.6 }} radius={8} shadow="0 16px 28px rgba(45, 30, 20, 0.35)" style={{ transform: [{ rotate: '-3deg' }] }} />
        </Animated.View>
        <Animated.View style={[styles.doneBadge, m.pop]}><Tick size={15} color="#FFFFFF" stroke={2.6} /></Animated.View>
        <TruckChip label="On its way" x={56} y={116} />
      </Picture>
      <StepText n={4} step={EVENTS_CARD.steps[3]} />
    </Scene>
  );
}

/* ── The cards ────────────────────────────────────────────────────────── */

function CardShell({ children, testID }: { children: ReactNode; testID: string }) {
  return <View style={styles.card} testID={testID}>{children}</View>;
}

/** The Albums card. Its button(s) below the slides come from the start screen. */
export function AlbumsCard({ children }: { children: ReactNode }) {
  const t = useType();
  return (
    <CardShell testID="home-albums-card">
      <Text style={[t.bodyBold, styles.label]}>{ALBUMS_CARD.label.toUpperCase()}</Text>
      <Text style={[t.display, styles.title]} accessibilityRole="header">{ALBUMS_CARD.title}</Text>
      <StepCarousel name={ALBUMS_CARD.label} testID="home-albums-slides" startDelayMs={SLIDE_MS / 2} slides={(go) => [
        <HookSlide key="hook" text={ALBUMS_CARD.hook} how={ALBUMS_CARD.how} onHow={() => go(1)} testID="home-albums-how" />,
        <AlbumsUpload key="1" />,
        <AlbumsDesign key="2" />,
        <AlbumsVideo key="3" />,
        <AlbumsShip key="4" />,
      ]} />
      <View style={styles.cardButtons}>{children}</View>
    </CardShell>
  );
}

/** "Start Creating": the one filled button on the screen. */
export function StartCreating({ label = ALBUMS_CARD.cta, onPress, testID, sparkle = true }: { label?: string; onPress: () => void; testID: string; sparkle?: boolean }) {
  const t = useType();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID}
      style={({ pressed }) => [styles.start, pressed && styles.pressed]}>
      {sparkle && <Sparkle size={17} color="#FFFFFF" />}
      <Text style={[t.bodyBold, styles.startText]}>{label}</Text>
    </Pressable>
  );
}

/** An outlined button in the cards ("Book your event", "Start a new album"). */
export function CardButton({ label, onPress, testID, icon, tall = true }: { label: string; onPress: () => void; testID: string; icon?: ReactNode; tall?: boolean }) {
  const t = useType();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID}
      style={({ pressed }) => [styles.outlined, !tall && styles.outlinedShort, pressed && styles.pressed]}>
      {icon}
      <Text style={[t.bodyBold, styles.outlinedText, !tall && styles.outlinedTextShort]}>{label}</Text>
    </Pressable>
  );
}

export function EventsCard({ onBook }: { onBook: () => void }) {
  const t = useType();
  return (
    <CardShell testID="home-events-card">
      <View style={styles.labelRow}>
        <View style={styles.newBadge}><Text style={[t.bodyBold, styles.newText]}>{HOME.newBadge.toUpperCase()}</Text></View>
        <Text style={[t.bodyBold, styles.label]}>{EVENTS_CARD.label.toUpperCase()}</Text>
      </View>
      <Text style={[t.display, styles.title]} accessibilityRole="header">{EVENTS_CARD.title}</Text>
      <StepCarousel name={EVENTS_CARD.label} testID="home-events-slides" slides={(go) => [
        <HookSlide key="hook" text={EVENTS_CARD.body} how={EVENTS_CARD.how} onHow={() => go(1)} phones testID="home-events-how" />,
        <EventsBook key="1" />,
        <EventsScan key="2" />,
        <EventsCollect key="3" />,
        <EventsPrint key="4" />,
      ]} />
      <View style={styles.cardButtons}>
        <Text style={[t.body, styles.who]}>{EVENTS_CARD.who}</Text>
        <CardButton label={`${EVENTS_CARD.cta} ›`} onPress={onBook} testID="go-events" icon={<Calendar size={18} color={INK.label} />} />
      </View>
    </CardShell>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 16, paddingBottom: 14, gap: 8, boxShadow: '0 16px 40px rgba(0, 0, 0, 0.2)' },
  label: { fontSize: 11, letterSpacing: 1.1, color: INK.label },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  newBadge: { backgroundColor: INK.peach, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  newText: { fontSize: 11, letterSpacing: 0.9, color: '#FFFFFF' },
  title: { fontSize: 22, lineHeight: 26.4, color: INK.dark },
  cardButtons: { gap: 8, marginTop: 2 },
  who: { fontSize: 12, lineHeight: 17, textAlign: 'center', color: INK.soft },

  region: { borderRadius: 16, overflow: 'hidden' },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 32, marginTop: 4 },
  dotHit: { paddingHorizontal: 3, paddingVertical: 9 },
  dot: { width: 8, height: 10, borderRadius: 5, backgroundColor: '#E6D3C8' },
  dotNow: { width: 22, backgroundColor: INK.peach },
  pause: { marginLeft: 8, height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1.5, borderColor: '#E6E2DD', backgroundColor: '#FFFFFF', justifyContent: 'center' },
  pauseText: { fontSize: 12, color: INK.body },

  scene: { height: 150, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  circle: { position: 'absolute' },
  circleLeft: { left: -36, top: -24, width: 196, height: 196, borderRadius: 98 },
  circleRight: { right: -40, top: -30, width: 200, height: 200, borderRadius: 100 },
  picture: { width: 150, height: 150 },
  stepText: { flex: 1, minWidth: 0, gap: 3, paddingRight: 14 },
  stepRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  stepWord: { fontSize: 11, letterSpacing: 1.3 },
  stepNumber: { fontSize: 34, lineHeight: 38 },
  stepTitle: { fontSize: 16, lineHeight: 20, color: INK.dark },
  stepDesc: { fontSize: 13, lineHeight: 18, color: INK.body },

  hookText: { flex: 1, minWidth: 0, gap: 6, paddingLeft: 14 },
  hookLine: { fontSize: 13, lineHeight: 19, color: INK.body },
  how: { fontSize: 13, color: INK.label },
  fan: { marginLeft: 10, width: 136, height: 150 },
  fanPhone: { position: 'absolute', width: 16, height: 24, borderRadius: 4, borderWidth: 2, borderColor: INK.dark, backgroundColor: '#FFFFFF' },

  phone: { borderRadius: 14, backgroundColor: INK.dark, padding: 4, boxShadow: '0 14px 26px rgba(45, 30, 20, 0.3)' },
  phoneScreen: { flex: 1, borderRadius: 11, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  phoneGrid: { width: 55, marginLeft: 4, paddingTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  uploadCircle: { position: 'absolute', left: 104, top: 10, width: 34, height: 34, borderRadius: 17, overflow: 'hidden', backgroundColor: INK.peach, alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(184, 92, 56, 0.4)' },
  fortyChip: { position: 'absolute', left: 96, top: 50, borderRadius: 999, backgroundColor: '#FFFFFF', paddingHorizontal: 7, paddingVertical: 2, boxShadow: '0 3px 8px rgba(0, 0, 0, 0.15)' },
  fortyText: { fontSize: 10, color: INK.label },
  megy: { width: 64, height: 64, filter: 'drop-shadow(0px 6px 8px rgba(45, 30, 20, 0.25))' },
  qrChip: { position: 'absolute', right: 5, bottom: 5, borderRadius: 2, backgroundColor: '#FFFFFF', padding: 2, boxShadow: '0 0 10px rgba(226, 181, 71, 0.9)' },
  shine: { position: 'absolute', left: 4, top: 106, width: 142, height: 34, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: GOLD.base, backgroundImage: GOLD.gradient, boxShadow: GOLD.shadow },
  shineText: { fontSize: 11, color: GOLD.text },
  truckHolder: { position: 'absolute', width: 160, flexDirection: 'row' },
  truckChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, backgroundColor: '#FFFFFF', paddingHorizontal: 9, paddingVertical: 4, boxShadow: '0 4px 10px rgba(0, 0, 0, 0.16)' },
  truckText: { fontSize: 10, color: INK.body },

  eventScreen: { alignItems: 'center', gap: 6, paddingTop: 12 },
  couple: { fontSize: 9, color: INK.peach },
  readyChip: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 999, backgroundColor: '#E5F1E9', paddingHorizontal: 5, paddingVertical: 2 },
  readyText: { fontSize: 7, color: '#2E7D4A' },
  table: { position: 'absolute', left: 4, top: 112, width: 132, height: 24, borderRadius: 12, backgroundColor: '#E9D2C3' },
  tableCard: { position: 'absolute', left: 14, top: 48, width: 56, height: 72, borderRadius: 5, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 5, boxShadow: '0 10px 18px rgba(45, 30, 20, 0.25)' },
  tableText: { fontSize: 7, letterSpacing: 0.84, color: INK.label },
  scanPhone: { width: 60, height: 108, borderRadius: 13, backgroundColor: INK.dark, padding: 4, boxShadow: '0 14px 26px rgba(45, 30, 20, 0.32)' },
  scanScreen: { width: 52, height: 100, borderRadius: 10, overflow: 'hidden', backgroundColor: '#3B3633', alignItems: 'center', justifyContent: 'center' },
  scanQr: { borderRadius: 2, backgroundColor: '#FFFFFF', padding: 3 },
  scanFrame: { position: 'absolute', left: 8, top: 26, width: 36, height: 46 },
  corner: { position: 'absolute', width: 8, height: 8, borderColor: '#FFFFFF' },
  scanLine: { position: 'absolute', left: 6, right: 6, top: 0, height: 2, borderRadius: 1, backgroundColor: '#E07A52', boxShadow: '0 0 8px 2px rgba(224, 122, 82, 0.7)' },
  guestPhone: { position: 'absolute', width: 30, height: 44, borderRadius: 7, backgroundColor: INK.dark, padding: 2, boxShadow: '0 6px 12px rgba(45, 30, 20, 0.25)' },
  album: { position: 'absolute', left: 76, top: 52, width: 66, height: 80, borderTopLeftRadius: 4, borderBottomLeftRadius: 4, borderTopRightRadius: 7, borderBottomRightRadius: 7, backgroundColor: INK.peach, boxShadow: '0 14px 24px rgba(45, 30, 20, 0.32)' },
  albumSpine: { position: 'absolute', left: 6, top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(0, 0, 0, 0.2)' },
  albumTitle: { position: 'absolute', left: 14, right: 6, bottom: 10, textAlign: 'center', fontSize: 9, color: INK.paper },
  doneBadge: { position: 'absolute', left: 8, top: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: INK.peach, alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(184, 92, 56, 0.45)' },

  start: { height: 52, borderRadius: 14, backgroundColor: INK.peach, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 6px 16px rgba(184, 92, 56, 0.3)' },
  startText: { fontSize: 16, color: '#FFFFFF' },
  outlined: { height: 50, borderRadius: 14, borderWidth: 2, borderColor: INK.peach, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  outlinedShort: { height: 44 },
  outlinedText: { fontSize: 16, color: INK.label },
  outlinedTextShort: { fontSize: 15 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
});
