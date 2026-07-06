// Themed vector ornaments — decorative SVGs that fill a "combo box" slot in the
// album (chosen alongside Text). Each is a self-contained SVG STRING rendered
// via a data: URI, so the SAME asset paints identically in all three renderers
// (BuilderPreview DOM <img>, useCanvasEngine Fabric image, printPipeline canvas
// drawImage) — the strict 3-renderer parity rule. Parity-safe by construction:
// primitives + paths only, NO <text> (fonts differ across engines) and NO
// external refs. Natural colors are fine — an ornament lives contained in its
// own slot, so it never overlays or clashes with the photos on a page.

export type OrnamentPackId =
  | 'travel' | 'love' | 'religion' | 'kids' | 'birthday' | 'christmas' | 'baby';

export interface OrnamentDef {
  /** Stable id, unique within its pack — serialized into the album. Never rename. */
  id: string;
  label: string;
  /** Full standalone SVG markup (100×100 viewBox, includes xmlns). */
  svg: string;
}

export interface OrnamentPack {
  id: OrnamentPackId;
  label: string;
  /** A single representative emoji for the pack tab (UI only, never printed). */
  emoji: string;
  items: OrnamentDef[];
}

const V = 'viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"';

export const ORNAMENT_PACKS: OrnamentPack[] = [
  {
    id: 'travel', label: 'Travel', emoji: '✈️', items: [
      { id: 'plane', label: 'Paper plane', svg: `<svg ${V}><path d="M6 50 L94 12 L68 92 L52 64 Z" fill="#4C7DF0"/><path d="M52 64 L94 12 L60 56 Z" fill="#2E5BC0"/><path d="M52 64 L60 56 L57 80 Z" fill="#7CA0F5"/></svg>` },
      { id: 'compass', label: 'Compass', svg: `<svg ${V}><circle cx="50" cy="50" r="38" fill="#F3ECD8" stroke="#C9A24B" stroke-width="6"/><polygon points="50,22 59,50 50,46 41,50" fill="#EF5B5B"/><polygon points="50,78 41,50 50,54 59,50" fill="#4A4A4A"/><circle cx="50" cy="50" r="5" fill="#C9A24B"/></svg>` },
      { id: 'suitcase', label: 'Suitcase', svg: `<svg ${V}><rect x="39" y="20" width="22" height="12" rx="3" fill="none" stroke="#8B5E34" stroke-width="5"/><rect x="18" y="32" width="64" height="50" rx="8" fill="#B4763F"/><rect x="18" y="48" width="64" height="7" fill="#8B5E34"/><rect x="45" y="32" width="10" height="50" fill="#9C6634"/></svg>` },
      { id: 'palm', label: 'Palm tree', svg: `<svg ${V}><path d="M47 42 C49 60 49 78 45 88 L55 88 C53 72 55 56 57 44 Z" fill="#9C6B3F"/><g fill="#3FA65B"><path d="M50 40 C32 26 18 32 14 40 C28 36 42 38 50 46 Z"/><path d="M50 40 C68 26 82 32 86 40 C72 36 58 38 50 46 Z"/><path d="M50 40 C42 20 26 16 18 20 C36 22 46 32 50 46 Z"/><path d="M50 40 C58 20 74 16 82 20 C64 22 54 32 50 46 Z"/></g><circle cx="50" cy="41" r="5" fill="#2E7D46"/></svg>` },
    ],
  },
  {
    id: 'love', label: 'Love', emoji: '❤️', items: [
      { id: 'heart', label: 'Heart', svg: `<svg ${V}><path d="M50 84 C18 60 12 40 24 28 C34 18 48 24 50 36 C52 24 66 18 76 28 C88 40 82 60 50 84 Z" fill="#E0637A"/></svg>` },
      { id: 'hearts', label: 'Two hearts', svg: `<svg ${V}><path d="M38 70 C16 54 12 40 20 32 C27 25 37 29 39 37 C41 29 51 25 58 32 C66 40 60 54 38 70 Z" fill="#F072A8"/><path d="M66 84 C44 68 40 54 48 46 C55 39 65 43 67 51 C69 43 79 39 86 46 C94 54 88 68 66 84 Z" fill="#C64B62"/></svg>` },
      { id: 'rose', label: 'Rose', svg: `<svg ${V}><path d="M50 54 C46 78 48 84 50 90 C52 84 54 78 50 54 Z" fill="#3FA65B"/><path d="M50 60 C40 60 34 52 40 50 C34 44 42 40 48 46 C46 38 56 38 54 46 C60 40 68 46 60 50 C68 52 60 60 50 60 Z" fill="#3FA65B"/><circle cx="50" cy="38" r="20" fill="#E0637A"/><path d="M50 24 C40 26 36 36 42 44 C46 34 54 34 58 44 C64 36 60 26 50 24 Z" fill="#C64B62"/><circle cx="50" cy="40" r="7" fill="#C64B62"/></svg>` },
      { id: 'ring', label: 'Ring', svg: `<svg ${V}><polygon points="50,14 60,28 40,28" fill="#8FD3E8"/><polygon points="40,28 60,28 50,40" fill="#5FB9D6"/><circle cx="50" cy="62" r="24" fill="none" stroke="#D9A441" stroke-width="8"/></svg>` },
    ],
  },
  {
    id: 'religion', label: 'Religion', emoji: '✝️', items: [
      { id: 'cross', label: 'Cross', svg: `<svg ${V}><rect x="42" y="14" width="16" height="72" rx="3" fill="#C9A24B"/><rect x="26" y="34" width="48" height="16" rx="3" fill="#C9A24B"/></svg>` },
      { id: 'dove', label: 'Dove', svg: `<svg ${V}><path d="M18 60 C30 50 46 48 60 52 C66 44 76 40 86 42 C78 46 76 52 76 56 C84 58 90 64 90 64 C82 64 76 64 72 62 C66 74 50 80 38 76 C46 72 50 66 50 62 C40 66 26 66 18 60 Z" fill="#7FA8D0"/><circle cx="82" cy="48" r="2.5" fill="#3A4A5A"/><path d="M50 62 C46 72 40 80 32 84" stroke="#7FA8D0" stroke-width="4" fill="none" stroke-linecap="round"/></svg>` },
      { id: 'church', label: 'Church', svg: `<svg ${V}><rect x="46" y="10" width="8" height="18" fill="#C9A24B"/><rect x="42" y="16" width="16" height="6" fill="#C9A24B"/><polygon points="30,44 50,26 70,44" fill="#B4763F"/><rect x="30" y="44" width="40" height="42" fill="#F3ECD8"/><path d="M44 86 L44 66 C44 60 56 60 56 66 L56 86 Z" fill="#8B5E34"/><rect x="34" y="52" width="10" height="10" fill="#7FA8D0"/><rect x="56" y="52" width="10" height="10" fill="#7FA8D0"/></svg>` },
      { id: 'candle', label: 'Candle', svg: `<svg ${V}><path d="M50 16 C46 24 46 30 50 34 C54 30 54 24 50 16 Z" fill="#F4C430"/><path d="M50 22 C48 26 48 30 50 32 C52 30 52 26 50 22 Z" fill="#EF8A3B"/><rect x="42" y="36" width="16" height="46" rx="4" fill="#F3ECD8"/><rect x="42" y="36" width="16" height="6" rx="3" fill="#E4D6B0"/><rect x="36" y="82" width="28" height="8" rx="3" fill="#C9A24B"/></svg>` },
    ],
  },
  {
    id: 'kids', label: 'Kids', emoji: '🧸', items: [
      { id: 'balloon', label: 'Balloon', svg: `<svg ${V}><ellipse cx="50" cy="40" rx="26" ry="30" fill="#EF5B5B"/><polygon points="46,68 54,68 50,76" fill="#EF5B5B"/><path d="M50 76 C54 82 46 86 50 94" stroke="#9B9B9B" stroke-width="3" fill="none"/><ellipse cx="42" cy="32" rx="7" ry="10" fill="#F7A3A3" opacity="0.7"/></svg>` },
      { id: 'star', label: 'Star', svg: `<svg ${V}><polygon points="50,12 61,38 89,40 67,58 74,86 50,70 26,86 33,58 11,40 39,38" fill="#F4C430" stroke="#E0A81E" stroke-width="3" stroke-linejoin="round"/></svg>` },
      { id: 'kite', label: 'Kite', svg: `<svg ${V}><polygon points="50,12 74,44 50,60 26,44" fill="#4C7DF0"/><polygon points="50,12 50,60 26,44" fill="#3E6FD0"/><polygon points="50,12 74,44 50,60" fill="#6E97F5"/><path d="M50 60 C46 68 54 72 50 80 C46 86 54 90 50 94" stroke="#EF5B5B" stroke-width="3" fill="none"/><polygon points="44,66 56,66 50,72" fill="#F4C430"/></svg>` },
      { id: 'blocks', label: 'Blocks', svg: `<svg ${V}><rect x="20" y="52" width="30" height="30" rx="5" fill="#EF5B5B"/><rect x="52" y="52" width="30" height="30" rx="5" fill="#3FA65B"/><rect x="36" y="20" width="30" height="30" rx="5" fill="#4C7DF0"/><g fill="#fff" opacity="0.7"><circle cx="27" cy="59" r="3"/><circle cx="43" cy="59" r="3"/><circle cx="59" cy="59" r="3"/><circle cx="75" cy="59" r="3"/><circle cx="43" cy="27" r="3"/><circle cx="59" cy="27" r="3"/></g></svg>` },
    ],
  },
  {
    id: 'birthday', label: 'Birthday', emoji: '🎂', items: [
      { id: 'cake', label: 'Cake', svg: `<svg ${V}><rect x="44" y="16" width="4" height="12" fill="#F4C430"/><circle cx="46" cy="14" r="3" fill="#EF8A3B"/><rect x="22" y="46" width="56" height="34" rx="4" fill="#F072A8"/><rect x="22" y="46" width="56" height="10" fill="#FBD3E4"/><path d="M22 52 q9 8 18 0 q9 8 18 0 q9 8 18 0" fill="#fff"/><rect x="18" y="80" width="64" height="8" rx="3" fill="#C64B62"/><g fill="#F4C430"><circle cx="34" cy="66" r="3"/><circle cx="50" cy="72" r="3"/><circle cx="66" cy="66" r="3"/></g></svg>` },
      { id: 'gift', label: 'Gift', svg: `<svg ${V}><rect x="24" y="40" width="52" height="44" rx="4" fill="#9B6BD6"/><rect x="24" y="40" width="52" height="12" fill="#8657C4"/><rect x="44" y="40" width="12" height="44" fill="#F4C430"/><path d="M50 40 C40 40 34 30 40 26 C46 22 50 32 50 40 Z" fill="#F4C430"/><path d="M50 40 C60 40 66 30 60 26 C54 22 50 32 50 40 Z" fill="#F4C430"/></svg>` },
      { id: 'hat', label: 'Party hat', svg: `<svg ${V}><polygon points="50,14 74,78 26,78" fill="#3FB7A6"/><circle cx="50" cy="14" r="5" fill="#F072A8"/><g fill="#F4C430"><circle cx="45" cy="40" r="3"/><circle cx="57" cy="52" r="3"/><circle cx="42" cy="62" r="3"/><circle cx="60" cy="70" r="3"/></g><rect x="22" y="78" width="56" height="7" rx="3" fill="#F072A8"/></svg>` },
      { id: 'balloons', label: 'Balloons', svg: `<svg ${V}><ellipse cx="38" cy="34" rx="18" ry="22" fill="#F072A8"/><ellipse cx="62" cy="40" rx="18" ry="22" fill="#4C7DF0"/><polygon points="35,55 41,55 38,60" fill="#F072A8"/><polygon points="59,61 65,61 62,66" fill="#4C7DF0"/><path d="M38 60 C42 72 34 78 40 92" stroke="#9B9B9B" stroke-width="2.5" fill="none"/><path d="M62 66 C58 76 66 82 60 92" stroke="#9B9B9B" stroke-width="2.5" fill="none"/></svg>` },
    ],
  },
  {
    id: 'christmas', label: 'Christmas', emoji: '🎄', items: [
      { id: 'tree', label: 'Tree', svg: `<svg ${V}><polygon points="50,10 68,38 32,38" fill="#2E8B4F"/><polygon points="50,26 72,58 28,58" fill="#37A05C"/><polygon points="50,44 78,78 22,78" fill="#2E8B4F"/><rect x="44" y="78" width="12" height="12" fill="#8B5E34"/><polygon points="50,6 53,13 60,13 54,17 56,24 50,20 44,24 46,17 40,13 47,13" fill="#F4C430"/><g><circle cx="46" cy="34" r="3" fill="#D8443B"/><circle cx="56" cy="52" r="3" fill="#E0B341"/><circle cx="42" cy="70" r="3" fill="#D8443B"/><circle cx="60" cy="70" r="3" fill="#7FA8D0"/></g></svg>` },
      { id: 'bauble', label: 'Ornament', svg: `<svg ${V}><rect x="45" y="14" width="10" height="8" fill="#C9A24B"/><path d="M44 15 a6 6 0 0 1 12 0" fill="none" stroke="#C9A24B" stroke-width="3"/><circle cx="50" cy="56" r="30" fill="#D8443B"/><path d="M26 48 q24 12 48 0" stroke="#E0B341" stroke-width="4" fill="none"/><path d="M28 64 q22 10 44 0" stroke="#F3ECD8" stroke-width="3" fill="none"/><ellipse cx="40" cy="46" rx="6" ry="9" fill="#EF8A7B" opacity=".5"/></svg>` },
      { id: 'snowflake', label: 'Snowflake', svg: `<svg ${V}><g stroke="#7FA8D0" stroke-width="4" stroke-linecap="round"><path d="M50 14 V86"/><path d="M22 30 L78 70"/><path d="M78 30 L22 70"/><path d="M50 24 L42 32 M50 24 L58 32 M50 76 L42 68 M50 76 L58 68"/><path d="M28 34 L28 44 M28 34 L38 34 M72 66 L72 56 M72 66 L62 66"/><path d="M72 34 L62 34 M72 34 L72 44 M28 66 L38 66 M28 66 L28 56"/></g><circle cx="50" cy="50" r="5" fill="#7FA8D0"/></svg>` },
      { id: 'holly', label: 'Holly', svg: `<svg ${V}><g fill="#2E8B4F"><path d="M50 34 C34 30 26 40 30 52 C40 46 46 46 50 52 C54 46 60 46 70 52 C74 40 66 30 50 34 Z"/><path d="M50 40 C40 48 40 62 50 70 C60 62 60 48 50 40 Z"/></g><g fill="#D8443B"><circle cx="46" cy="60" r="6"/><circle cx="56" cy="62" r="6"/><circle cx="50" cy="52" r="6"/></g></svg>` },
    ],
  },
  {
    id: 'baby', label: 'Baby', emoji: '👶', items: [
      { id: 'pacifier', label: 'Pacifier', svg: `<svg ${V}><circle cx="50" cy="42" r="16" fill="none" stroke="#A7C7E7" stroke-width="7"/><ellipse cx="50" cy="64" rx="20" ry="12" fill="#F4B8C4"/><circle cx="50" cy="64" r="6" fill="#F5E1A4"/><path d="M50 70 C46 78 54 82 50 90" stroke="#F5E1A4" stroke-width="6" fill="none" stroke-linecap="round"/></svg>` },
      { id: 'bottle', label: 'Bottle', svg: `<svg ${V}><path d="M44 12 h12 v6 h-12 z" fill="#F5E1A4"/><path d="M42 18 h16 v6 a6 6 0 0 1 -6 6 h-4 a6 6 0 0 1 -6 -6 z" fill="#F4B8C4"/><rect x="38" y="30" width="24" height="54" rx="10" fill="#A7C7E7"/><rect x="38" y="44" width="24" height="4" fill="#fff" opacity=".7"/><rect x="44" y="36" width="4" height="14" fill="#fff" opacity=".6"/></svg>` },
      { id: 'rattle', label: 'Rattle', svg: `<svg ${V}><circle cx="50" cy="38" r="24" fill="#B5E3C9"/><circle cx="50" cy="38" r="10" fill="#F4B8C4"/><rect x="45" y="60" width="10" height="26" rx="5" fill="#A7C7E7"/><circle cx="50" cy="88" r="7" fill="#F5E1A4"/><circle cx="40" cy="26" r="3" fill="#fff" opacity=".7"/></svg>` },
      { id: 'footprints', label: 'Footprints', svg: `<svg ${V}><g fill="#F4B8C4"><ellipse cx="34" cy="42" rx="11" ry="14"/><circle cx="26" cy="28" r="3"/><circle cx="33" cy="25" r="3.5"/><circle cx="41" cy="27" r="3"/></g><g fill="#A7C7E7"><ellipse cx="64" cy="62" rx="11" ry="14"/><circle cx="56" cy="48" r="3"/><circle cx="63" cy="45" r="3.5"/><circle cx="71" cy="47" r="3"/></g></svg>` },
    ],
  },
];

