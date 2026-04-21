import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  ChatCircleDots,
  X,
  PaperPlaneRight,
  Microphone,
  Stop,
  Trash,
  Robot,
  CheckCircle,
} from "@phosphor-icons/react";

function exec_label(exec) {
  if (!exec) return null;
  if (exec.action === "mark_attendance") {
    const saved = (exec.saved || []).map((e) => `${e.student_name} (${e.status})`).join(", ");
    const unk = (exec.unknown_students || []).join(", ");
    return `Yoklama: ${saved || "—"}${unk ? ` · Bulunamadı: ${unk}` : ""}`;
  }
  if (exec.action === "mark_all_present") return `Tümü Geldi (${exec.count || 0} öğrenci)`;
  if (exec.action === "add_daily_case") return `Günlük vaka kaydedildi: ${exec.case?.title}`;
  if (exec.action === "add_activity_note") return `Etkinlik notu kaydedildi: ${exec.note?.activity_name}`;
  if (exec.action === "enroll_students") return `${exec.count || 0} öğrenci kaydedildi`;
  return exec.error ? `Hata: ${exec.error}` : exec.action;
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const listRef = useRef(null);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data } = await api.get("/chat/history");
      setMessages(data);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (open) loadHistory();
  }, [open]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    const localId = `tmp_${Date.now()}`;
    setMessages((m) => [...m, { id: localId, role: "user", content: text, created_at: new Date().toISOString() }]);
    try {
      const { data } = await api.post("/chat/message", { message: text });
      setMessages((m) => [
        ...m,
        {
          id: `tmp_a_${Date.now()}`,
          role: "assistant",
          content: data.reply,
          executed: data.executed,
          created_at: new Date().toISOString(),
        },
      ]);
      if (data.executed?.some(e => e.action === "enroll_students" && e.ok)) {
        window.dispatchEvent(new CustomEvent("student-added"));
      }
    } catch (_e) {
      toast.error("Mesaj gönderilemedi.");
    } finally {
      setSending(false);
    }
  };

  const clearHistory = async () => {
    if (!window.confirm("Sohbet geçmişi silinsin mi?")) return;
    await api.delete("/chat/history");
    setMessages([]);
    toast.success("Sohbet temizlendi.");
  };

  const startRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];
        await uploadAudio(blob);
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch (_e) {
      toast.error("Mikrofona erişilemedi.");
    }
  };

  const stopRecord = () => {
    try {
      mediaRef.current?.stop();
    } catch (_e) {}
    setRecording(false);
  };

  const uploadAudio = async (blob) => {
    setSending(true);
    const fd = new FormData();
    fd.append("file", blob, "voice.webm");
    const tmpId = `tmp_v_${Date.now()}`;
    setMessages((m) => [...m, { id: tmpId, role: "user", content: "🎤 Sesli mesaj işleniyor…", created_at: new Date().toISOString() }]);
    try {
      const { data } = await api.post("/chat/voice", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMessages((m) => {
        const next = m.filter((x) => x.id !== tmpId);
        next.push({ id: `tmp_vt_${Date.now()}`, role: "user", content: data.transcript || "(boş)", created_at: new Date().toISOString() });
        next.push({
          id: `tmp_va_${Date.now()}`,
          role: "assistant",
          content: data.reply,
          executed: data.executed,
          created_at: new Date().toISOString(),
        });
        if (data.executed?.some(e => e.action === "enroll_students" && e.ok)) {
          window.dispatchEvent(new CustomEvent("student-added"));
        }
        return next;
      });
    } catch (_e) {
      toast.error("Ses yüklenemedi.");
      setMessages((m) => m.filter((x) => x.id !== tmpId));
    } finally {
      setSending(false);
    }
  };

  const PanelContent = (
    <>
      <div className="flex items-center justify-between p-4 border-b border-[#E6E2D6]">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-[#4B6858] flex items-center justify-center">
            <Robot size={18} weight="duotone" className="text-white" />
          </div>
          <div className="leading-tight">
            <p className="font-heading text-sm">Asistan</p>
            <p className="text-[11px] text-[#6B7280]">
              Yoklama, günlük vaka ve etkinlik notu için hazırım.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearHistory}
            title="Sohbeti temizle"
            data-testid="chat-clear-btn"
            className="h-8 w-8 rounded-full hover:bg-[#F1EDE4] flex items-center justify-center text-[#6B7280]"
          >
            <Trash size={16} weight="duotone" />
          </button>
          <button
            onClick={() => setOpen(false)}
            data-testid="chat-close-btn"
            className="h-8 w-8 rounded-full hover:bg-[#F1EDE4] flex items-center justify-center text-[#6B7280]"
          >
            <X size={18} weight="bold" />
          </button>
        </div>
      </div>

      <div
        ref={listRef}
        data-testid="chat-messages"
        className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FDFBF7]"
      >
        {loadingHistory ? (
          <div className="py-8 flex justify-center">
            <div className="h-6 w-6 rounded-full border-2 border-[#4B6858]/20 border-t-[#4B6858] animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8">
            <Robot size={38} weight="duotone" className="text-[#4B6858] mx-auto" />
            <p className="mt-3 text-sm font-heading">Asistan Hazır</p>
            <p className="text-xs text-[#6B7280] mt-1 max-w-[240px] mx-auto leading-relaxed">
              Yoklamayı, günlük vakayı veya etkinlik notunu yazın ya da mikrofonu kullanın. Gerisini ben kaydederim.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              data-testid={`msg-${m.role}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-[#4B6858] text-white rounded-br-sm"
                    : "bg-white border border-[#E6E2D6] text-[#28332D] rounded-bl-sm"
                }`}
              >
                {m.content}
                {m.role === "assistant" && Array.isArray(m.executed) && m.executed.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {m.executed.map((e, i) => (
                      <div
                        key={i}
                        className={`text-[11px] px-2 py-1 rounded-lg inline-flex items-center gap-1.5 ${
                          e.ok ? "bg-[#5E8B7E]/15 text-[#5E8B7E]" : "bg-[#C86B5E]/15 text-[#C86B5E]"
                        }`}
                      >
                        <CheckCircle size={12} weight="fill" /> {exec_label(e)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-3 border-t border-[#E6E2D6] bg-white flex items-center gap-2">
        <button
          onClick={recording ? stopRecord : startRecord}
          disabled={sending}
          data-testid="chat-mic-btn"
          className={`h-10 w-10 rounded-full flex items-center justify-center transition-all ${
            recording ? "bg-[#C86B5E] text-white animate-pulse" : "bg-[#F1EDE4] text-[#4B6858] hover:bg-[#E6E2D6]"
          }`}
        >
          {recording ? <Stop size={18} weight="fill" /> : <Microphone size={18} weight="duotone" />}
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Yoklama, vaka ya da etkinlik notu…"
          data-testid="chat-input"
          disabled={sending || recording}
          className="flex-1 rounded-full border border-[#E6E2D6] bg-[#FDFBF7] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4B6858] disabled:opacity-60"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          data-testid="chat-send-btn"
          className="h-10 w-10 rounded-full bg-[#4B6858] hover:bg-[#3A5244] disabled:opacity-40 text-white flex items-center justify-center transition-all"
        >
          <PaperPlaneRight size={16} weight="fill" />
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* FAB button (always visible when chat closed) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          data-testid="chat-fab"
          className="fixed right-4 bottom-20 md:bottom-24 md:right-6 z-40 h-14 w-14 rounded-full bg-[#4B6858] hover:bg-[#3A5244] text-white shadow-lg flex items-center justify-center transition-all hover:-translate-y-0.5"
          aria-label="Asistan"
        >
          <ChatCircleDots size={26} weight="duotone" />
        </button>
      )}

      {/* Mobile full-screen panel */}
      {open && (
        <div
          data-testid="chat-panel-mobile"
          className="md:hidden fixed inset-0 z-50 bg-white flex flex-col"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {PanelContent}
        </div>
      )}

      {/* Desktop docked panel */}
      {open && (
        <div
          data-testid="chat-panel-desktop"
          className="hidden md:flex fixed right-6 bottom-24 z-40 w-[380px] h-[560px] bg-white rounded-2xl border border-[#E6E2D6] shadow-xl flex-col overflow-hidden"
        >
          {PanelContent}
        </div>
      )}
    </>
  );
}
