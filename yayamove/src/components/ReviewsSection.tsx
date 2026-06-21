import { useState } from "react";
import { toast } from "sonner";
import { Star, PenLine } from "lucide-react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Avatar } from "./ui/avatar";
import { cn, timeAgo, uid } from "@/lib/utils";

interface Review {
  id: string;
  author: string;
  rating: number;
  comment: string;
  createdAt: string;
}

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

const SEED: Record<string, Review[]> = {
  default: [
    { id: "r1", author: "Andrea L.", rating: 5, comment: "Super reliable and thorough. Will book again!", createdAt: daysAgo(4) },
    { id: "r2", author: "Mike P.", rating: 5, comment: "On time, professional, fair price. Highly recommend.", createdAt: daysAgo(11) },
    { id: "r3", author: "Joy R.", rating: 4, comment: "Good work overall, communication was great.", createdAt: daysAgo(20) },
  ],
};

function Stars({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type={onChange ? "button" : undefined}
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={cn(onChange && "transition-transform hover:scale-110")}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          <Star className={cn("size-5", n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
        </button>
      ))}
    </div>
  );
}

export function ReviewsSection({
  providerId,
  ratingAvg,
  ratingCount,
}: {
  providerId: string;
  ratingAvg: number;
  ratingCount: number;
}) {
  const [reviews, setReviews] = useState<Review[]>(SEED[providerId] ?? SEED.default);
  const [writing, setWriting] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const submit = () => {
    if (!comment.trim()) {
      toast.error("Please add a comment.");
      return;
    }
    // Live build: insert into `reviews`; a DB trigger recomputes the provider's
    // rating_avg/rating_count server-side (clients can't fake ratings).
    setReviews((prev) => [
      { id: uid(), author: "You", rating, comment: comment.trim(), createdAt: new Date().toISOString() },
      ...prev,
    ]);
    setComment("");
    setWriting(false);
    toast.success("Thanks for your review!");
  };

  return (
    <Card className="mt-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold">Reviews</h2>
          <span className="flex items-center gap-1 text-sm font-semibold text-amber-600">
            <Star className="size-4 fill-amber-400 text-amber-400" />
            {ratingAvg.toFixed(1)} · {ratingCount} ratings
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setWriting((v) => !v)}>
          <PenLine /> Write a review
        </Button>
      </div>

      {writing && (
        <div className="mt-4 rounded-xl border border-border bg-brand-50/40 p-4">
          <Stars value={rating} onChange={setRating} />
          <Textarea
            className="mt-3 bg-white"
            placeholder="Share your experience…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <Button variant="gradient" size="sm" onClick={submit}>Post review</Button>
            <Button variant="ghost" size="sm" onClick={() => setWriting(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-4">
        {reviews.map((r) => (
          <div key={r.id} className="flex gap-3 border-b border-border/60 pb-4 last:border-0 last:pb-0">
            <Avatar name={r.author} size="sm" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{r.author}</span>
                <span className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>
              </div>
              <Stars value={r.rating} />
              <p className="mt-1.5 text-sm text-foreground/80">{r.comment}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
