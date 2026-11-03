import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

/* Only REAL ways to reach us (1-star testers, 2026-10-04: on the thank-you
   page, just after paying, the footer said "123 Main St, City" and
   "(555) 123-4567"; the email's domain doesn't exist, the social icons went
   nowhere and Subscribe did nothing). Put a real page here (and import its
   lucide icon) and the icon shows; until then none does. */
const SOCIAL_LINKS: { label: string; href: string; icon: LucideIcon }[] = [
  // { label: 'Facebook', href: 'https://facebook.com/<page>', icon: Facebook },
];

const quickLinks = [
  { label: 'Home', path: '/' },
  { label: 'Events', path: '/events' },
  { label: 'About', path: '/about' },
  { label: 'Contact', path: '/contact' },
];

export default function Footer() {
  return (
    <footer className="bg-charcoal text-white">
      <div className="max-w-[1280px] mx-auto px-6 md:px-12 lg:px-16 pt-16 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10 lg:gap-8">
          {/* Column 1: Brand */}
          <div>
            <Link to="/" className="flex items-center gap-0.5 select-none mb-4">
              <span className="font-display italic text-[1.25rem] font-semibold text-white">
                Megy
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-peach mx-0.5 mt-1.5" />
              <span className="font-body text-[1.1rem] font-medium text-white">
                Prints
              </span>
            </Link>
            <p className="font-body text-sm text-light leading-relaxed mb-6">
              Turning your memories into keepsakes. Beautiful photo albums, designed with love.
            </p>
            {SOCIAL_LINKS.length > 0 && (
              <div className="flex items-center gap-4">
                {SOCIAL_LINKS.map(({ label, href, icon: Icon }) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                    className="text-light hover:text-peach transition-colors duration-200" aria-label={label}>
                    <Icon size={20} />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Column 2: Quick Links */}
          <div>
            <h4 className="font-body text-sm font-semibold uppercase tracking-wider mb-4">
              Quick Links
            </h4>
            <ul className="space-y-2.5">
              {quickLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.path}
                    className="font-body text-sm text-light hover:text-white transition-colors duration-200"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Contact */}
          <div>
            <h4 className="font-body text-sm font-semibold uppercase tracking-wider mb-4">
              Contact
            </h4>
            <ul className="space-y-2.5" data-testid="footer-contact">
              <li>
                <Link to="/contact" className="font-body text-sm text-white hover:text-peach transition-colors duration-200">Send us a message</Link>
                <p className="font-body text-xs text-light mt-0.5">We reply within a day, Mon–Sat.</p>
              </li>
              <li>
                <Link to="/orders" className="font-body text-sm text-white hover:text-peach transition-colors duration-200">Check on your order</Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-medium mt-12 pt-6">
          <p className="font-body text-sm text-light text-center">
            &copy; {new Date().getFullYear()} Megy Prints. All rights reserved.
          </p>
          {/* Google Play wants the privacy policy reachable inside the app too;
              the app shows this footer (owner, 2026-10-28). The terms sit
              beside it (a tester, 2026-10-31). */}
          <p className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1">
            <Link to="/privacy" className="font-body text-sm text-white underline underline-offset-2 hover:text-peach transition-colors duration-200" data-testid="footer-privacy">
              Privacy Policy
            </Link>
            <Link to="/terms" className="font-body text-sm text-white underline underline-offset-2 hover:text-peach transition-colors duration-200" data-testid="footer-terms">
              Terms of Service
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
