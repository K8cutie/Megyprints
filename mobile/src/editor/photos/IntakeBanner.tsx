/* The photos picked on a trip from the editor to the phone's photos go into
   the album when the editor is on top again (intake.ts). A banner that draws
   nothing: it is where the editor's screen lets a part run on focus. Loaded
   by index.ts only when it is shown, because the Photos step's list
   (draftStore) needs the phone's storage, which tests don't have. */
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { inspectPhotos } from '../../../modules/photo-files';
import { useDraft } from '../../lib/draftStore';
import type { EditorContext } from '../registry';
import { addPickedPhotos, intakeLeaving, takeIntake } from './intake';

export function IntakeBanner({ ctx }: { ctx: EditorContext }) {
  const { peek } = useDraft();
  const latest = useRef(ctx);
  latest.current = ctx;
  useFocusEffect(useCallback(() => {
    const trip = takeIntake();
    if (trip?.before) {
      const before = trip.before;
      void (async () => {
        let line: string | null = null;
        try {
          line = await addPickedPhotos(latest.current.builder, peek().photos, before, inspectPhotos);
        } catch (e) {
          console.warn('Could not add the photos', e);
        }
        if (line) latest.current.say(line);
        if (trip.reopen) latest.current.openSheet(trip.reopen.id, trip.reopen.params);
      })();
    }
    return () => intakeLeaving(() => new Set(peek().photos.map((p) => p.key)));
  }, [peek]));
  return null;
}
