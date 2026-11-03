/* The payment step's small marks (the website's PayCard uses lucide's
   Landmark, Smartphone, ScanLine, Banknote, Paperclip and Copy), drawn with
   plain views as the start screen's are (home/homeIcons.tsx: the app has no
   icon library, and adds none). Pictures only: a screen reader skips them. */
import { View } from 'react-native';

const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

/** A bank: a roof, three columns, a step. */
export function BankMark({ size, color }: { size: number; color: string }) {
  const s = size;
  const col = { position: 'absolute' as const, top: s * 0.42, width: s * 0.12, height: s * 0.34, backgroundColor: color, borderRadius: 1 };
  return (
    <View {...hidden} style={{ width: s, height: s }}>
      <View style={{ position: 'absolute', left: s * 0.21, top: s * 0.1, width: s * 0.58, height: s * 0.58, borderTopWidth: s * 0.1, borderLeftWidth: s * 0.1, borderColor: color, transform: [{ scaleY: 0.55 }, { rotate: '45deg' }] }} />
      <View style={[col, { left: s * 0.18 }]} />
      <View style={[col, { left: s * 0.44 }]} />
      <View style={[col, { left: s * 0.7 }]} />
      <View style={{ position: 'absolute', left: s * 0.1, top: s * 0.8, width: s * 0.8, height: s * 0.1, backgroundColor: color, borderRadius: 1 }} />
    </View>
  );
}

/** A phone. */
export function PhoneMark({ size, color }: { size: number; color: string }) {
  const s = size;
  return (
    <View {...hidden} style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: s * 0.56, height: s * 0.9, borderWidth: s * 0.1, borderColor: color, borderRadius: s * 0.14, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: s * 0.06 }}>
        <View style={{ width: s * 0.14, height: s * 0.07, borderRadius: s * 0.04, backgroundColor: color }} />
      </View>
    </View>
  );
}

/** Scanning: four corners and the line across. */
export function ScanMark({ size, color }: { size: number; color: string }) {
  const s = size;
  const w = s * 0.1;
  const corner = (top: boolean, left: boolean) => (
    <View style={{
      position: 'absolute', width: s * 0.3, height: s * 0.3, borderColor: color,
      [top ? 'top' : 'bottom']: s * 0.06, [left ? 'left' : 'right']: s * 0.06,
      [top ? 'borderTopWidth' : 'borderBottomWidth']: w, [left ? 'borderLeftWidth' : 'borderRightWidth']: w,
    }} />
  );
  return (
    <View {...hidden} style={{ width: s, height: s }}>
      {corner(true, true)}{corner(true, false)}{corner(false, true)}{corner(false, false)}
      <View style={{ position: 'absolute', left: s * 0.2, right: s * 0.2, top: (s - w) / 2, height: w, backgroundColor: color, borderRadius: w / 2 }} />
    </View>
  );
}

/** A banknote: a note with its round middle. */
export function NoteMark({ size, color }: { size: number; color: string }) {
  const s = size;
  return (
    <View {...hidden} style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: s * 0.92, height: s * 0.6, borderWidth: s * 0.1, borderColor: color, borderRadius: s * 0.08, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: s * 0.24, height: s * 0.24, borderRadius: s * 0.12, borderWidth: s * 0.08, borderColor: color }} />
      </View>
    </View>
  );
}

/** A paperclip: a long loop with a shorter one inside, on a slant. */
export function ClipMark({ size, color }: { size: number; color: string }) {
  const s = size;
  return (
    <View {...hidden} style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: s * 0.36, height: s * 0.86, borderWidth: s * 0.09, borderColor: color, borderRadius: s * 0.18, alignItems: 'center', paddingTop: s * 0.14, transform: [{ rotate: '40deg' }] }}>
        <View style={{ width: s * 0.06, height: s * 0.4, backgroundColor: color, borderRadius: s * 0.03 }} />
      </View>
    </View>
  );
}

/** Copy: two sheets, one over the other. */
export function CopyMark({ size, color }: { size: number; color: string }) {
  const s = size;
  const sheet = { position: 'absolute' as const, width: s * 0.6, height: s * 0.6, borderWidth: s * 0.11, borderColor: color, borderRadius: s * 0.12 };
  return (
    <View {...hidden} style={{ width: s, height: s }}>
      <View style={[sheet, { left: s * 0.08, top: s * 0.08 }]} />
      <View style={[sheet, { left: s * 0.32, top: s * 0.32, backgroundColor: '#F6E7DF' }]} />
    </View>
  );
}
