/* Privacy policy — required for the Google Play listing and generally good
   practice. Written to match how Megyprints ACTUALLY handles data (see the
   photos-are-local architecture). Reachable at /#/privacy. The words are in
   src/lib/legalPages.ts, shared with the 2.0 app, which shows them as its own
   screen. */

import { LegalDocumentPage } from '../components/LegalPage';
import { PRIVACY_POLICY } from '../lib/legalPages';

export default function Privacy() {
  return <LegalDocumentPage doc={PRIVACY_POLICY} />;
}
