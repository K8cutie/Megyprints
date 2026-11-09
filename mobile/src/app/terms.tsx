/* The Terms of Service, a screen of the app (src/lib/legal.ts says why). The
   words are the website's, shared (src/lib/legalPages.ts). */
import { TERMS_OF_SERVICE } from '@web/lib/legalPages';
import { LegalDocumentView } from '../components/LegalDocumentView';

export default function Terms() {
  return <LegalDocumentView doc={TERMS_OF_SERVICE} testID="terms" />;
}
