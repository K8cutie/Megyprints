/* ══════════════════════════════════════════════════════════════════════════
   Megy Assistant — Action Engine
   Connects parsed intents to actual builder state mutations
   ══════════════════════════════════════════════════════════════════════════ */

import type { BuilderActions } from '../pages/builder/useBuilderState';
import type { AssistantIntent, ExecutedAction } from './types';
import type { AlbumBackground, AlbumSizePreset, TemplateType, TextElement, FrameStyle } from '../pages/builder/types';
import { getDisabledSizes } from '../lib/storeSettings';
import { getThemedBackground, getThemedPhotoBorder, getThemeCornerBase } from '../pages/builder/types';

export class ActionEngine {
  builder: BuilderActions;
  constructor(builder: BuilderActions) {
    this.builder = builder;
  }

  async execute(intent: AssistantIntent): Promise<ExecutedAction> {
    try {
      switch (intent.type) {
        case 'generate_album':
          // Carry the user's chosen background into every generated page, so a
          // background picked before generating (incl. a custom upload) survives.
          this.builder.generateAlbum(this.builder.currentPage?.background);
          return { intentType: intent.type, success: true, message: 'Album generated! Your photos have been arranged across all pages.' };

        case 'shuffle_layout':
          // Cycle through the available templates IN ORDER (exhaust every option
          // before repeating), not a random pick — matches the mobile "Change".
          this.builder.cycleLayout();
          return { intentType: intent.type, success: true, message: 'Next layout.' };

        case 'regenerate_page':
          this.builder.regeneratePage();
          return { intentType: intent.type, success: true, message: 'This page has been regenerated with a fresh layout.' };

        case 'auto_fill':
          this.builder.autoFillSlots();
          return { intentType: intent.type, success: true, message: 'Photos have been auto-placed into the available slots.' };

        case 'clear_slots':
          this.builder.clearAllSlots();
          return { intentType: intent.type, success: true, message: 'All photo slots on this page have been cleared.' };

        case 'add_page':
          this.builder.addPage();
          return { intentType: intent.type, success: true, message: 'A new page has been added after the current one.' };

        case 'delete_page': {
          const idx = intent.payload?.pageIndex as number | undefined ?? this.builder.currentPageIndex;
          if (this.builder.albumPages.length <= 40) {
            return { intentType: intent.type, success: false, message: 'Cannot delete — album must have at least 40 pages minimum.' };
          }
          this.builder.deletePage(idx);
          return { intentType: intent.type, success: true, message: `Page ${idx + 1} deleted.` };
        }

        case 'go_to_page': {
          const target = intent.payload?.pageIndex as number | undefined;
          if (target === undefined) {
            return { intentType: intent.type, success: false, message: 'Which page number would you like to go to?' };
          }
          const clamped = Math.max(0, Math.min(target, this.builder.albumPages.length - 1));
          this.builder.goToPage(clamped);
          return { intentType: intent.type, success: true, message: `Now on page ${clamped + 1} of ${this.builder.albumPages.length}.` };
        }

        case 'next_page': {
          const next = Math.min(this.builder.currentPageIndex + 1, this.builder.albumPages.length - 1);
          this.builder.goToPage(next);
          return { intentType: intent.type, success: true, message: `Now on page ${next + 1} of ${this.builder.albumPages.length}.` };
        }

        case 'prev_page': {
          const prev = Math.max(this.builder.currentPageIndex - 1, 0);
          this.builder.goToPage(prev);
          return { intentType: intent.type, success: true, message: `Now on page ${prev + 1} of ${this.builder.albumPages.length}.` };
        }

        case 'change_size': {
          const size = intent.payload?.size as AlbumSizePreset | undefined;
          if (!size) {
            return { intentType: intent.type, success: false, message: 'Which size? Say something like "8x8" or "11.5x8".' };
          }
          if (getDisabledSizes().includes(size)) {
            return { intentType: intent.type, success: false, message: `Sorry, the ${size} size isn't available right now. Try another size.` };
          }
          this.builder.setAlbumSize(size);
          return { intentType: intent.type, success: true, message: `Album size changed to ${size}.` };
        }

        case 'change_template': {
          const templateId = intent.payload?.templateId as string | undefined;
          if (!templateId) {
            return { intentType: intent.type, success: false, message: 'Which template?' };
          }
          this.builder.setPageTemplate(templateId);
          return { intentType: intent.type, success: true, message: 'Page template changed.' };
        }

        case 'duplicate_page': {
          const idx = (intent.payload?.pageIndex as number | undefined) ?? this.builder.currentPageIndex;
          this.builder.duplicatePage(idx);
          return { intentType: intent.type, success: true, message: `Page ${idx + 1} duplicated.` };
        }

        case 'apply_theme': {
          const theme = intent.payload?.theme as TemplateType | undefined;
          if (!theme) {
            return { intentType: intent.type, success: false, message: 'Which theme? Try: wedding, baby, baptism, birthday, family, travel, minimalist, vintage, classic, kids, graduation.' };
          }
          this.builder.setSelectedTemplate(theme);
          // The theme owns the look — apply its background AND photo frame to
          // every page so the whole album reads as that occasion. (Surprise Me
          // won't change this — it only reshuffles layouts.)
          const themedBg = getThemedBackground(theme, 0);
          // Pass themedBg EXPLICITLY to applyBackgroundToAllPages — calling it
          // with no arg reads currentPage.background from a stale closure (before
          // setPageBackground applies) and copies the OLD background over every
          // page, which silently wiped the theme background. (Same trap that
          // set_background already guards against.)
          this.builder.setPageBackground(themedBg);
          this.builder.applyBackgroundToAllPages(themedBg);
          this.builder.applyPhotoFrameToAllPages(getThemedPhotoBorder(theme));
          // A theme owns a clean look — clear any decorative frame the user had
          // picked manually so switching occasions doesn't leave a stale frame.
          this.builder.applyFrameToAllPages('none');
          this.builder.applyCornersToAllPages(getThemeCornerBase(theme));
          // Keep any auto-placed title on-brand (font + color, and the default
          // text) when switching themes.
          this.builder.restyleThemedTitles(theme);
          return { intentType: intent.type, success: true, message: `Theme set to ${theme}.` };
        }

        case 'set_background': {
          // A UI may pass a full background object; chat passes a colorHint.
          const explicit = intent.payload?.background as AlbumBackground | undefined;
          const applyAll = intent.payload?.applyAll === true;
          const colorHint = intent.payload?.colorHint as string | undefined;
          const bg: AlbumBackground = explicit
            ? explicit
            : colorHint
            ? { type: 'solid', solid: colorHint.startsWith('#') ? colorHint : guessColor(colorHint) }
            : { type: 'solid', solid: '#FFFBF7' };
          if (applyAll) {
            // Pass the fresh bg so every page (incl. the current one) gets it —
            // avoids the stale-closure overwrite that snapped opacity back.
            this.builder.applyBackgroundToAllPages(bg);
          } else {
            this.builder.setPageBackground(bg);
          }
          return { intentType: intent.type, success: true, message: applyAll ? 'Background applied to all pages.' : 'Background updated.' };
        }

        case 'set_border': {
          // The Step-2 Border picker passes a full border spec ({color,width,style}).
          const border = intent.payload?.border as { color: string; width: number; style?: 'solid' | 'dashed' | 'dotted' } | undefined;
          if (!border) {
            return { intentType: intent.type, success: false, message: 'Pick a border style.' };
          }
          // Applies to every page so the album reads consistently.
          this.builder.applyPhotoFrameToAllPages(border);
          return { intentType: intent.type, success: true, message: 'Border applied to all pages.' };
        }

        case 'set_frame': {
          // The Step-2 Frame picker passes a typed FrameStyle id.
          const frame = intent.payload?.frame as FrameStyle | undefined;
          if (!frame) {
            return { intentType: intent.type, success: false, message: 'Pick a frame style.' };
          }
          this.builder.applyFrameToAllPages(frame);
          return { intentType: intent.type, success: true, message: frame === 'none' ? 'Frame removed from all pages.' : 'Frame applied to all pages.' };
        }

        case 'add_photos': {
          const files = intent.payload?.files as FileList | File[] | undefined;
          const count = files ? (Array.isArray(files) ? files.length : files.length) : 0;
          if (!files || count === 0) {
            return { intentType: intent.type, success: false, message: 'No photos to add.' };
          }
          this.builder.addPhotos(files);
          return { intentType: intent.type, success: true, message: `${count} photo${count > 1 ? 's' : ''} added.` };
        }

        case 'set_photos_per_page': {
          const count = intent.payload?.count as number | undefined;
          this.builder.setPhotosPerPage(count);
          return { intentType: intent.type, success: true, message: count ? `Photos per page set to ${count}.` : 'Photos per page set to automatic.' };
        }

        case 'add_text': {
          const text = intent.payload?.text as string | undefined;
          const centerX = 1200 / 2; // approximate canvas center
          const centerY = 800 / 2;
          this.builder.addTextElement(centerX, centerY, text);
          return {
            intentType: intent.type,
            success: true,
            message: text
              ? `Text added: "${text}".`
              : 'Text added. Double-click it on the canvas to edit.',
          };
        }

        case 'update_text': {
          const id = intent.payload?.id as string | undefined;
          const updates = intent.payload?.updates as Partial<TextElement> | undefined;
          if (!id || !updates) {
            return { intentType: intent.type, success: false, message: 'No text element to update.' };
          }
          this.builder.updateTextElement(id, updates);
          return { intentType: intent.type, success: true, message: 'Text updated.' };
        }

        case 'delete_text': {
          const id = intent.payload?.id as string | undefined;
          if (!id) {
            return { intentType: intent.type, success: false, message: 'No text element to delete.' };
          }
          this.builder.deleteTextElement(id);
          return { intentType: intent.type, success: true, message: 'Text removed.' };
        }

        case 'preview_album': {
          // Start the preview at the FIRST page. Mobile review leaves the user on
          // the last page, and the preview's forced order CTA auto-fires on the
          // last spread — so without this it would skip straight to ordering.
          this.builder.goToPage(0);
          this.builder.setPhase('preview');
          return { intentType: intent.type, success: true, message: 'Opening preview.' };
        }

        case 'status': {
          const s = this.getStatus();
          return { intentType: intent.type, success: true, message: s };
        }

        case 'undo': {
          if (!this.builder.canUndo) {
            return { intentType: intent.type, success: false, message: 'Nothing to undo.' };
          }
          this.builder.undo();
          return { intentType: intent.type, success: true, message: 'Undo successful.' };
        }

        case 'redo': {
          if (!this.builder.canRedo) {
            return { intentType: intent.type, success: false, message: 'Nothing to redo.' };
          }
          this.builder.redo();
          return { intentType: intent.type, success: true, message: 'Redo successful.' };
        }

        case 'reset': {
          this.builder.reset();
          return { intentType: intent.type, success: true, message: 'Album reset. Starting fresh.' };
        }

        case 'surprise_me': {
          if (this.builder.uploadedPhotos.length === 0) {
            return { intentType: intent.type, success: false, message: "Upload a few photos first — then I'll shuffle the layouts for you." };
          }
          // Surprise Me changes ONLY the page templates (frame count + positions).
          // The chosen theme owns the look, so the current background is preserved
          // as-is. randomize=true keeps the photo sequence but repackages it into
          // random templates + slot counts, so layouts differ on every click.
          const keepBg = this.builder.currentPage.background;
          this.builder.generateAlbum(keepBg, { randomize: true });

          return { intentType: intent.type, success: true, message: `Fresh layout! Every page rearranged — click again for another look.` };
        }

        case 'help':
          return { intentType: intent.type, success: true, message: getHelpText() };

        case 'unknown':
        default:
          return { intentType: 'unknown', success: false, message: "I'm not sure what you mean. Try: 'generate album', 'shuffle layout', 'go to page 5', 'auto fill', or 'help'." };
      }
    } catch (err) {
      return {
        intentType: intent.type,
        success: false,
        message: err instanceof Error ? err.message : 'Something went wrong.',
      };
    }
  }

