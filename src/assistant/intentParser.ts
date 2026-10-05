/* ══════════════════════════════════════════════════════════════════════════
   Megy Assistant — Intent Parser
   Phase 1: Keyword + pattern matching for natural language commands
   ══════════════════════════════════════════════════════════════════════════ */

import type { AssistantIntentType, ParsedCommand } from './types';
import type { AlbumSizePreset, TemplateType } from '../pages/builder/types';

// ── A question is not a command ───────────────────────────────────────────
// "How do I edit the text box on this page?" ADDED a "Double click to edit"
// box that ran off the page: add_text's "text box" tied help's "how do i", and
// won the tie (1-star testers round 2, PI-5). A how / what / why / where
// question never changes the album — it may still move around (go to a page,
// preview) or be answered. A request phrased as a question ("can you add a
// text box?") is still a request.
export const INFO_QUESTION = /^(?:(?:hi|hello|hey|megy)[,!]?\s+)*(?:how (?:do|can|should|would|could) (?:i|we)|how to|how does|what(?:'s| is| are| does| do)|why|where (?:is|are|do|can)|when|is (?:it|there)|are there|does|do i)\b/;
const CHANGES_THE_ALBUM: AssistantIntentType[] = [
  'generate_album', 'shuffle_layout', 'regenerate_page', 'auto_fill', 'clear_slots',
  'add_page', 'delete_page', 'duplicate_page', 'change_size', 'change_template', 'apply_theme',
  'set_background', 'set_border', 'set_frame', 'add_text', 'update_text', 'delete_text',
  'reset', 'surprise_me', 'add_photos', 'set_photos_per_page', 'undo', 'redo',
];

// ── Keyword maps ──────────────────────────────────────────────────────────

const INTENT_KEYWORDS: Record<AssistantIntentType, string[]> = {
  // Rebuilding the whole album replaces every layout and edit, so it answers
  // only to asking for it. "auto fill" used to be here AND under auto_fill: the
  // tie went to this, and typing "auto fill" — the very command Megy suggests —
  // regenerated the album (1-star testers, 2026-10-04).
  generate_album: [
    'generate', 'generate album', 'auto layout', 'auto-layout', 'create album',
    'build album', 'make album', 'layout photos', 'auto generate',
    'distribute photos',
  ],
  shuffle_layout: [
    'shuffle', 'shuffle layout', 'randomize', 'mix up', 'new layout',
    'change layout', 'reshuffle', 'scramble', 'different layout',
  ],
  regenerate_page: [
    'regenerate', 'regenerate page', 'redo page', 'new template',
    'change template on this page', 'swap template', 'replace template',
  ],
  auto_fill: [
    'auto fill', 'autofill', 'auto-fill', 'fill slots', 'fill photos',
    'place photos', 'put photos', 'auto place', 'fill empty', 'fill the empty',
    'fill all', 'fill album', 'fill frames', 'fill the frames', 'populate',
  ],
  clear_slots: [
    'clear', 'clear slots', 'remove photos', 'empty slots', 'delete photos',
    'clear all', 'wipe', 'reset page', 'empty page',
  ],
  add_page: [
    'add page', 'new page', 'insert page', 'create page', 'duplicate page',
    'copy page', 'more pages',
  ],
  delete_page: [
    'delete page', 'remove page', 'trash page', 'get rid of page', 'drop page',
  ],
  duplicate_page: [
    'duplicate page', 'copy page', 'clone page', 'repeat page',
  ],
  go_to_page: [
    'go to page', 'jump to page', 'page ', 'navigate to',
    'take me to', 'show page', 'open page',
  ],
  next_page: [
    'next page', 'forward', 'next', 'go forward', 'page forward',
  ],
  prev_page: [
    'previous page', 'prev page', 'back', 'go back', 'last page',
    'page back', 'earlier page',
  ],
  change_size: [
    'change size', 'switch size', 'album size', 'resize', 'size',
    'make it bigger', 'make it smaller',
  ],
  change_template: [
    'change template', 'switch template', 'use template', 'pick template',
    'different template', 'template',
  ],
  apply_theme: [
    'theme', 'apply theme', 'switch theme', 'style', 'look', 'vibe',
    'make it ', 'set theme', 'change theme',
  ],
  set_background: [
    'background', 'change background', 'set background', 'bg', 'page color',
    'backdrop', 'wallpaper',
  ],
  set_border: [
    'border', 'set border', 'change border', 'photo border', 'border style',
    'border color', 'edge',
  ],
  set_frame: [
    'frame', 'set frame', 'change frame', 'photo frame', 'frame style',
    'matte', 'polaroid', 'shadowbox',
  ],
  add_text: [
    'add text', 'insert text', 'text box', 'caption', 'label',
    'write ', 'add words',
  ],
  update_text: [
    'edit text', 'change text', 'update text', 'edit caption',
  ],
  delete_text: [
    'delete text', 'remove text', 'delete caption', 'remove caption',
  ],
  preview_album: [
    'preview', 'preview album', 'see preview', 'show preview', 'finalize',
  ],
  status: [
    'status', 'overview', 'summary', 'how many', 'what do i have',
    'show me', 'album status', 'progress', 'where am i',
  ],
  help: [
    'help', 'how do i', 'how to', 'what can', 'commands', 'what do you do',
    'instructions', 'guide', 'tutorial', 'show me how',
  ],
  undo: [
    'undo', 'revert', 'go back', 'reverse', 'oops',
  ],
  redo: [
    'redo', 'restore', 'do again', 'bring back',
  ],
  reset: [
    'reset', 'start over', 'clear all', 'new album', 'fresh start',
    'restart', 'begin again',
  ],
  surprise_me: [
    'surprise me', 'surprise', 'lucky', 'random', 'i feel lucky',
    'make it random', 'do something', 'mix it up', 'shake it up',
    'im feeling lucky', 'i\'m feeling lucky', 'feeling lucky',
  ],
  add_photos: [
    'upload', 'add photo', 'add photos', 'upload photo', 'upload photos',
    'import photos', 'insert photo', 'choose photos',
  ],
  set_photos_per_page: [
    'photos per page', 'per page', 'density', 'photos a page', 'pictures per page',
  ],
  unknown: [],
};

// Album sizes we support. EVERY AlbumSizePreset must appear as a VALUE at
// least once — printParity.spec.ts walks ALBUM_SIZES and fails if a size has
// no alias (the 9x9 launch shipped without one, so Megy couldn't parse a 9×9
// request by chat until the structural audit caught it). Exported for that spec.
export const SIZE_ALIASES: Record<string, AlbumSizePreset> = {
  '6x6': '6x6', '6 by 6': '6x6', 'six by six': '6x6', 'square small': '6x6',
  '8x8': '8x8', '8 by 8': '8x8', 'eight by eight': '8x8', 'square': '8x8',
  '9x9': '9x9', '9 by 9': '9x9', 'nine by nine': '9x9', 'square large': '9x9',
  '6x4': '6x4', '6 by 4': '6x4', 'four by six': '6x4', 'landscape small': '6x4',
  '8x6': '8x6', '8 by 6': '8x6', 'eight by six': '8x6', 'landscape medium': '8x6',
  '6x8': '6x8', '6 by 8': '6x8', 'six by eight': '6x8', 'portrait small': '6x8',
  '11.5x8': '11.5x8', '11.5 by 8': '11.5x8', 'landscape large': '11.5x8',
  '8.5x11': '8.5x11', '8.5 by 11': '8.5x11', 'portrait': '8.5x11',
};

// Theme names
const THEME_ALIASES: Record<string, TemplateType> = {
  'wedding': 'wedding', 'bridal': 'wedding', 'marriage': 'wedding',
  'baby': 'baby', 'newborn': 'baby', 'nursery': 'baby',
  'birthday': 'birthday', 'party': 'birthday', 'celebration': 'birthday',
  'family': 'family', 'reunion': 'family', 'portrait': 'family',
  'graduation': 'graduation', 'graduate': 'graduation', 'school': 'graduation',
  'travel': 'travel', 'vacation': 'travel', 'trip': 'travel', 'holiday': 'travel',
  'minimalist': 'minimalist', 'minimal': 'minimalist', 'simple': 'minimalist', 'clean': 'minimalist',
  'kids': 'kids', 'children': 'kids', 'playful': 'kids',
  'vintage': 'vintage', 'retro': 'vintage', 'old': 'vintage', 'classic old': 'vintage',
  'classic': 'classic', 'elegant': 'classic', 'timeless': 'classic', 'sophisticated': 'classic',
  'baptism': 'baptism', 'christening': 'baptism',
};

// ── Parser ────────────────────────────────────────────────────────────────

export function parseIntent(message: string): ParsedCommand {
  const lower = message.toLowerCase().trim();
  const matchedKeywords: string[] = [];

  // Score each intent by keyword matches
  const scores: Record<AssistantIntentType, number> = {
    generate_album: 0, shuffle_layout: 0, regenerate_page: 0,
    auto_fill: 0, clear_slots: 0, add_page: 0, delete_page: 0, duplicate_page: 0,
    go_to_page: 0, next_page: 0, prev_page: 0,
    change_size: 0, change_template: 0, apply_theme: 0,
    set_background: 0, set_border: 0, set_frame: 0,
    add_text: 0, update_text: 0, delete_text: 0, preview_album: 0, status: 0,
    help: 0, undo: 0, redo: 0, reset: 0, surprise_me: 0,
    add_photos: 0, set_photos_per_page: 0, unknown: 0,
  };

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        scores[intent as AssistantIntentType] += kw.length; // weight by specificity
        matchedKeywords.push(kw);
      }
    }
  }

  // Special case: page number navigation
  const pageNumMatch = lower.match(/(?:page\s*|go\s*to\s*page\s*|jump\s*to\s*page\s*|show\s*page\s*|navigate\s*to\s*page\s*)(\d+)/);
  if (pageNumMatch) {
    scores.go_to_page += 100; // strong signal
    matchedKeywords.push(`page ${pageNumMatch[1]}`);
  }

  // Special case: just a number might be "go to page N"
  const standaloneNum = lower.match(/^\s*(\d+)\s*$/);
  if (standaloneNum) {
    scores.go_to_page += 50;
    matchedKeywords.push(`page ${standaloneNum[1]}`);
  }

  // Asking to FILL is never asking to clear: "fill the empty slots" matched
  // clear_slots' "empty slots" (one letter longer than "fill empty") and
  // cleared the page (1-star testers).
  if (/\bfill/.test(lower)) scores.clear_slots = 0;

  // Asking to redo the ALBUM is the whole album: "regenerate" alone (a page)
  // outscored "generate" (the album), so "regenerate my album" redid page 1
  // only (1-star testers, 2026-10-04). On a made album it asks first.
  if (/\b(re-?generate|re-?do|re-?build|re-?make|start over with)\b/.test(lower)
    && /\b(album|whole|everything|all (the |my )?pages|every page)\b/.test(lower)
    && !/\b(this|current|one) page\b/.test(lower)) {
    scores.generate_album += 100;
    scores.regenerate_page = 0;
    scores.add_photos = 0;
  }

  const asking = INFO_QUESTION.test(lower);
  if (asking) {
    for (const k of CHANGES_THE_ALBUM) scores[k] = 0;
    scores.help += 1; // asked something: it gets an answer
  }

  // Find best intent
  const entries = Object.entries(scores).filter(([k]) => k !== 'unknown');
  entries.sort((a, b) => b[1] - a[1]);

  const [bestIntent, bestScore] = entries[0] || ['unknown', 0];

  if (bestScore === 0) {
    return {
      intent: { type: 'unknown', rawMessage: message },
      confidence: 'low',
      matchedKeywords,
    };
  }

  const confidence = bestScore >= 80 ? 'high' : bestScore >= 30 ? 'medium' : 'low';

  // Build payload
  const payload: Record<string, unknown> = {};

  if (bestIntent === 'go_to_page') {
    const num = pageNumMatch?.[1] ?? standaloneNum?.[1];
    if (num) payload.pageIndex = Math.max(0, parseInt(num, 10) - 1);
  }

  if (bestIntent === 'change_size') {
    for (const [alias, size] of Object.entries(SIZE_ALIASES)) {
      if (lower.includes(alias)) {
        payload.size = size;
        break;
      }
    }
  }

  if (bestIntent === 'apply_theme') {
    for (const [alias, theme] of Object.entries(THEME_ALIASES)) {
      if (lower.includes(alias)) {
        payload.theme = theme;
        break;
      }
    }
  }

  if (bestIntent === 'add_text') {
    // Try to extract text content after "add text" or "write"
    const textMatch = message.match(/(?:add text|write|insert text|caption)[\s:]*(.+)/i);
    if (textMatch) payload.text = textMatch[1].trim();
  }

  if (bestIntent === 'set_background') {
    // Try to detect color
    const colorMatch = lower.match(/(white|black|cream|beige|pink|blue|green|yellow|purple|orange|red|gray|grey|#?[0-9a-f]{3,6})/i);
    if (colorMatch) payload.colorHint = colorMatch[1];
  }

  // What a help question is about, so it gets the answer it asked for.
  if (bestIntent === 'help' && /\b(text|caption|quote|words?|font|title)\b/.test(lower)) payload.topic = 'text';

  return {
    intent: { type: bestIntent as AssistantIntentType, payload, rawMessage: message },
    confidence,
    matchedKeywords,
  };
}

export function getQuickSuggestions(): { label: string; prompt: string }[] {
  return [
    { label: 'Surprise me', prompt: 'Surprise me' },
    { label: 'Generate album', prompt: 'Generate an album layout for me' },
    { label: 'Shuffle page', prompt: 'Shuffle this page layout' },
    { label: 'Auto-fill', prompt: 'Auto-fill the photo slots' },
    { label: 'Status', prompt: 'Show me my album status' },
  ];
}
