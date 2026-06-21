import { Link } from "react-router-dom";
import { Logo } from "./Logo";
import { CATEGORIES } from "@/lib/categories";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border bg-brand-950 text-brand-100">
      <div className="container grid gap-10 py-14 md:grid-cols-4">
        <div className="md:col-span-1">
          <Logo textClassName="text-white" />
          <p className="mt-4 max-w-xs text-sm text-brand-200/80">
            Trusted local help across Metro Manila — NBI-verified maids, carpenters,
            plumbers, technicians, and aircon pros.
          </p>
        </div>

        <div>
          <h4 className="text-sm font-bold text-white">Services</h4>
          <ul className="mt-4 space-y-2.5 text-sm">
            {CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link
                  to={`/browse?category=${c.slug}`}
                  className="text-brand-200/80 hover:text-white"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-bold text-white">Company</h4>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link to="/become-a-pro" className="text-brand-200/80 hover:text-white">Become a pro</Link></li>
            <li><Link to="/post-job" className="text-brand-200/80 hover:text-white">Post a job</Link></li>
            <li><span className="text-brand-200/50">About (soon)</span></li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-bold text-white">Trust &amp; safety</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-brand-200/80">
            <li>NBI clearance verification</li>
            <li>Ratings &amp; reviews</li>
            <li className="text-brand-200/50">Privacy Policy (soon)</li>
            <li className="text-brand-200/50">Data Privacy Act 2012 compliant</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container flex flex-col items-center justify-between gap-2 py-5 text-xs text-brand-300/70 sm:flex-row">
          <span>© {new Date().getFullYear()} Yayamove. Made in the Philippines 🇵🇭</span>
          <span>Your data is protected. NBI documents are private &amp; encrypted.</span>
        </div>
      </div>
    </footer>
  );
}
