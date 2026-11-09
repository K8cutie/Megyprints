/* The look the Privacy Policy and the Terms of Service share, and the page
   drawn from their words (src/lib/legalPages.ts: the same words the 2.0 app
   shows as its own screens). */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LegalDocument, LegalLinkTo, LegalRun } from '../lib/legalPages';
import { LEGAL_CONTACT } from '../lib/legal';

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

const LINK = 'text-rust underline';

/** The website's routes for the pages the words link to. */
const ROUTES: Record<Exclude<LegalLinkTo, 'email' | 'deletion-page'>, string> = {
  privacy: '/privacy',
  terms: '/terms',
  orders: '/orders',
  memories: '/memories',
  contact: '/contact',
};

function Run({ run }: { run: LegalRun }) {
  if (typeof run === 'string') return <>{run}</>;
  if ('bold' in run) return <b>{run.bold}</b>;
  if (run.link === 'email') return <a className={LINK} href={`mailto:${LEGAL_CONTACT}`}>{run.text}</a>;
  if (run.link === 'deletion-page') return <a className={LINK} href="/delete-account.html">{run.text}</a>;
  return <Link to={ROUTES[run.link]} className={LINK}>{run.text}</Link>;
}

const Runs = ({ runs }: { runs: LegalRun[] }) => <>{runs.map((r, i) => <Run key={i} run={r} />)}</>;

/** A whole legal page from its words. */
export function LegalDocumentPage({ doc }: { doc: LegalDocument }) {
  return (
    <LegalPage title={doc.title} updated={doc.updated}>
      {doc.sections.map((s) => (
        <LegalSection key={s.title} title={s.title}>
          {s.blocks.map((block, i) => block.kind === 'paragraph'
            ? <p key={i} data-testid={block.testId}><Runs runs={block.runs} /></p>
            : (
              <ul key={i} className="list-disc pl-5 space-y-1">
                {block.items.map((item, j) => <li key={j}><Runs runs={item} /></li>)}
              </ul>
            ))}
        </LegalSection>
      ))}
    </LegalPage>
  );
}
