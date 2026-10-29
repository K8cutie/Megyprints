/* ══════════════════════════════════════════════════════════════════════════
   WHAT THE EDIT PAGES SCREEN OFFERS ITSELF (the 'core' part).

   • "Add to this box" (the website's SlotChooser on a phone): the sheet an
     empty frame or caption box opens. Its lines come from the parts
     (registry addChoices: photos adds "Add Photo", text adds "Add Quote"
     and "Your Text"), in the website's order.
   • A retired graphic or sticker (RemoveGraphicModal): placed ones still
     print, and a tap offers the one thing still possible, taking it off
     (setOrnamentFill / setTextSlotOrnament / removeSticker: one undo step
     each, as on the website).
   ══════════════════════════════════════════════════════════════════════════ */
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { colors, space } from '../../lib/theme';
import type { Target } from '../hitTest';
import { addChoicesFor, registerEditorPart, type SheetProps } from '../registry';
import { ADD_TO_THIS_BOX, KEEP_IT, REMOVE, RETIRED_COPY } from '../editorWords';
import { EditorSheet, SheetChoice } from './EditorSheet';

function AddToBoxSheet({ ctx, params, close }: SheetProps<{ target: Target }>) {
  const { target } = params;
  const choices = addChoicesFor(target.kind);
  return (
    <EditorSheet title={ADD_TO_THIS_BOX} onClose={close} testID="edit-add-sheet">
      {choices.map((c) => (
        <SheetChoice key={c.id} label={c.label} desc={c.desc} testID={`edit-add-${c.id}`}
          // Closed first: a choice may open its own sheet next.
          onPress={() => { close(); c.onPick(target, ctx); }} />
      ))}
    </EditorSheet>
  );
}

function RetiredSheet({ ctx, params, close }: SheetProps<{ target: Target }>) {
  const { target } = params;
  const copy = target.kind === 'sticker' ? RETIRED_COPY.sticker : RETIRED_COPY.graphic;
  const remove = () => {
    const { builder, pageIndex } = ctx;
    if (target.kind === 'slotGraphic') builder.setOrnamentFill(target.index, null, pageIndex);
    else if (target.kind === 'boxGraphic') builder.setTextSlotOrnament(target.index, null, pageIndex);
    else if (target.kind === 'sticker' && target.stickerId) builder.removeSticker(target.stickerId);
    ctx.select(null);
    close();
  };
  return (
    <EditorSheet title={copy.title} onClose={close} testID="edit-retired-sheet">
      <Text style={styles.body}>{copy.body}</Text>
      <View style={styles.row}>
        <Button label={KEEP_IT} kind="plain" onPress={close} style={styles.flex} testID="edit-retired-keep" />
        <Button label={REMOVE} onPress={remove} style={[styles.flex, styles.remove]} testID="edit-retired-remove" />
      </View>
    </EditorSheet>
  );
}

registerEditorPart({
  id: 'core',
  sheets: { add: AddToBoxSheet, retired: RetiredSheet },
  taps: [{
    kinds: ['slotGraphic', 'boxGraphic', 'sticker'],
    order: 1000,
    onTap(target, ctx) {
      ctx.select(target);
      ctx.openSheet('core:retired', { target });
      return true;
    },
  }],
});

const styles = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 20, color: colors.muted },
  row: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  flex: { flex: 1 },
  remove: { backgroundColor: colors.bad },
});
