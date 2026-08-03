"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, RefreshCw, Send } from "lucide-react";

type PartyType = "customer" | "supplier";
type Message = { id: string; senderUserId: string; senderName: string; senderRole: string; body: string; sentAt: string };
type Contact = { id: string; partyType: PartyType; label: string; code: string };

export function PartnerConversation({ partyType, partyId, partyLabel, title, compact = false }: { partyType: PartyType; partyId?: string; partyLabel: string; title: string; compact?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const loadSequence = useRef(0);

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const sequence = ++loadSequence.current;
    if (!silent) setLoading(true);
    if (!silent) setError(undefined);
    try {
      const params = new URLSearchParams({ partyType, ...(partyId ? { partyId } : {}) });
      const response = await fetch(`/api/communications/messages?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; messages?: Message[]; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Không thể tải tin nhắn.");
      if (sequence === loadSequence.current) setMessages(payload.messages ?? []);
    } catch (cause) {
      if (silent) return;
      setError(cause instanceof Error ? cause.message : "Không thể tải tin nhắn.");
    } finally {
      if (!silent && sequence === loadSequence.current) setLoading(false);
    }
  }, [partyId, partyType]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      if (!document.hidden) void load({ silent: true });
    }, 10_000);

    return () => window.clearInterval(refreshTimer);
  }, [load]);

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError(undefined);
    try {
      const response = await fetch("/api/communications/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          partyType,
          ...(partyId ? { partyId } : {}),
          body: text,
          idempotencyKey: `message:${crypto.randomUUID()}`
        })
      });
      const payload = await response.json() as { ok?: boolean; message?: Message; error?: string };
      if (!response.ok || !payload.ok || !payload.message) throw new Error(payload.error || "Không thể gửi tin nhắn.");
      setMessages((current) => [...current, payload.message as Message]);
      setBody("");
      void load({ silent: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể gửi tin nhắn.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className={`partner-conversation${compact ? " partner-conversation-compact" : ""}`} aria-labelledby={`conversation-${partyType}-${partyId ?? "self"}`}>
      <header className="partner-conversation-heading">
        <MessageCircle aria-hidden="true" />
        <div><p>{title}</p><h2 id={`conversation-${partyType}-${partyId ?? "self"}`}>{partyLabel}</h2></div>
        <button className="button button-secondary" type="button" onClick={() => void load()} disabled={loading || sending}><RefreshCw aria-hidden="true" />{"L\u00e0m m\u1edbi"}</button>
      </header>
      <p className="partner-conversation-state" aria-live="polite">{"Tin nh\u1eafn t\u1ef1 c\u1eadp nh\u1eadt m\u1ed7i 10 gi\u00e2y."}</p>
      {loading ? <p className="partner-conversation-state">Đang tải trao đổi...</p> : null}
      {error ? <div className="feedback feedback-error" role="alert">{error}</div> : null}
      {!loading && !error ? <div className="partner-message-list">
        {messages.length ? messages.map((message) => <article key={message.id} className="partner-message"><strong>{message.senderName}</strong><p>{message.body}</p><time>{formatDateTime(message.sentAt)}</time></article>) : <p className="partner-conversation-state">Chưa có tin nhắn. Hãy bắt đầu trao đổi ngắn gọn, rõ ràng.</p>}
      </div> : null}
      <form className="partner-message-form" onSubmit={send}>
        <label className="field"><span>Viết tin nhắn</span><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} rows={3} placeholder="Ví dụ: Cửa hàng cần xác nhận thời gian giao hàng." disabled={sending} /></label>
        <button className="button button-primary" type="submit" disabled={sending || !body.trim()}><Send aria-hidden="true" />{sending ? "Đang gửi" : "Gửi tin nhắn"}</button>
      </form>
    </section>
  );
}

export function CommunicationsWorkspace({ contacts }: { contacts: Contact[] }) {
  const [partyType, setPartyType] = useState<PartyType>("customer");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => contacts.filter((contact) => contact.partyType === partyType && `${contact.code} ${contact.label}`.toLocaleLowerCase("vi-VN").includes(query.trim().toLocaleLowerCase("vi-VN"))), [contacts, partyType, query]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const selected = filtered.find((contact) => contact.id === selectedId) ?? filtered[0];

  return <main className="communications-workspace">
    <header className="communications-header"><p>Hộp thư đối tác</p><h1>Trao đổi rõ ràng, có lưu lịch sử</h1><span>Chỉ gửi thông tin cần thiết. Không gửi mật khẩu, số tài khoản hoặc dữ liệu thanh toán nhạy cảm qua tin nhắn.</span></header>
    <div className="communications-layout">
      <aside className="communications-contact-list">
        <div className="communications-type-tabs"><button type="button" className={partyType === "customer" ? "active" : ""} onClick={() => { setPartyType("customer"); setSelectedId(undefined); }}>Khách hàng</button><button type="button" className={partyType === "supplier" ? "active" : ""} onClick={() => { setPartyType("supplier"); setSelectedId(undefined); }}>Nhà cung cấp</button></div>
        <label className="field"><span>Tìm đối tác</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tên, mã hoặc số điện thoại" /></label>
        <div className="communications-contacts">{filtered.map((contact) => <button key={contact.id} type="button" className={selected?.id === contact.id ? "active" : ""} onClick={() => setSelectedId(contact.id)}><strong>{contact.label}</strong><span>{contact.code}</span></button>)}{filtered.length === 0 ? <p>Không tìm thấy đối tác phù hợp.</p> : null}</div>
      </aside>
      {selected ? <PartnerConversation key={`${selected.partyType}-${selected.id}`} partyType={selected.partyType} partyId={selected.id} partyLabel={selected.label} title={selected.partyType === "customer" ? "Trao đổi với khách hàng" : "Trao đổi với nhà cung cấp"} /> : <section className="partner-conversation"><p className="partner-conversation-state">Chọn một đối tác để bắt đầu trao đổi.</p></section>}
    </div>
  </main>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}