/** data: URI for an SVG string — used for crisp on-screen thumbnails in the
 *  picker. (The stored FILL uses a rasterized PNG instead — see rasterizeOrnamentPng.) */
export const ornamentDataUri = (svg: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

/** Centered square fit for an ornament inside a slot cell, with breathing-room
 *  padding. Shared by ALL THREE renderers (PageView, Fabric, print) so an
 *  ornament can never desync between them — the ornament analog of qrRect(). */
export function ornamentFit(sx: number, sy: number, sw: number, sh: number, pad = 0.82) {
  const side = Math.min(sw, sh) * pad;
  return { dx: sx + (sw - side) / 2, dy: sy + (sh - side) / 2, side };
}

/** Rasterize an ornament SVG to a crisp square PNG data-URL at pick-time.
 *  Baking width/height=px into the <svg> makes its intrinsic size px, so the
 *  browser rasterizes the VECTOR at full resolution — sidestepping the blurry
 *  "SVG drawn via new Image()→drawImage" bug (see OrnamentFill/QrFill docs).
 *  Called once when the user picks an ornament; the returned PNG is stored in
 *  the fill and drawn identically by every renderer. Rejects on load failure. */
export function rasterizeOrnamentPng(svg: string, px = 1024): Promise<string> {
  const sized = svg.replace('<svg ', `<svg width="${px}" height="${px}" `);
  const src = `data:image/svg+xml;utf8,${encodeURIComponent(sized)}`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = px;
        canvas.height = px;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('no 2d context')); return; }
        ctx.drawImage(img, 0, 0, px, px);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('ornament svg failed to rasterize'));
    img.src = src;
  });
}

/** Look up an ornament by pack + id. null if either is unknown (e.g. a retired
 *  asset in an old album — callers render nothing rather than crash). */
export function findOrnament(pack: string, id: string): OrnamentDef | null {
  const p = ORNAMENT_PACKS.find((x) => x.id === pack);
  return p?.items.find((it) => it.id === id) ?? null;
}

/** All ornaments flattened, tagged with their pack — for pickers/validation. */
export const ALL_ORNAMENTS: Array<OrnamentDef & { pack: OrnamentPackId }> =
  ORNAMENT_PACKS.flatMap((p) => p.items.map((it) => ({ ...it, pack: p.id })));
