/* The Return and Refund Policy, a screen of the app (src/lib/legal.ts says
   why). The words are the website's, shared (src/lib/legalPages.ts). */
import { REFUND_POLICY } from '@web/lib/legalPages';
import { LegalDocumentView } from '../components/LegalDocumentView';

export default function Refund() {
  return <LegalDocumentView doc={REFUND_POLICY} testID="refund" />;
}
