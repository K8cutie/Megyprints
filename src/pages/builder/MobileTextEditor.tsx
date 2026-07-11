/* ══════════════════════════════════════════════════════════════════════════
   MobileTextEditor — the phone text editor for a template text box.
   A live-styled typing area with a FORMAT BAR that floats directly above the
   keyboard (B / I / U · font · size · color · align). Text is clipped to the
   box at render time; here the user just types and styles it.

   The bar-above-keyboard trick uses visualViewport so the editor is exactly as
   tall as the *visible* area — the bottom bar then lands just above the keyboard.
   (iOS keyboard/viewport timing is finicky; this is the part to test on-device.)
   ══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Check, X, Minus, Plus, ChevronDown } from 'lucide-react';
import type { TextElement } from './types';
import { contrastOutline, WORDART_OUTLINE_WIDTH, WORDART_SHADOW } from './wordArt';

export type BoxTextContent = Pick<
  TextElement,
  'text' | 'fontSize' | 'fontFamily' | 'color' | 'bold' | 'italic' | 'underline' | 'alignment' | 'outlineColor' | 'outlineWidth' | 'shadow'
>;

// 27 caption fonts (loaded in index.html, display=swap). A mix of serif, sans,
// script and display so any mood — elegant, playful, bold — has a fit.
export const FONTS = [
  { name: 'Georgia', family: 'Georgia, "Times New Roman", serif' },
  { name: 'Playfair', family: '"Playfair Display", Georgia, serif' },
  { name: 'Lora', family: '"Lora", Georgia, serif' },
  { name: 'Merriweather', family: '"Merriweather", Georgia, serif' },
  { name: 'Cormorant', family: '"Cormorant Garamond", Georgia, serif' },
  { name: 'Baskerville', family: '"Libre Baskerville", Georgia, serif' },
  { name: 'Cinzel', family: '"Cinzel", Georgia, serif' },
  { name: 'Yeseva One', family: '"Yeseva One", Georgia, serif' },
  { name: 'Abril Fatface', family: '"Abril Fatface", Georgia, serif' },
  { name: 'DM Sans', family: '"DM Sans", system-ui, sans-serif' },
  { name: 'Montserrat', family: '"Montserrat", system-ui, sans-serif' },
  { name: 'Poppins', family: '"Poppins", system-ui, sans-serif' },
  { name: 'Raleway', family: '"Raleway", system-ui, sans-serif' },
  { name: 'Nunito', family: '"Nunito", system-ui, sans-serif' },
  { name: 'Quicksand', family: '"Quicksand", system-ui, sans-serif' },
  { name: 'Work Sans', family: '"Work Sans", system-ui, sans-serif' },
  { name: 'Fredoka', family: '"Fredoka", system-ui, sans-serif' },
  { name: 'Dancing Script', family: '"Dancing Script", cursive' },
  { name: 'Pacifico', family: '"Pacifico", cursive' },
  { name: 'Caveat', family: '"Caveat", cursive' },
  { name: 'Great Vibes', family: '"Great Vibes", cursive' },
  { name: 'Sacramento', family: '"Sacramento", cursive' },
  { name: 'Parisienne', family: '"Parisienne", cursive' },
  { name: 'Pinyon Script', family: '"Pinyon Script", cursive' },
  { name: 'Lobster', family: '"Lobster", cursive' },
  { name: 'Shrikhand', family: '"Shrikhand", cursive' },
  { name: 'Bebas Neue', family: '"Bebas Neue", system-ui, sans-serif' },
];
export const COLORS = ['#2D2D2D', '#FFFFFF', '#E8A598', '#C9A24B', '#2E7D4A', '#3A6EA5', '#9B5DE5'];

export default function MobileTextEditor({ initial, onSave, onClose }: {
  initial: BoxTextContent;
  onSave: (content: BoxTextContent) => void;
  onClose: () => void;
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

  const save = () => {
    onSave({
      text, fontSize, fontFamily, color, bold, italic, underline, alignment,
      outlineColor: outline ? contrastOutline(color) : undefined,
      outlineWidth: outline ? WORDART_OUTLINE_WIDTH : undefined,
      shadow: shadow || undefined,
    });
    onClose();
  };

  const fontIdx = Math.max(0, FONTS.findIndex((f) => f.family === fontFamily));
  const [fontOpen, setFontOpen] = useState(false);

  return (
    <div className="fixed left-0 right-0 z-[120] bg-white flex flex-col"
      style={{ top: vp?.top ?? 0, height: vp?.h ?? '100%' }}>
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 h-12 border-b border-[#E8E8E8]">
        <button onClick={onClose} className="text-[#9B9B9B] p-1"><X size={20} /></button>
        <span className="text-sm font-semibold text-[#2D2D2D]">Edit text</span>
        <button onClick={save} className="text-[#2E7D4A] font-semibold flex items-center gap-1 p-1">
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

      {/* Format bar — floats directly above the keyboard */}
      <div className="shrink-0 border-t border-[#E8E8E8] bg-white relative">
        {/* Font picker dropdown — opens upward, each font shown in its own face */}
        {fontOpen && (
          <>
            <div className="fixed inset-0 z-[1]" onClick={() => setFontOpen(false)} />
            <div className="absolute bottom-full left-0 right-0 z-[2] max-h-72 overflow-y-auto bg-white border-t border-[#E8E8E8] shadow-[0_-10px_30px_rgba(0,0,0,0.14)]">
              {FONTS.map((f) => (
                <button key={f.name} onClick={() => { setFontFamily(f.family); setFontOpen(false); }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left ${f.family === fontFamily ? 'bg-[#FDE8E4]' : 'active:bg-[#F5F5F5]'}`}>
                  <span className="text-[18px] text-[#2D2D2D] truncate" style={{ fontFamily: f.family }}>{f.name}</span>
                  {f.family === fontFamily && <Check size={16} className="text-[#E8A598] shrink-0 ml-2" />}
                </button>
              ))}
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
            className="px-3 h-9 rounded-lg text-sm text-[#2D2D2D] bg-[#F5F5F5] active:scale-95 transition-transform shrink-0 flex items-center gap-1.5"
            style={{ fontFamily }}>{FONTS[fontIdx].name} <ChevronDown size={14} className="text-[#9B9B9B]" /></button>
          <Divider />
          <ToolBtn onClick={() => setFontSize((s) => Math.max(14, s - 2))}><Minus size={16} /></ToolBtn>
          <span className="text-sm text-[#6B6B6B] w-7 text-center tabular-nums">{fontSize}</span>
          <ToolBtn onClick={() => setFontSize((s) => Math.min(80, s + 2))}><Plus size={16} /></ToolBtn>
          <Divider />
          {COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)}
              className="w-7 h-7 rounded-full shrink-0"
              style={{
                background: c,
                border: color === c ? '2px solid #E8A598' : '1px solid rgba(0,0,0,0.12)',
                boxShadow: color === c ? '0 0 0 2px #FDE8E4' : undefined,
              }} />
          ))}
          <Divider />
          <button onClick={() => setOutline((v) => !v)}
            className="px-3 h-9 rounded-lg text-sm shrink-0 active:scale-95 transition-transform"
            style={{ background: outline ? '#FDE8E4' : '#F5F5F5', color: outline ? '#E8A598' : '#6B6B6B', fontWeight: 600 }}>Outline</button>
          <button onClick={() => setShadow((v) => !v)}
            className="px-3 h-9 rounded-lg text-sm shrink-0 active:scale-95 transition-transform"
            style={{ background: shadow ? '#FDE8E4' : '#F5F5F5', color: shadow ? '#E8A598' : '#6B6B6B', fontWeight: 600 }}>Shadow</button>
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
      style={{ background: active ? '#FDE8E4' : '#F5F5F5', color: active ? '#E8A598' : '#6B6B6B' }}>
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-6 bg-[#E8E8E8] mx-1 shrink-0" />;
}
