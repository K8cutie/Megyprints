/* Return and Refund Policy. PayMongo asks for one on the website before it
   turns payments on (owner's handoff, 2026-11-25). Reachable at /#/refund.
   The words are in src/lib/legalPages.ts, shared with the 2.0 app, which
   shows them as its own screen. */

import { LegalDocumentPage } from '../components/LegalPage';
import { REFUND_POLICY } from '../lib/legalPages';

export default function Refund() {
  return <LegalDocumentPage doc={REFUND_POLICY} />;
}
