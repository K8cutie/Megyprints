/* ══════════════════════════════════════════════════════════════════════════
   THE EDITOR'S PARTS: how photos, words and the cover plug into the
   "Edit pages" screen without touching it.

   The screen (EditPagesScreen.tsx) owns the page, the taps, the selection,
   undo and the page turn. Everything a customer can DO to a page comes from
   a part, each in its own folder, each registering itself once from its
   index.ts (src/editor/parts.ts imports them all):

     src/editor/photos   photos, layouts, pages      (part 1)
     src/editor/text     words, fonts, colours, quotes, page colours (part 2)
     src/editor/cover    the cover editor            (part 3)
     src/editor/core     what the screen itself offers (retired graphics)

   A part adds any of:
     • taps:            what a tap on an element does (open a sheet, …);
     • addChoices:      lines in "Add to this box" for an empty frame or box
                        (the website's SlotChooser: Add Photo, Add Quote, Your Text);
     • selectedActions: buttons under the page for the selected element;
     • tools:           buttons in the bar under the page (the website's
                        Add photos, Change layout, Page colour);
     • sheets:          what opens over the editor (ctx.openSheet('photos:replace'));
     • overlays:        something drawn over the page (move and zoom handles);
     • stripStart:      a tile before page 1 in the page strip (Cover);
     • banners:         a line over the page (the website's "This page is
                        yours · Megy, fix this page", "5 pages are blank").

   Order: the website's own, from ORDER below (Add photos, Change layout, Page
   colour; Add Photo, Add Quote, Your Text), so parts built apart line up.
   Words: each part keeps its own in its folder (photos/words.ts …), held to
   the website's source by its own test, so no two parts edit one file.

   Every change to the album goes through the website's own useBuilderState
   (ctx.builder): a part never edits a page object itself, so undo, saving
   and the account work as on the website.
   ══════════════════════════════════════════════════════════════════════════ */
import type { ReactElement } from 'react';
import type { AlbumPage } from '@web/pages/builder/types';
import type { BuilderActions } from '@web/pages/builder/useBuilderState';
import type { AppPlatform } from '../builder/appPlatform';
import type { PageText } from '../render/pageText';
import { EMPTY_KINDS, type Target, type TargetKind } from './hitTest';

/** What a part is handed: the album, the page on screen, and the screen's own pieces. */
export interface EditorContext {
  /** The website's album builder (shared): EVERY edit goes through it. */
  builder: BuilderActions;
  platform: AppPlatform;
  /** The page fonts (measuring words), once loaded. */
  text: PageText | null;
  /** The page on screen (0-based: builder.currentPageIndex). */
  pageIndex: number;
  page: AlbumPage;
  /** Everything a tap can hit on it (hitTest.ts), bottom first. */
  targets: readonly Target[];
  /** The selected element on this page, or null. */
  selected: Target | null;
  select(target: Target | null): void;
  /** Opens a sheet by its full id ('<part id>:<sheet name>'). One at a time. */
  openSheet(id: string, params?: unknown): void;
  closeSheet(): void;
  /** A short line over the page for a moment (the website's guard line). */
  say(message: string): void;
}

export interface TapRule {
  kinds: readonly TargetKind[];
  /** Lower goes first (default 100). */
  order?: number;
  /** True when it took the tap. False hands it on to the next rule, and in
   *  the end to the screen: it selects the element, and an empty frame or
   *  box opens "Add to this box" when a part offers something for it. */
  onTap(target: Target, ctx: EditorContext): boolean;
}

export interface AddChoice {
  id: string;
  /** The website's words: 'Add Photo', 'Add Quote', 'Your Text'. */
  label: string;
  desc: string;
  /** The one word in the empty box's "Click to add:" list ('Photo', 'Quote',
   *  'Text'); with id 'quote' or 'text' it also lets a box Megy dealt that
   *  kind show its invitation (ROLL_LABELS). */
  short: string;
  kinds: readonly ('emptySlot' | 'emptyBox')[];
  /** Lower comes first (website: photo 10, quote 20, text 30). */
  order?: number;
  onPick(target: Target, ctx: EditorContext): void;
}

export interface SelectedAction {
  id: string;
  label: string;
  kinds: readonly TargetKind[];
  order?: number;
  /** A button that takes something off the page. */
  danger?: boolean;
  /** Shown only when this says so (default: always, for its kinds). */
  shown?(target: Target, ctx: EditorContext): boolean;
  onPress(target: Target, ctx: EditorContext): void;
}

export interface Tool {
  id: string;
  label: string;
  order?: number;
  /** A row of its own under the tools (the website's "Add memory video"). */
  wide?: boolean;
  shown?(ctx: EditorContext): boolean;
  onPress(ctx: EditorContext): void;
}

export interface SheetProps<P = unknown> {
  ctx: EditorContext;
  params: P;
  close(): void;
}
// A sheet takes its own params type; the registry holds them all.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SheetComponent = (props: SheetProps<any>) => ReactElement | null;

export interface OverlayProps {
  ctx: EditorContext;
  /** Screen px per page px (the page's print px). */
  scale: number;
  /** The page as shown, screen px. */
  width: number;
  height: number;
}
/** Drawn over the page, inside its box. Its views get the touches they claim;
 *  everywhere else a touch goes to the page (taps, page-turn swipes). */
