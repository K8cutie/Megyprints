/* "Write a line for this photo" on the phone's real pieces (photoQuotes.ts
   takes them handed in, so tests never reach the live endpoint): the
   signed-in account's token from the app's Supabase sign-in, each photo as a
   512 px upright sRGB JPEG made by the phone (modules/photo-files
   drawableCopy) into the app's cache, and fetch. */
import { Directory, File, Paths } from 'expo-file-system';
import { drawableCopy } from '../../../modules/photo-files';
import { hashText } from '../../builder/pageImages';
import { PHOTO_QUOTE_PX, type PhotoQuoteDeps } from './photoQuotes';

const FOLDER = 'megy-quote-copies';

function folder(): Directory {
  const d = new Directory(Paths.cache, FOLDER);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

export const appPhotoQuoteDeps: PhotoQuoteDeps = {
  async token() {
    // Loaded when first asked, not with the editor: the sign-in keeps its
    // session in AsyncStorage, a native module the editor's tests don't have.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require('../../lib/supabase') as typeof import('../../lib/supabase');
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },
  async shrink(uri) {
    const copy = new File(folder(), `${hashText(uri)}-${PHOTO_QUOTE_PX}.jpg`);
    if (!copy.exists) {
      const made = await drawableCopy(uri, copy.uri, PHOTO_QUOTE_PX);
      if (!made) throw new Error('this build cannot make photo copies');
    }
    try {
      return copy.base64Sync();
    } finally {
      // Sent once and not kept (the website keeps nothing either).
      try { copy.delete(); } catch { /* the phone clears its cache itself */ }
    }
  },
  fetch: (url, init) => fetch(url, init),
};
