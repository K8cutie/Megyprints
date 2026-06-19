/* ══════════════════════════════════════════════════════════════════════════
   Megy Assistant — Intent Parser
   Phase 1: Keyword + pattern matching for natural language commands
   ══════════════════════════════════════════════════════════════════════════ */

import type { AssistantIntentType, ParsedCommand } from './types';
import type { AlbumSizePreset, TemplateType } from '../pages/builder/types';

// ── Keyword maps ──────────────────────────────────────────────────────────

const INTENT_KEYWORDS: Record<AssistantIntentType, string[]> = {
  generate_album: [
    'generate', 'generate album', 'auto layout', 'auto-layout', 'create album',
    'build album', 'make album', 'layout photos', 'auto generate', 'auto place',
    'distribute photos', 'fill album', 'auto fill', 'autofill',
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
    'place photos', 'put photos', 'auto place', 'fill empty',
    'fill all', 'populate',
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

// Album sizes we support
const SIZE_ALIASES: Record<string, AlbumSizePreset> = {
  '6x6': '6x6', '6 by 6': '6x6', 'six by six': '6x6', 'square small': '6x6',
  '8x8': '8x8', '8 by 8': '8x8', 'eight by eight': '8x8', 'square': '8x8',
  '6x4': '6x4', '6 by 4': '6x4', 'four by six': '6x4', 'landscape small': '6x4',
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
    set_background: 0, add_text: 0, update_text: 0, delete_text: 0, preview_album: 0, status: 0,
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
