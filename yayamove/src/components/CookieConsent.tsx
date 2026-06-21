import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";
import { Button } from "./ui/button";

const KEY = "yayamove.cookie-consent";

export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      /* storage blocked — skip */
    }
  }, []);

  const decide = (value: "accepted" | "essential") => {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4">
      <div className="container">
        <div className="glass flex flex-col items-start gap-3 rounded-2xl p-4 shadow-glow sm:flex-row sm:items-center">
          <Cookie className="size-6 shrink-0 text-brand-600" />
          <p className="flex-1 text-sm text-foreground/80">
            We use essential cookies to keep you signed in, and optional ones to improve
            Yayamove. See our{" "}
            <Link to="/privacy" className="font-semibold text-brand-700 hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => decide("essential")}>
              Essential only
            </Button>
            <Button variant="gradient" size="sm" className="flex-1" onClick={() => decide("accepted")}>
              Accept all
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
