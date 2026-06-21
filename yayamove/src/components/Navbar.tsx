import { Link, NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Menu, X, LogOut, LayoutDashboard, MessageSquare } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "./ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useChat } from "@/hooks/useChat";
import { cn } from "@/lib/utils";

const links = [
  { to: "/browse", label: "Browse pros" },
  { to: "/post-job", label: "Post a job" },
  { to: "/become-a-pro", label: "Become a pro" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { totalUnread } = useChat();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/40 bg-white/70 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="ring-focus rounded-lg" aria-label="Yayamove home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                cn(
                  "rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-foreground/70 hover:text-brand-700 hover:bg-brand-50",
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <button
            onClick={() => navigate("/messages")}
            className="ring-focus relative rounded-lg p-2 text-foreground/70 hover:bg-brand-50 hover:text-brand-700"
            aria-label="Messages"
          >
            <MessageSquare className="size-5" />
            {totalUnread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                {totalUnread}
              </span>
            )}
          </button>
          {user ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
                <LayoutDashboard /> Dashboard
              </Button>
              <Button variant="outline" size="sm" onClick={() => signOut()}>
                <LogOut /> Sign out
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>
                Log in
              </Button>
              <Button variant="gradient" size="sm" onClick={() => navigate("/signup")}>
                Get started
              </Button>
            </>
          )}
        </div>

        <button
          className="ring-focus rounded-lg p-2 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-white md:hidden">
          <div className="container flex flex-col gap-1 py-3">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground/80 hover:bg-brand-50"
              >
                {l.label}
              </NavLink>
            ))}
            <NavLink
              to="/messages"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground/80 hover:bg-brand-50"
            >
              <span className="flex items-center gap-2">
                <MessageSquare className="size-4" /> Messages
              </span>
              {totalUnread > 0 && (
                <span className="flex min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                  {totalUnread}
                </span>
              )}
            </NavLink>
            <div className="mt-2 flex gap-2">
              {user ? (
                <>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setOpen(false);
                      navigate("/dashboard");
                    }}
                  >
                    Dashboard
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setOpen(false);
                      signOut();
                    }}
                  >
                    <LogOut />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setOpen(false);
                      navigate("/login");
                    }}
                  >
                    Log in
                  </Button>
                  <Button
                    variant="gradient"
                    className="flex-1"
                    onClick={() => {
                      setOpen(false);
                      navigate("/signup");
                    }}
                  >
                    Get started
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
