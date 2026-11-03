/* ══════════════════════════════════════════════════════════════════════════
   VIDEO MEMORIES in the "Edit pages" screen (Phase 6), the website's way
   (BuilderEdit / MobileReview: VideoMemoryButton, AddQrModal):
     • "Add a video memory" under a single-photo page (canAddMemoryQr, the
       website's own rule): the sheet to pick a video and place the QR;
     • a tap on a page's QR, or on a QR in a caption box: "Change this
       memory" (a new video, the corner, Remove).
   The sheet is MemorySheet.tsx; the steps are memoryFlow.ts.
   ══════════════════════════════════════════════════════════════════════════ */
import { createElement } from 'react';
import { ORDER, registerEditorPart, type SheetComponent } from '../registry';
import { ADD_BUTTON } from './words';

registerEditorPart({
  id: 'memories',
  tools: [{
    id: 'memoryVideo',
    label: ADD_BUTTON,
    order: ORDER.tools.memoryVideo,
    wide: true,
    // The website's gold button (VideoMemoryButton): the album's best feature.
    look: 'gold',
    shown: (ctx) => ctx.builder.canAddMemoryQr,
    onPress: (ctx) => ctx.openSheet('memories:sheet', { mode: 'add' }),
  }],
  taps: [{
    kinds: ['slotQr', 'boxQr'],
    order: 50,
    onTap(target, ctx) {
      ctx.openSheet('memories:sheet', target.kind === 'slotQr' ? { mode: 'slot', slot: target.index } : { mode: 'box', box: target.index });
      return true;
    },
  }],
  sheets: {
    // Loaded when it opens: it brings the phone's video picker, player and
    // file store, which the rest of the editor never needs.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sheet: ((props) => createElement((require('./MemorySheet') as typeof import('./MemorySheet')).MemorySheet, props)) as SheetComponent,
  },
});
