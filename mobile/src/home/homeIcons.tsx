/* The start screen's small marks, drawn with plain views (the app has no
   icon library, and adds none): the website's lucide icons and its home
   pictures' sparkles, at the sizes the website draws them. Pictures only:
   a screen reader skips them. */
import { View, type StyleProp, type ViewStyle } from 'react-native';

const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

/** The website's four-point sparkle: two thin diamonds crossed. */
export function Sparkle({ size, color, style }: { size: number; color: string; style?: StyleProp<ViewStyle> }) {
  const side = size / Math.SQRT2;
  const diamond = (squash: 'x' | 'y'): ViewStyle => ({
    position: 'absolute', left: (size - side) / 2, top: (size - side) / 2, width: side, height: side, backgroundColor: color,
    transform: [squash === 'x' ? { scaleX: 0.36 } : { scaleY: 0.36 }, { rotate: '45deg' }],
  });
  return (
    <View {...hidden} style={[{ width: size, height: size }, style]}>
      <View style={diamond('x')} />
      <View style={diamond('y')} />
    </View>
  );
}

/** An arrow pointing up (the upload circle). */
export function ArrowUp({ size, color, stroke = 2.8 }: { size: number; color: string; stroke?: number }) {
  const head = size * 0.42;
  return (
    <View {...hidden} style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', left: (size - stroke) / 2, top: size * 0.2, width: stroke, height: size * 0.62, borderRadius: stroke / 2, backgroundColor: color }} />
      <View style={{ position: 'absolute', left: (size - head) / 2, top: size * 0.2, width: head, height: head, borderTopWidth: stroke, borderLeftWidth: stroke, borderColor: color, borderTopLeftRadius: stroke / 2, transform: [{ rotate: '45deg' }] }} />
    </View>
  );
}

/** A tick. */
export function Tick({ size, color, stroke }: { size: number; color: string; stroke: number }) {
  return (
    <View {...hidden} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.62, height: size * 0.34, marginTop: -size * 0.12, borderLeftWidth: stroke, borderBottomWidth: stroke, borderColor: color, transform: [{ rotate: '-45deg' }] }} />
    </View>
  );
}

/** A delivery truck, facing right (16 px, the website's TruckChip). */
export function Truck({ color }: { color: string }) {
  const line = 1.5;
  return (
    <View {...hidden} style={{ width: 16, height: 16 }}>
      <View style={{ position: 'absolute', left: 1.5, top: 4.2, width: 8, height: 7.2, borderWidth: line, borderColor: color, borderRadius: 1 }} />
      <View style={{ position: 'absolute', left: 8.8, top: 6.4, width: 5.6, height: 5, borderWidth: line, borderColor: color, borderTopRightRadius: 3, borderBottomRightRadius: 1 }} />
      <View style={{ position: 'absolute', left: 3.2, top: 10.6, width: 3.6, height: 3.6, borderRadius: 1.8, borderWidth: line, borderColor: color, backgroundColor: '#FFFFFF' }} />
      <View style={{ position: 'absolute', left: 9.8, top: 10.6, width: 3.6, height: 3.6, borderRadius: 1.8, borderWidth: line, borderColor: color, backgroundColor: '#FFFFFF' }} />
    </View>
  );
}

/** A calendar (the "Book your event" button). */
export function Calendar({ size, color }: { size: number; color: string }) {
  const line = 2;
  return (
    <View {...hidden} style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', left: size * 0.1, top: size * 0.18, width: size * 0.8, height: size * 0.72, borderWidth: line, borderColor: color, borderRadius: 3 }} />
      <View style={{ position: 'absolute', left: size * 0.1, top: size * 0.4, width: size * 0.8, height: line, backgroundColor: color }} />
      <View style={{ position: 'absolute', left: size * 0.3, top: size * 0.06, width: line, height: size * 0.22, borderRadius: 1, backgroundColor: color }} />
      <View style={{ position: 'absolute', left: size * 0.7 - line, top: size * 0.06, width: line, height: size * 0.22, borderRadius: 1, backgroundColor: color }} />
      <View style={{ position: 'absolute', left: size * 0.5 - 2.5, top: size * 0.56, width: 5, height: 5, borderRadius: 1, backgroundColor: color, transform: [{ rotate: '45deg' }] }} />
    </View>
  );
}

/** The menu button's three lines (the website's lucide Menu, 24 px). */
export function MenuBars({ color }: { color: string }) {
  const bar: ViewStyle = { width: 20, height: 2.2, borderRadius: 1.1, backgroundColor: color };
  return (
    <View {...hidden} style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center', gap: 4.6 }}>
      <View style={bar} /><View style={bar} /><View style={bar} />
    </View>
  );
}

/** A cross (closes the menu). */
export function Cross({ color }: { color: string }) {
  const bar = (deg: string): ViewStyle => ({ position: 'absolute', left: 2, top: 10.9, width: 20, height: 2.2, borderRadius: 1.1, backgroundColor: color, transform: [{ rotate: deg }] });
  return (
    <View {...hidden} style={{ width: 24, height: 24 }}>
      <View style={bar('45deg')} /><View style={bar('-45deg')} />
    </View>
  );
}
