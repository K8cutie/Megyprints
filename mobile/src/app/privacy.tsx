/* The Privacy Policy, a screen of the app (src/lib/legal.ts says why). The
   words are the website's, shared (src/lib/legalPages.ts). */
import { PRIVACY_POLICY } from '@web/lib/legalPages';
import { LegalDocumentView } from '../components/LegalDocumentView';

export default function Privacy() {
  return <LegalDocumentView doc={PRIVACY_POLICY} testID="privacy" />;
}