export type OverlayComponent = (props: OverlayProps) => ReactElement | null;

export interface StripTile {
  id: string;
  label: string;
  order?: number;
  onPress(ctx: EditorContext): void;
}

/** A line over the page, under "Page 3 of 40" (the website's studio line,
 *  the blank pages reminder). Its component returns null when it has
 *  nothing to say. */
export interface Banner {
  id: string;
  order?: number;
  Component: (props: { ctx: EditorContext }) => ReactElement | null;
}

export interface EditorPart {
  /** 'photos', 'text', 'cover', 'core'. Sheets are named '<id>:<name>'. */
  id: string;
  taps?: TapRule[];
  addChoices?: AddChoice[];
  selectedActions?: SelectedAction[];
  tools?: Tool[];
  sheets?: Record<string, SheetComponent>;
  overlays?: OverlayComponent[];
  stripStart?: StripTile[];
  banners?: Banner[];
}

/** The website's order for what the parts add, so they line up when built
 *  apart (MobileReview's tool bar, SlotChooser's lines). Lower comes first. */
export const ORDER = {
  tools: { addPhotos: 10, changeLayout: 20, pageColour: 30, memoryVideo: 40 },
  addChoices: { photo: 10, quote: 20, text: 30 },
} as const;

const parts = new Map<string, EditorPart>();
let version = 0;
const listeners = new Set<() => void>();

/** Adds (or replaces, by id) a part. Returns how to take it out again (tests). */
export function registerEditorPart(part: EditorPart): () => void {
  parts.set(part.id, part);
  version++;
  listeners.forEach((l) => l());
  return () => {
    if (parts.get(part.id) !== part) return;
    parts.delete(part.id);
    version++;
    listeners.forEach((l) => l());
  };
}

/** Tests only: takes every part out but `keep` (by id) until the returned
 *  function puts them all back, so a test sees only the parts it registers
 *  and keeps passing whatever the part folders add. */
export function isolateRegistry(keep: readonly string[] = []): () => void {
  const saved = new Map(parts);
  for (const id of [...parts.keys()]) if (!keep.includes(id)) parts.delete(id);
  version++;
  listeners.forEach((l) => l());
  return () => {
    parts.clear();
    saved.forEach((p, id) => parts.set(id, p));
    version++;
    listeners.forEach((l) => l());
  };
}

/** Changes whenever a part comes or goes (for a screen that memoizes). */
export function registryVersion(): number {
  return version;
}
export function onRegistryChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function editorParts(): readonly EditorPart[] {
  return [...parts.values()];
}

const byOrder = <T extends { order?: number }>(a: T, b: T) => (a.order ?? 100) - (b.order ?? 100);

export function tapRulesFor(kind: TargetKind): TapRule[] {
  return editorParts().flatMap((p) => p.taps ?? []).filter((r) => r.kinds.includes(kind)).sort(byOrder);
}

export function addChoicesFor(kind: TargetKind): AddChoice[] {
  return editorParts().flatMap((p) => p.addChoices ?? []).filter((c) => (c.kinds as readonly TargetKind[]).includes(kind)).sort(byOrder);
}

export function selectedActionsFor(target: Target, ctx: EditorContext): SelectedAction[] {
  return editorParts().flatMap((p) => p.selectedActions ?? [])
    .filter((a) => a.kinds.includes(target.kind) && (a.shown ? a.shown(target, ctx) : true)).sort(byOrder);
}

export function toolsFor(ctx: EditorContext): Tool[] {
  return editorParts().flatMap((p) => p.tools ?? []).filter((t) => (t.shown ? t.shown(ctx) : true)).sort(byOrder);
}

export function stripTiles(): StripTile[] {
  return editorParts().flatMap((p) => p.stripStart ?? []).sort(byOrder);
}

export function overlayComponents(): OverlayComponent[] {
  return editorParts().flatMap((p) => p.overlays ?? []);
}

export function bannersFor(): Banner[] {
  return editorParts().flatMap((p) => p.banners ?? []).sort(byOrder);
}

/** A sheet by its full id ('photos:replace'), or null. */
export function sheetById(id: string): SheetComponent | null {
  const bar = id.indexOf(':');
  if (bar < 0) return null;
  return parts.get(id.slice(0, bar))?.sheets?.[id.slice(bar + 1)] ?? null;
}

/** The screen's own "Add to this box" sheet (core/AddToBoxSheet). */
export const ADD_TO_BOX_SHEET = 'core:add';

/** What a tap on `target` does: the parts' rules first, in order; then the
 *  screen's own: select it, and for an empty frame or box with something to
 *  offer, "Add to this box". Returns who took it ('select' = the screen). */
export function runTap(target: Target, ctx: EditorContext): string {
  for (const rule of tapRulesFor(target.kind)) {
    if (rule.onTap(target, ctx)) return 'rule';
  }
  ctx.select(target);
  if (EMPTY_KINDS.includes(target.kind) && addChoicesFor(target.kind).length > 0) {
    ctx.openSheet(ADD_TO_BOX_SHEET, { target });
    return 'add';
  }
  return 'select';
}
