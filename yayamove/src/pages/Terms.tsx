import { FileText } from "lucide-react";

export default function Terms() {
  return (
    <div className="container max-w-3xl py-12">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
          <FileText className="size-3.5" /> The rules of the road
        </div>
        <h1 className="mt-3 text-4xl font-extrabold">Terms of Service</h1>
        <p className="mt-2 text-muted-foreground">Last updated: 21 June 2026</p>
      </div>

      <div className="space-y-6 text-foreground/85 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground [&_p]:mt-2 [&_li]:mt-1">
        <p>Welcome to Yayamove. By using the platform you agree to these terms.</p>

        <section>
          <h2>1. What Yayamove is</h2>
          <p>Yayamove is a marketplace that connects households ("seekers") with independent
          service providers ("pros"). We are <strong>not</strong> the employer of pros and do
          not perform the services ourselves. Pros are independent contractors.</p>
        </section>

        <section>
          <h2>2. Accounts</h2>
          <p>You must provide accurate information and keep your password secure. You're
          responsible for activity under your account. You must be 18+ to use Yayamove.</p>
        </section>

        <section>
          <h2>3. Verification</h2>
          <p>Pros may submit an NBI clearance for verification. A verified badge indicates we
          reviewed a submitted document; it is <strong>not a guarantee</strong> of conduct or
          quality. Always use your own judgment when hiring.</p>
        </section>

        <section>
          <h2>4. Bookings &amp; payments</h2>
          <p>Seekers and pros agree on scope and price directly. Until in-app payments launch,
          payment is arranged between the two parties. Yayamove is not liable for off-platform
          transactions.</p>
        </section>

        <section>
          <h2>5. Conduct</h2>
          <ul className="ml-5 list-disc">
            <li>No fraud, harassment, or misrepresentation.</li>
            <li>No posting of false reviews or fake profiles.</li>
            <li>No illegal services.</li>
          </ul>
          <p>We may suspend accounts that violate these terms.</p>
        </section>

        <section>
          <h2>6. Liability</h2>
          <p>Yayamove is provided "as is". To the extent permitted by law, we're not liable for
          disputes, damages, or losses arising from services arranged through the platform.</p>
        </section>

        <section>
          <h2>7. Changes</h2>
          <p>We may update these terms; we'll note the date above. Continued use means you accept
          the changes.</p>
        </section>

        <p className="text-sm text-muted-foreground">
          This template is provided for development and is not legal advice — have it reviewed by
          counsel before launch.
        </p>
      </div>
    </div>
  );
}
