import type { AlbumPage } from './types';
import { getTemplateById } from './pageTemplates';
import { marginForTemplate } from './binding';
import { resolveSlotBox } from './slotGeometry';

const DEFAULT_MARGIN = { top: 0.04, bottom: 0.04, left: 0.04, right: 0.04 };

/** The on-screen rect of a photo slot in the phone page (px). */
export function slotRectPx(page: AlbumPage, pageIndex: number, slotIndex: number, W: number, H: number, albumSize: string) {
  const t = page.templateId ? getTemplateById(page.templateId) : null;
  const raw = t?.slots[slotIndex];
  if (!t || !raw) return null;
  const m = marginForTemplate(t, t.margin ?? DEFAULT_MARGIN, albumSize, pageIndex);
  const safeX = m.left * W, safeY = m.top * H, safeW = W * (1 - m.left - m.right), safeH = H * (1 - m.top - m.bottom);
  const s = resolveSlotBox(raw, page.slotGeometries?.[slotIndex]);
  return { left: safeX + s.x * safeW, top: safeY + s.y * safeH, width: s.width * safeW, height: s.height * safeH };
}

