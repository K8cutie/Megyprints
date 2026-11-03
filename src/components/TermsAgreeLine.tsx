/* The line under Create Account and Place order: doing it means you agree to
   the Terms and you're 18 or older (a tester, 2026-10-31). A line, not a
   checkbox: no extra tap. */

import { Link } from 'react-router-dom';
import { MIN_AGE } from '../lib/legal';

export default function TermsAgreeLine({ by, onOpen, className = '' }: {
  /** What the button does, as in "By placing an order you agree…". */
  by: string;
  /** Runs as the Terms open (a modal closes itself first). */
  onOpen?: () => void;
  className?: string;
}) {
  return (
    <p className={`text-xs leading-relaxed text-center text-taupe ${className}`} data-testid="terms-agree">
      By {by} you agree to our{' '}
      <Link to="/terms" onClick={onOpen} className="font-medium text-cocoa underline underline-offset-2" data-testid="terms-agree-link">
        Terms of Service
      </Link>{' '}
      and confirm you're {MIN_AGE} or older.
    </p>
  );
}
