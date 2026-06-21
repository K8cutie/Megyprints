import { Link } from "react-router-dom";
import { ShieldCheck, Lock } from "lucide-react";

export default function Privacy() {
  return (
    <div className="container max-w-3xl py-12">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
          <ShieldCheck className="size-3.5" /> Your privacy matters
        </div>
        <h1 className="mt-3 text-4xl font-extrabold">Privacy Policy</h1>
        <p className="mt-2 text-muted-foreground">Last updated: 21 June 2026</p>
      </div>

      <div className="space-y-8 text-foreground/85 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground [&_p]:mt-2 [&_li]:mt-1">
        <p>
          Yayamove ("we", "us") respects your privacy and complies with the
          <strong> Philippine Data Privacy Act of 2012 (RA 10173)</strong>. This policy
          explains what we collect, why, and the rights you have over your data.
        </p>

        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
          <p className="flex items-center gap-2 font-bold text-brand-800">
            <Lock className="size-4" /> Sensitive documents (NBI clearance)
          </p>
          <p className="text-sm text-brand-900/80">
            Your NBI clearance is stored in a <strong>private, access-controlled</strong>
            {" "}bucket — never shown publicly. It is viewable only by you and our
            verification team, accessed through short-lived signed links, and used solely
            to verify your identity. You may withdraw consent and request deletion anytime.
          </p>
        </div>

        <section>
          <h2>What we collect</h2>
          <ul className="ml-5 list-disc">
            <li><strong>Account:</strong> name, email, mobile number.</li>
            <li><strong>Provider profile:</strong> skills, work experience, certificates, service area, rates.</li>
            <li><strong>Verification:</strong> your uploaded NBI clearance (sensitive personal information).</li>
            <li><strong>Activity:</strong> jobs, bookings, messages, and reviews you create.</li>
            <li><strong>Location:</strong> the city you choose, or — only if you allow it — your device location to show nearby pros.</li>
          </ul>
        </section>

        <section>
          <h2>How we use it</h2>
          <p>To run the marketplace: match seekers with pros, verify identities, enable
          messaging and bookings, and keep the platform safe. We do not sell your data.</p>
        </section>

        <section>
          <h2>Your rights (RA 10173)</h2>
          <ul className="ml-5 list-disc">
            <li>Access and obtain a copy of your data.</li>
            <li>Correct inaccurate data.</li>
            <li><strong>Erasure</strong> — delete your account and personal data.</li>
            <li>Withdraw consent for processing your NBI clearance.</li>
            <li>Object to processing and file a complaint with the National Privacy Commission.</li>
          </ul>
          <p>
            Exercise any of these from your{" "}
            <Link to="/account" className="font-semibold text-brand-700 hover:underline">Account &amp; privacy</Link>{" "}
            settings, or email <span className="font-medium">privacy@yayamove.ph</span>.
          </p>
        </section>

        <section>
          <h2>Retention &amp; security</h2>
          <p>We keep your data only as long as your account is active or as required by law.
          Data is encrypted in transit and at rest; sensitive documents live in private
          storage with row-level access control.</p>
        </section>

        <p className="text-sm text-muted-foreground">
          This template is provided for development and is not legal advice — have it
          reviewed by counsel before launch.
        </p>
      </div>
    </div>
  );
}
