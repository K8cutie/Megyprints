/* ══════════════════════════════════════════════════════════════════════════
   Megy Assistant — Types
   Phase 1: Conversational control layer for the album builder
   ══════════════════════════════════════════════════════════════════════════ */

// All types are self-contained in this file

export type AssistantIntentType =
  | 'generate_album'
  | 'shuffle_layout'
  | 'regenerate_page'
  | 'auto_fill'
  | 'clear_slots'
  | 'add_page'
  | 'delete_page'
  | 'duplicate_page'
  | 'go_to_page'
  | 'next_page'
  | 'prev_page'
  | 'change_size'
  | 'change_template'
  | 'apply_theme'
  | 'set_background'
  | 'set_border'
  | 'set_frame'
  | 'add_text'
  | 'update_text'
  | 'delete_text'
  | 'preview_album'
  | 'status'
  | 'help'
  | 'undo'
  | 'redo'
  | 'reset'
  | 'surprise_me'
  | 'add_photos'
  | 'set_photos_per_page'
  | 'unknown';

export interface AssistantIntent {
  type: AssistantIntentType;
  payload?: Record<string, unknown>;
  rawMessage: string;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  intent?: AssistantIntent;
  actions?: ExecutedAction[];
  suggestions?: QuickSuggestion[];
  timestamp: Date;
}

export interface ExecutedAction {
  intentType: AssistantIntentType;
  success: boolean;
  message: string;
}

export interface QuickSuggestion {
  id: string;
  label: string;
  prompt: string;
  icon?: string;
}

export interface ParsedCommand {
  intent: AssistantIntent;
  confidence: 'high' | 'medium' | 'low';
  matchedKeywords: string[];
}
