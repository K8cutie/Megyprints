/* ══════════════════════════════════════════════════════════════════════════
   THE GOLD "ADD A VIDEO MEMORY" BUTTON (src/editor/core/GoldButton.tsx;
   owner: "we need the golden button for the QR video"), held to the
   website's VideoMemoryButton and its look (src/index.css .memory-shine):
     • the same gold gradient, words' colour, shadow, glow, light sweep and
       timings, read from the website's own stylesheet;
     • it glows and sweeps; with "reduce motion" on, it holds still;
     • the editor shows the video memory tool as this button, in its own row
       just over the page turn.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { GOLD, GoldButton } from '../src/editor/core/GoldButton';
import { editorParts } from '../src/editor/registry';
import { ADD_BUTTON } from '../src/editor/memories/words';
import '../src/editor/parts';

const REPO = path.resolve(__dirname, '..', '..');
const read = (f: string) => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\r\n/g, '\n');
const CSS = read('src/index.css');
const BUTTON = read('src/pages/builder/VideoMemoryButton.tsx');
const SCREEN = read('mobile/src/editor/EditPagesScreen.tsx');
const flat = (style: unknown): Record<string, unknown> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean) as object[]);
/** One rule's text from the website's stylesheet. */
const rule = (selector: string) => {
  const at = CSS.indexOf(`${selector} {`);
  return CSS.slice(at, CSS.indexOf('}', at));
};

describe('the website\'s gold, value for value', () => {
  it('the gradient, the words\' colour, the shadow, the glow and the sweep', () => {
    const shine = rule('.memory-shine');
    expect(shine).toContain(`background: ${GOLD.gradient};`);
    expect(shine).toContain(`color: ${GOLD.text};`);
    expect(shine).toContain(`box-shadow: ${GOLD.shadow};`);
    expect(shine).toContain(`animation: megyMemoryGlow ${GOLD.glowMs / 1000}s ease-in-out infinite;`);
    const after = rule('.memory-shine::after');
    expect(after).toContain(`background: ${GOLD.sweep};`);
    expect(after).toContain(`animation: megyMemorySweep ${GOLD.sweepMs / 1000}s ease-in-out infinite;`);
    expect(CSS).toContain(`50%      { box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55), inset 0 -1px 0 rgba(120, 80, 10, 0.3), ${GOLD.glow}; }`);
    expect(CSS).toContain('35%, 100% { transform: translateX(120%); }');
  });

  it('the words: the website\'s button', () => {
    expect(BUTTON).toContain(`<span>${ADD_BUTTON}</span>`);
    expect(BUTTON).toContain("phone: { button: 'w-full mt-3 h-11 rounded-xl text-[15px] font-bold");
  });
});

describe('the button', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('gold, its words, a tap does what it says; it glows and the light sweeps', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const onPress = jest.fn();
    await render(<GoldButton label={ADD_BUTTON} onPress={onPress} testID="gold" />);
    expect(screen.getByText(ADD_BUTTON)).toBeOnTheScreen();
    expect(flat(screen.getByText(ADD_BUTTON).props.style)).toMatchObject({ color: GOLD.text, fontSize: 15, fontWeight: '700' });
    expect(screen.getByTestId('gold').props.accessibilityRole).toBe('button');
    expect(screen.getByTestId('gold-glow')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('gold'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('with "reduce motion" on: still, no glow or sweep', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await render(<GoldButton label={ADD_BUTTON} onPress={() => {}} testID="gold" />);
    expect(screen.queryByTestId('gold-glow')).toBeNull();
    expect(screen.queryByTestId('gold-sweep')).toBeNull();
    expect(screen.getByText(ADD_BUTTON)).toBeOnTheScreen();
  });
});

describe('in the editor', () => {
  it('the video memory tool is the gold one', () => {
    const tool = editorParts().flatMap((p) => p.tools ?? []).find((t) => t.id === 'memoryVideo')!;
    expect(tool.label).toBe(ADD_BUTTON);
    expect(tool.look).toBe('gold');
  });

  it('its own row, just over the page turn', () => {
    expect(SCREEN).toContain("const goldTools = allTools.filter((t) => t.look === 'gold');");
    const gold = SCREEN.indexOf('{goldTools.map((t) => <GoldButton');
    const turn = SCREEN.indexOf('<View style={styles.turnRow}>');
    expect(gold).toBeGreaterThan(SCREEN.indexOf('{wideTools.map('));
    expect(turn).toBeGreaterThan(gold);
  });
});
