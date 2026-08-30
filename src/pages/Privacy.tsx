/* Privacy policy — required for the Google Play listing and generally good
   practice. Written to match how Megyprints ACTUALLY handles data (see the
   photos-are-local architecture). Reachable at /#/privacy. */

import type { ReactNode } from 'react';

const UPDATED = 'August 2026';
const CONTACT = 'megyprints@gmail.com';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-display text-xl font-semibold text-[#2D2D2D] mb-2">{title}</h2>
      <div className="text-[15px] leading-relaxed text-[#5B534C] space-y-2">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#FFF8F0] pt-24 pb-16 px-6">
      <div className="max-w-[760px] mx-auto">
        <h1 className="font-display text-3xl font-semibold text-[#2D2D2D] mb-1">Privacy Policy</h1>
        <p className="text-sm text-[#9B8B7A] mb-8">Last updated: {UPDATED}</p>

        <Section title="Who we are">
          <p>
            Megyprints is a photo-album design and printing service. This policy explains what
            information we collect when you use our app and website, how we use it, and the choices
            you have. Questions? Email us at <a className="text-[#BF5E3E] underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
        </Section>

        <Section title="Your photos stay on your device">
          <p>
            While you design an album, <b>your photos are stored only on your own device</b> (in your
            browser's local storage). They are <b>not</b> uploaded to our servers during design.
          </p>
          <p>
            When you place an order, a print-ready file of your finished album — which includes the
            photos you placed — is generated on your device and uploaded to our secure, private
            storage so that we can print and ship it. Only our fulfillment team can access this file,
            and it is used solely to produce and deliver your album.
          </p>
        </Section>

        <Section title="Information we collect">
          <ul className="list-disc pl-5 space-y-1">
            <li><b>Account details</b> — your email address (including if you sign in with Google), so you can save albums and manage your orders.</li>
            <li><b>Order &amp; delivery details</b> — your name, contact number, and shipping address, used to deliver your album.</li>
            <li><b>Living-memory QR links</b> — if you attach a video to an album, we store that link so the printed QR code can open it. You can re-point or remove it anytime.</li>
            <li><b>Basic technical data</b> — anonymous error and performance diagnostics that help us keep the app working.</li>
          </ul>
        </Section>

        <Section title="How we use your information">
          <ul className="list-disc pl-5 space-y-1">
            <li>To produce, print, and ship the albums you order.</li>
            <li>To create and manage your account and order history.</li>
            <li>To respond to your questions and provide support.</li>
            <li>To operate, secure, and improve the service.</li>
          </ul>
          <p>We do <b>not</b> sell your personal information or your photos.</p>
        </Section>

        <Section title="Service providers we rely on">
          <p>We use a small number of trusted providers to run Megyprints:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><b>Supabase</b> — secure database, private file storage, and sign-in.</li>
            <li><b>Vercel</b> — hosting for the app and website.</li>
            <li><b>Google</b> — optional "Sign in with Google."</li>
          </ul>
          <p>These providers process data only to provide their service to us.</p>
        </Section>

        <Section title="Payment">
          <p>
            Payment is currently handled by bank transfer or cash on delivery. We do <b>not</b>
            collect or store your card details in the app.
          </p>
        </Section>

        <Section title="Deleting your account">
          <p>
            You can delete your account and its data at any time, two ways:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <b>In the app</b> — <b>My Profile → Delete my account</b>. It happens immediately.
            </li>
            <li>
              <b>By asking us</b> — email <a className="text-[#BF5E3E] underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>,
              or use the <a className="text-[#BF5E3E] underline" href="/delete-account.html">account deletion page</a>.
              We complete it within 30 days.
            </li>
          </ul>
          <p>
            Deleting removes your sign-in and profile, every album and the photos in it, your QR
            memory links (printed codes stop working), the print files from your past orders, and
            the name, phone number and address on those orders.
          </p>
          <p>
            <b>What we keep:</b> if you've ordered before, we keep a receipt-only record of that
            sale — order number, amount, status and dates, and the album's size, material and page
            count — because Philippine tax and accounting rules require a business to keep records
            of its sales. That record carries no name, phone number, address or photos, and is no
            longer linked to you.
          </p>
          <p>
            One exception: if an order is paid but not yet delivered, we still need your delivery
            details to finish it, so the account can't be deleted until it arrives — or until you
            ask us to cancel the order.
          </p>
          <p>
            Otherwise we keep your account and order information for as long as your account is
            active or as needed to fulfill and support your orders.
          </p>
        </Section>

        <Section title="Children">
          <p>Megyprints is not directed to children under 13, and we do not knowingly collect their personal information.</p>
        </Section>

        <Section title="Security">
          <p>
            The app is served over HTTPS, order files live in private storage with access limited to
            our fulfillment team, and access is controlled at the database level. No method of storage
            is perfectly secure, but we take reasonable steps to protect your information.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>We may update this policy from time to time. When we do, we'll change the "Last updated" date above.</p>
        </Section>

        <Section title="Contact">
          <p>
            For any privacy questions or requests, email <a className="text-[#BF5E3E] underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> or reach us via the Contact page.
          </p>
        </Section>
      </div>
    </div>
  );
}
