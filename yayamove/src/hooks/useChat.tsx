import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ME,
  SAMPLE_CONVERSATIONS,
  SAMPLE_MESSAGES,
  DEMO_REPLIES,
  type ChatMessage,
  type Conversation,
} from "@/lib/sampleChat";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "./useAuth";

interface OpenWithArgs {
  id: string;
  name: string;
  category: string;
  verified: boolean;
}

interface ChatContextValue {
  conversations: Conversation[];
  messagesByConv: Record<string, ChatMessage[]>;
  typing: Record<string, boolean>;
  loading: boolean;
  demo: boolean;
  totalUnread: number;
  unreadFor: (conversationId: string) => number;
  lastMessageFor: (conversationId: string) => ChatMessage | undefined;
  send: (conversationId: string, body: string) => void;
  markRead: (conversationId: string) => void;
  openWith: (party: OpenWithArgs) => string;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

const uid = () => Math.random().toString(36).slice(2, 10);

export function ChatProvider({ children }: { children: ReactNode }) {
  // Demo-mode in-memory store (also the optimistic store for live mode).
  const [conversations, setConversations] = useState<Conversation[]>(SAMPLE_CONVERSATIONS);
  const [messages, setMessages] = useState<ChatMessage[]>(SAMPLE_MESSAGES);
  const [typing, setTyping] = useState<Record<string, boolean>>({});
  const [loading] = useState(false);
  const replyTimers = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({});
  const { user } = useAuth();

  // Reset in-memory chat when the signed-in user changes so we never show the
  // previous user's conversations after sign-out (audit QA-L2).
  useEffect(() => {
    setConversations(SAMPLE_CONVERSATIONS);
    setMessages(SAMPLE_MESSAGES);
    setTyping({});
  }, [user?.id]);

  // NOTE: when Supabase is configured, this is where we'd load the user's
  // conversations and subscribe to the `messages` realtime channel. The demo
  // path below is fully interactive so the experience is real without a backend.

  const messagesByConv = useMemo(() => {
    const map: Record<string, ChatMessage[]> = {};
    for (const m of messages) (map[m.conversationId] ??= []).push(m);
    for (const k in map)
      map[k].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return map;
  }, [messages]);

  const sortedConversations = useMemo(() => {
    const lastAt = (c: Conversation) => {
      const list = messagesByConv[c.id];
      return list?.length ? list[list.length - 1].createdAt : "";
    };
    return [...conversations].sort((a, b) => lastAt(b).localeCompare(lastAt(a)));
  }, [conversations, messagesByConv]);

  const unreadFor = useCallback(
    (conversationId: string) =>
      (messagesByConv[conversationId] ?? []).filter(
        (m) => m.senderId !== ME && !m.readAt,
      ).length,
    [messagesByConv],
  );

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + unreadFor(c.id), 0),
    [conversations, unreadFor],
  );

  const lastMessageFor = useCallback(
    (conversationId: string) => {
      const list = messagesByConv[conversationId] ?? [];
      return list[list.length - 1];
    },
    [messagesByConv],
  );

  const markRead = useCallback((conversationId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.conversationId === conversationId && m.senderId !== ME && !m.readAt
          ? { ...m, readAt: new Date().toISOString() }
          : m,
      ),
    );
  }, []);

  const send = useCallback(
    (conversationId: string, body: string) => {
      const text = body.trim();
      if (!text) return;
      const mine: ChatMessage = {
        id: uid(),
        conversationId,
        senderId: ME,
        body: text,
        createdAt: new Date().toISOString(),
        readAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, mine]);

      // Demo: simulate the other party typing + replying so it feels live.
      const conv = conversations.find((c) => c.id === conversationId);
      if (!conv) return;
      const t1 = setTimeout(() => setTyping((p) => ({ ...p, [conversationId]: true })), 700);
      const t2 = setTimeout(() => {
        setTyping((p) => ({ ...p, [conversationId]: false }));
        const reply: ChatMessage = {
          id: uid(),
          conversationId,
          senderId: conv.partyId,
          body: DEMO_REPLIES[Math.floor(Math.random() * DEMO_REPLIES.length)],
          createdAt: new Date().toISOString(),
          readAt: null,
        };
        setMessages((prev) => [...prev, reply]);
      }, 2200);
      (replyTimers.current[conversationId] ??= []).push(t1, t2);
    },
    [conversations],
  );

  const openWith = useCallback(
    (party: OpenWithArgs) => {
      const existing = conversations.find((c) => c.partyId === party.id);
      if (existing) return existing.id;
      const conv: Conversation = {
        id: uid(),
        partyId: party.id,
        partyName: party.name,
        partyCategory: party.category,
        verified: party.verified,
      };
      setConversations((prev) => [conv, ...prev]);
      return conv.id;
    },
    [conversations],
  );

  useEffect(() => {
    const timers = replyTimers.current;
    return () => {
      Object.values(timers).flat().forEach(clearTimeout);
    };
  }, []);

  const value = useMemo<ChatContextValue>(
    () => ({
      conversations: sortedConversations,
      messagesByConv,
      typing,
      loading,
      demo: !isSupabaseConfigured,
      totalUnread,
      unreadFor,
      lastMessageFor,
      send,
      markRead,
      openWith,
    }),
    [sortedConversations, messagesByConv, typing, loading, totalUnread, unreadFor, lastMessageFor, send, markRead, openWith],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within <ChatProvider>");
  return ctx;
}
