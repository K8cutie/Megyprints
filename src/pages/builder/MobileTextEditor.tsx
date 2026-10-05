/* ══════════════════════════════════════════════════════════════════════════
   MobileTextEditor — the phone text editor for a template text box.
   A live-styled typing area with a FORMAT BAR that floats directly above the
   keyboard (B / I / U · font · size · color · align). Text is clipped to the
   box at render time; here the user just types and styles it.

   The bar-above-keyboard trick uses visualViewport so the editor is exactly as
   tall as the *visible* area — the bottom bar then lands just above the keyboard.
   (iOS keyboard/viewport timing is finicky; this is the part to test on-device.)
   ══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Check, X, Minus, Plus, ChevronDown } from 'lucide-react';
import type { TextElement } from './types';
import { FONTS, fontName } from './fonts';
import { FontList } from './FontList';
import { contrastOutline, WORDART_OUTLINE_WIDTH, WORDART_SHADOW } from './wordArt';
import { captionFits, type Box } from './textFit';

export type BoxTextContent = Pick<
  TextElement,
  'text' | 'fontSize' | 'fontFamily' | 'color' | 'bold' | 'italic' | 'underline' | 'alignment' | 'outlineColor' | 'outlineWidth' | 'shadow'
>;

export const COLORS = ['#2D2D2D', '#FFFFFF', '#E8A598', '#C9A24B', '#2E7D4A', '#3A6EA5', '#9B5DE5'];

export default function MobileTextEditor({ initial, onSave, onClose, box }: {
  initial: BoxTextContent;
  onSave: (content: BoxTextContent) => void;
  onClose: () => void;
  /** The caption box this text fills (design px, captionBoxSize): the editor
   *  says, as you type, when it won't fit — the box clips it in print. */
  box?: Box | null;
}) {
  const [text, setText] = useState(initial.text);
  const [fontSize, setFontSize] = useState(initial.fontSize || 28);
  const [fontFamily, setFontFamily] = useState(initial.fontFamily || FONTS[0].family);
  const [color, setColor] = useState(initial.color || '#2D2D2D');
  const [bold, setBold] = useState(initial.bold ?? false);
  const [italic, setItalic] = useState(initial.italic ?? false);
  const [underline, setUnderline] = useState(initial.underline ?? false);
  const [alignment, setAlignment] = useState<'left' | 'center' | 'right'>(initial.alignment ?? 'center');
  // WordArt effects: outline (auto-contrast stroke) + soft shadow.
  const [outline, setOutline] = useState<boolean>(!!initial.outlineWidth);
  const [shadow, setShadow] = useState<boolean>(!!initial.shadow);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Size the editor to the VISIBLE viewport so the format bar sits above the
  // keyboard (and follows it as it opens/closes).
  const [vp, setVp] = useState<{ h: number; top: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => setVp({ h: vv.height, top: vv.offsetTop });
    on();
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on); };
  }, []);

  useEffect(() => { taRef.current?.focus(); }, []);

  // Too long for its box? (PERF2-2) — the renderers' own wrap, in design px.
  const fit = useMemo(
    () => (box ? captionFits(text, { fontSize, fontFamily, bold, italic }, box) : null),
    [box, text, fontSize, fontFamily, bold, italic],
  );

  const save = () => {
    onSave({
      text, fontSize, fontFamily, color, bold, italic, underline, alignment,
      outlineColor: outline ? contrastOutline(color) : undefined,
      outlineWidth: outline ? WORDART_OUTLINE_WIDTH : undefined,
      shadow: shadow || undefined,
    });
    onClose();
  };

  const [fontOpen, setFontOpen] = useState(false);

  return (
    <div className="fixed left-0 right-0 z-[120] bg-white flex flex-col"
      style={{ top: vp?.top ?? 0, height: vp?.h ?? '100%' }}>
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 h-12 border-b border-line">
        <button onClick={onClose} className="text-light p-1"><X size={20} /></button>
        <span className="text-sm font-semibold text-dark">Edit text</span>
        <button onClick={save} className="text-success font-semibold flex items-center gap-1 p-1">
          <Check size={18} /> Done
        </button>
      </div>

      {/* Live-styled typing area */}
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-[#FAFAFA]">
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your text…"
          rows={3}
          className="w-full bg-transparent outline-none resize-none placeholder:text-[#C4C4C4]"
          style={{
            fontFamily, fontSize, color,
            fontWeight: bold ? 700 : 400,
            fontStyle: italic ? 'italic' : 'normal',
            textDecoration: underline ? 'underline' : 'none',
            textAlign: alignment, lineHeight: 1.3,
            ...(outline ? { WebkitTextStroke: `${WORDART_OUTLINE_WIDTH}px ${contrastOutline(color)}`, paintOrder: 'stroke fill' as any } : {}),
            ...(shadow ? { textShadow: `${WORDART_SHADOW.offsetX}px ${WORDART_SHADOW.offsetY}px ${WORDART_SHADOW.blur}px ${WORDART_SHADOW.color}` } : {}),
          }}
        />
      </div>
      {fit && !fit.fits && (
        <div role="status" data-testid="text-too-long"
          className="shrink-0 mx-3 mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-[#F0D9A8] bg-[#FFF6E5] px-3 py-2 text-xs text-[#8A5A12]">
          <span className="flex-1 min-w-[12rem]">Too long for this box: part of it will be cut off in print. Shorten it{fit.fitsAt ? ', or make the text smaller' : ''}.</span>
          {fit.fitsAt && (
            <button type="button" data-testid="text-make-fit" onClick={() => setFontSize(fit.fitsAt!)}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-[#E8C98A] font-semibold hover:bg-[#FFF0D1]">
              Make it fit (size {fit.fitsAt})
            </button>
          )}
        </div>
      )}

      {/* Format bar — floats directly above the keyboard */}
      <div className="shrink-0 border-t border-line bg-white relative">
        {/* Font picker dropdown — opens upward, each font shown in its own face */}
        {fontOpen && (
          <>
            <div className="fixed inset-0 z-[1]" onClick={() => setFontOpen(false)} />
            <div className="absolute bottom-full left-0 right-0 z-[2] max-h-72 overflow-y-auto bg-white border-t border-line shadow-[0_-10px_30px_rgba(0,0,0,0.14)]">
              <FontList value={fontFamily} onPick={(f) => { setFontFamily(f); setFontOpen(false); }} />
            </div>
          </>
        )}
        <div className="overflow-x-auto">
        <div className="flex items-center gap-1 px-3 py-2 whitespace-nowrap" style={{ minWidth: 'max-content' }}>
          <ToolBtn active={bold} onClick={() => setBold((v) => !v)}><Bold size={18} /></ToolBtn>
          <ToolBtn active={italic} onClick={() => setItalic((v) => !v)}><Italic size={18} /></ToolBtn>
          <ToolBtn active={underline} onClick={() => setUnderline((v) => !v)}><Underline size={18} /></ToolBtn>
          <Divider />
          <button onClick={() => setFontOpen((v) => !v)}
            className="px-3 h-9 rounded-lg text-sm text-dark bg-paper active:scale-95 transition-transform shrink-0 flex items-center gap-1.5"
            style={{ fontFamily }}>{fontName(fontFamily)} <ChevronDown size={14} className="text-light" /></button>
          <Divider />
          <ToolBtn onClick={() => setFontSize((s) => Math.max(14, s - 2))}><Minus size={16} /></ToolBtn>
          <span className="text-sm text-medium w-7 text-center tabular-nums">{fontSize}</span>
          <ToolBtn onClick={() => setFontSize((s) => Math.min(80, s + 2))}><Plus size={16} /></ToolBtn>
          <Divider />
          {COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)}
              className="w-7 h-7 rounded-full shrink-0"
              style={{
                background: c,
                border: color === c ? '2px solid #9A4A2C' : '1px solid rgba(0,0,0,0.12)',
                boxShadow: color === c ? '0 0 0 2px #F6E7DF' : undefined,
              }} />
          ))}
          <Divider />
          <button onClick={() => setOutline((v) => !v)}
            className="px-3 h-9 rounded-lg text-sm shrink-0 active:scale-95 transition-transform"
            style={{ background: outline ? '#F6E7DF' : '#F5F5F5', color: outline ? '#9A4A2C' : '#6B6B6B', fontWeight: 600 }}>Outline</button>
          <button onClick={() => setShadow((v) => !v)}
            className="px-3 h-9 rounded-lg text-sm shrink-0 active:scale-95 transition-transform"
            style={{ background: shadow ? '#F6E7DF' : '#F5F5F5', color: shadow ? '#9A4A2C' : '#6B6B6B', fontWeight: 600 }}>Shadow</button>
          <Divider />
          <ToolBtn active={alignment === 'left'} onClick={() => setAlignment('left')}><AlignLeft size={18} /></ToolBtn>
          <ToolBtn active={alignment === 'center'} onClick={() => setAlignment('center')}><AlignCenter size={18} /></ToolBtn>
          <ToolBtn active={alignment === 'right'} onClick={() => setAlignment('right')}><AlignRight size={18} /></ToolBtn>
        </div>
        </div>
      </div>
    </div>
  );
}

function ToolBtn({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick}
      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 active:scale-95 transition-transform"
      style={{ background: active ? '#F6E7DF' : '#F5F5F5', color: active ? '#9A4A2C' : '#6B6B6B' }}>
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-6 bg-line mx-1 shrink-0" />;
}
