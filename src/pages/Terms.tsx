/* Terms of Service. A tester (2026-10-31): "restrict it to adults only ...
   ensure your terms of service state that all users declare themselves to be
   of legal age". There were no terms at all, only the privacy policy. Written
   in plain words, to match how Megyprints really works; every promise here is
   one the shop already keeps. Reachable at /#/terms. */

import { Link } from 'react-router-dom';
import { LegalPage, LegalSection } from '../components/LegalPage';
import { LEGAL_CONTACT, MIN_AGE } from '../lib/legal';
import { UNPAID_ORDER_DAYS } from '../lib/orderExpiry';

const UPDATED = 'October 2026';

const mail = <a className="text-rust underline" href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>;

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated={UPDATED}>
      <LegalSection title="About these terms">
        <p>
          Megyprints designs and prints photo albums in the Philippines. These terms are the rules
          for using our app and website. By making an account or placing an order, you agree to
          them. Questions? Email us at {mail}.
        </p>
      </LegalSection>

      <LegalSection title={`You must be ${MIN_AGE} or older`}>
        <p data-testid="terms-age">
          To make an account or place an order, you must be <b>{MIN_AGE} years old or older</b>. When
          you make an account or place an order, you confirm that you are.
        </p>
      </LegalSection>

      <LegalSection title="Your photos">
        <p>
          Your photos stay yours. You let us use them only to make, print and deliver your album,
          and to play a QR memory video you add.
        </p>
        <p>
          Only use photos you took yourself or have permission to use. If a photo shows other
          people, make sure they are okay with it being printed.
        </p>
      </LegalSection>

      <LegalSection title="What we won't print">
        <p>Don't add, and we won't print:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>sexual images of anyone under {MIN_AGE}. We report these to the police.</li>
          <li>sexual or explicit pictures</li>
          <li>pictures that are illegal, hateful, or threaten someone</li>
          <li>private photos of someone, used without their permission</li>
          <li>other people's photos or artwork that you don't have the right to use</li>
        </ul>
        <p>We may cancel an order, or close an account, that breaks these rules.</p>
      </LegalSection>

      <LegalSection title="Ordering and paying">
        <ul className="list-disc pl-5 space-y-1">
          <li>Prices are in Philippine pesos. You see the total before you order.</li>
          <li>You pay by InstaPay: scan our QR code with your bank or e-wallet app.</li>
          <li>We start printing after we confirm your payment.</li>
          <li>
            You can cancel an unpaid order yourself, in <Link to="/orders" className="text-rust underline">Your orders</Link>.
            An unpaid order closes by itself after {UNPAID_ORDER_DAYS} days. Your album stays saved.
          </li>
          <li>We deliver to the address you give us in the Philippines.</li>
        </ul>
        <p>
          <b>Check your album before you order.</b> We print it the way you made it: the photos, how
          they are cropped, and every word and its spelling.
        </p>
      </LegalSection>

      <LegalSection title="If something is wrong">
        <p>
          If your album arrives damaged, or it isn't the album you ordered, email {mail} with your
          order number and photos of the problem. We'll work it out with you.
        </p>
      </LegalSection>

      <LegalSection title="QR memory videos">
        <p>
          Anyone who scans the printed QR code can watch its video, so only add videos you are
          happy to share. The same rules as for photos apply. The video stays up for the number of
          years you choose when you order. You can change it or remove it at any time in{' '}
          <Link to="/memories" className="text-rust underline">My Memories</Link>.
        </p>
      </LegalSection>

      <LegalSection title="Words written by AI">
        <p>
          Some lines in your album can be written by AI, like the line Megy writes for a photo. AI
          can get things wrong. Read every line before you order, and change any you don't like.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <p>
          Keep your password to yourself. You are responsible for what is done with your account.
          You can delete your account at any time in <b>My Profile</b>. Our{' '}
          <Link to="/privacy" className="text-rust underline">Privacy Policy</Link> says what that
          deletes and what we must keep.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          We may update these terms. When we do, we change the "Last updated" date above. If you keep
          using Megyprints after that, the new terms apply.
        </p>
      </LegalSection>

      <LegalSection title="Law">
        <p>These terms follow the laws of the Philippines.</p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>Email {mail} or reach us through the <Link to="/contact" className="text-rust underline">Contact page</Link>.</p>
      </LegalSection>
    </LegalPage>
  );
}
