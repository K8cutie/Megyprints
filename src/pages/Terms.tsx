/* Terms of Service. A tester (2026-10-31): "restrict it to adults only ...
   ensure your terms of service state that all users declare themselves to be
   of legal age". There were no terms at all, only the privacy policy. Written
   in plain words, to match how Megyprints really works; every promise here is
   one the shop already keeps. Reachable at /#/terms. The words are in
   src/lib/legalPages.ts, shared with the 2.0 app, which shows them as its own
   screen. */

import { LegalDocumentPage } from '../components/LegalPage';
import { TERMS_OF_SERVICE } from '../lib/legalPages';

export default function Terms() {
  return <LegalDocumentPage doc={TERMS_OF_SERVICE} />;
}
