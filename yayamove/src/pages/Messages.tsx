import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Send, ArrowLeft, ShieldCheck, MessageSquare, Search } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { ME } from "@/lib/sampleChat";
import { CATEGORY_BY_SLUG, type CategorySlug } from "@/lib/categories";
import { cn, timeAgo } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";

export default function Messages() {
  const { conversations, messagesByConv, typing, totalUnread, unreadFor, lastMessageFor, send, markRead } = useChat();
  const [params, setParams] = useSearchParams();
  const active = params.get("c");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeConv = conversations.find((c) => c.id === active);
  const activeMessages = active ? messagesByConv[active] ?? [] : [];

  // mark read only when there's actually something unread (avoids a write per
  // inbound message in live mode — audit QA-M1)
  useEffect(() => {
    if (active && unreadFor(active) > 0) markRead(active);
  }, [active, activeMessages.length, markRead, unreadFor]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [activeMessages.length, typing, active]);

  const filtered = useMemo(
    () =>
      conversations.filter((c) =>
        c.partyName.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [conversations, query],
  );

  const select = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("c", id);
    setParams(next);
  };

  const onSend = () => {
    if (!active || !draft.trim()) return;
    send(active, draft);
    setDraft("");
  };

  const catName = (slug: string) =>
    CATEGORY_BY_SLUG[slug as CategorySlug]?.name ?? slug;

  return (
    <div className="container py-6">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-2xl font-extrabold">Messages</h1>
        {totalUnread > 0 && <Badge variant="solid">{totalUnread} new</Badge>}
      </div>

      <div className="grid h-[calc(100vh-13rem)] min-h-[480px] overflow-hidden rounded-2xl border border-border bg-card shadow-soft md:grid-cols-[340px_1fr]">
        {/* ── conversation list ── */}
        <aside
          className={cn(
            "flex flex-col border-r border-border",
            active && "hidden md:flex",
          )}
        >
          <div className="border-b border-border p-3">
            <div className="flex items-center gap-2 rounded-xl border border-input bg-white px-3">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations…"
                className="h-9 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">No conversations.</p>
            )}
            {filtered.map((c) => {
              const last = lastMessageFor(c.id);
              const unread = unreadFor(c.id);
              const isActive = c.id === active;
              return (
                <button
                  key={c.id}
                  onClick={() => select(c.id)}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-border/60 p-3 text-left transition-colors hover:bg-brand-50",
                    isActive && "bg-brand-50",
                  )}
                >
                  <div className="relative">
                    <Avatar name={c.partyName} size="sm" />
                    {c.verified && (
                      <ShieldCheck className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-white text-brand-600" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-bold">{c.partyName}</span>
                      {last && (
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {timeAgo(last.createdAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
                        {last ? (last.senderId === ME ? "You: " : "") + last.body : catName(c.partyCategory)}
                      </span>
                      {unread > 0 && (
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
                          {unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── thread ── */}
        <section className={cn("flex flex-col", !active && "hidden md:flex")}>
          {activeConv ? (
            <>
              {/* header */}
              <header className="flex items-center gap-3 border-b border-border p-3">
                <button className="md:hidden" onClick={() => setParams({})} aria-label="Back">
                  <ArrowLeft className="size-5" />
                </button>
                <Link
                  to={`/provider/${activeConv.partyId}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <Avatar name={activeConv.partyName} size="sm" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-bold">
                      {activeConv.partyName}
                      {activeConv.verified && <ShieldCheck className="size-4 text-brand-600" />}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{catName(activeConv.partyCategory)}</p>
                  </div>
                </Link>
                <Link
                  to={`/provider/${activeConv.partyId}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "hidden sm:inline-flex")}
                >
                  View profile
                </Link>
              </header>

              {/* messages */}
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-brand-50/30 p-4">
                {activeMessages.map((m, i) => {
                  const mine = m.senderId === ME;
                  const prev = activeMessages[i - 1];
                  const grouped = prev && prev.senderId === m.senderId;
                  return (
                    <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                          mine
                            ? "rounded-br-md bg-brand-600 text-white"
                            : "rounded-bl-md bg-white text-foreground",
                          grouped && (mine ? "rounded-tr-md" : "rounded-tl-md"),
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <span className={cn("mt-0.5 block text-[10px]", mine ? "text-brand-100/80" : "text-muted-foreground")}>
                          {timeAgo(m.createdAt)}
                          {mine && (m.readAt ? " · Read" : " · Sent")}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {typing[activeConv.id] && (
                  <div className="flex justify-start">
                    <div className="flex gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm">
                      {[0, 1, 2].map((d) => (
                        <span
                          key={d}
                          className="size-2 animate-bounce rounded-full bg-brand-300"
                          style={{ animationDelay: `${d * 0.15}s` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* composer */}
              <div className="border-t border-border p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        onSend();
                      }
                    }}
                    rows={1}
                    placeholder="Type a message…"
                    className="max-h-32 flex-1 resize-none rounded-xl border border-input bg-white px-4 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <Button size="icon" variant="gradient" onClick={onSend} disabled={!draft.trim()} aria-label="Send">
                    <Send />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
                <MessageSquare className="size-8" />
              </div>
              <p className="mt-4 font-bold">Your messages</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Select a conversation to start chatting, or message a pro from their profile.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
