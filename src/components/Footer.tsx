import { Link } from 'react-router-dom';
import { Facebook, Instagram, Twitter } from 'lucide-react';

const quickLinks = [
  { label: 'Home', path: '/' },
  { label: 'Templates', path: '/templates' },
  { label: 'About', path: '/about' },
  { label: 'Contact', path: '/contact' },
];

const templateLinks = [
  { label: 'Graduation', path: '/templates' },
  { label: 'Elegant', path: '/templates' },
  { label: 'Minimalist', path: '/templates' },
  { label: 'Kids Theme', path: '/templates' },
  { label: 'Modern', path: '/templates' },
  { label: 'Family Album', path: '/templates' },
];

export default function Footer() {
  return (
    <footer className="bg-charcoal text-white">
      <div className="max-w-[1280px] mx-auto px-6 md:px-12 lg:px-16 pt-16 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
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
            <div className="flex items-center gap-4">
              <a
                href="#"
                className="text-light hover:text-peach transition-colors duration-200"
                aria-label="Facebook"
              >
                <Facebook size={20} />
              </a>
              <a
                href="#"
                className="text-light hover:text-peach transition-colors duration-200"
                aria-label="Instagram"
              >
                <Instagram size={20} />
              </a>
              <a
                href="#"
                className="text-light hover:text-peach transition-colors duration-200"
                aria-label="Twitter"
              >
                <Twitter size={20} />
              </a>
            </div>
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

          {/* Column 3: Templates */}
          <div>
            <h4 className="font-body text-sm font-semibold uppercase tracking-wider mb-4">
              Templates
            </h4>
            <ul className="space-y-2.5">
              {templateLinks.map((link) => (
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

          {/* Column 4: Contact */}
          <div>
            <h4 className="font-body text-sm font-semibold uppercase tracking-wider mb-4">
              Contact
            </h4>
            <ul className="space-y-2.5 mb-6">
              <li className="font-body text-sm text-light">
                123 Main St, City
              </li>
              <li className="font-body text-sm text-light">
                (555) 123-4567
              </li>
              <li className="font-body text-sm text-light">
                hello@megyprints.com
              </li>
            </ul>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Your email"
                className="flex-1 min-w-0 bg-[#3a3a3a] border border-ink-mid rounded-lg px-3 py-2 font-body text-xs text-white placeholder:text-light focus:outline-none focus:border-peach"
              />
              <button className="bg-peach text-white font-body text-xs font-semibold px-4 py-2 rounded-lg hover:bg-blush-pink transition-colors duration-200 shrink-0">
                Subscribe
              </button>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-medium mt-12 pt-6">
          <p className="font-body text-sm text-light text-center">
            &copy; 2025 Megy Prints. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