  private getStatus(): string {
    const b = this.builder;
    const totalPhotos = b.uploadedPhotos.length;
    const totalPages = b.albumPages.length;
    const currentPage = b.currentPageIndex + 1;

    const filledSlots = b.albumPages.reduce(
      (sum, p) => sum + (p.slotFills?.filter(f => f !== null).length ?? 0),
      0
    );
    const totalSlots = b.albumPages.reduce(
      (sum, p) => sum + (p.slotFills?.length ?? 0),
      0
    );

    const usedPages = b.albumPages.filter(
      p => (p.slotFills?.some(f => f !== null) ?? false) || p.photos.length > 0 || p.textElements.length > 0
    ).length;

    return [
      `Album status:`,
      `• Size: ${b.albumSize}`,
      `• Pages: ${totalPages} (${usedPages} used)`,
      `• Photos uploaded: ${totalPhotos}`,
      `• Slots filled: ${filledSlots}/${totalSlots}`,
      `• Current page: ${currentPage}`,
      `• Theme: ${b.selectedTemplate}`,
      b.canUndo ? `• You can undo your last action.` : '',
    ].filter(Boolean).join('\n');
  }
}

function guessColor(hint: string): string {
  const map: Record<string, string> = {
    white: '#FFFFFF', black: '#2D2D2D', cream: '#FFF8F0', beige: '#F5E6D3',
    pink: '#FDE8E4', blue: '#E0E8F0', green: '#E4F0E0', yellow: '#FFF8DC',
    purple: '#E8E0F0', orange: '#FFE5CC', red: '#FDE0E0', gray: '#E8E8E8',
    grey: '#E8E8E8',
  };
  return map[hint.toLowerCase()] ?? '#FFFBF7';
}

function getHelpText(): string {
  return `Here's what I can help you with:

**Quick magic:**
• "Surprise me" — Fresh page layouts (keeps your theme)
• "Generate album" — Auto-arrange your photos across all pages
• "Shuffle layout" — Randomize the current page template
• "Auto-fill" — Place photos into empty slots

**Navigation:**
• "Go to page 5" — Jump to any page
• "Next page" / "Previous page" — Browse pages

**Customization:**
• "Change size to 8x8" — Switch album dimensions
• "Apply wedding theme" — Set the album style
• "Set background to cream" — Change page background

**Actions:**
• "Undo" / "Redo" — Step through changes
• "Add page" / "Delete page" — Manage pages
• "Status" — See album overview
• "Reset" — Start over (careful!)

What would you like to do?`;
}
