/* ══════════════════════════════════════════════════════════════════════════
   Megy Assistant — Barrel Export
   ══════════════════════════════════════════════════════════════════════════ */

export { default as MegyAssistant } from './MegyAssistant';
export { ActionEngine } from './actionEngine';
export { parseIntent, getQuickSuggestions } from './intentParser';
export type {
  AssistantIntent,
  AssistantIntentType,
  AssistantMessage,
  ExecutedAction,
  QuickSuggestion,
  ParsedCommand,
} from './types';
