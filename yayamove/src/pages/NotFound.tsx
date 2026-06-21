import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="container flex min-h-[70vh] flex-col items-center justify-center text-center">
      <Logo withText={false} className="h-16 w-16" />
      <h1 className="mt-6 font-display text-6xl font-extrabold brand-gradient-text">404</h1>
      <p className="mt-2 text-lg font-bold">This page took the day off.</p>
      <p className="mt-1 text-muted-foreground">Let’s get you back to finding help.</p>
      <div className="mt-6 flex gap-2">
        <Button variant="gradient" onClick={() => navigate("/")}>
          Go home
        </Button>
        <Button variant="outline" onClick={() => navigate("/browse")}>
          Browse pros
        </Button>
      </div>
    </div>
  );
}
