/* The look the Privacy Policy and the Terms of Service share. */

import type { ReactNode } from 'react';

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-cream pt-24 pb-16 px-6">
      <div className="max-w-[760px] mx-auto">
        <h1 className="font-display text-3xl font-semibold text-dark mb-1">{title}</h1>
        <p className="text-sm text-stone mb-8">Last updated: {updated}</p>
        {children}
      </div>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-display text-xl font-semibold text-dark mb-2">{title}</h2>
      <div className="text-[15px] leading-relaxed text-[#5B534C] space-y-2">{children}</div>
    </section>
  );
}
