import React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  X,
  Send,
  Loader2,
  ChevronLeft,
  ChevronRight,
  MessageSquareText,
  FileSearch,
  HardHat,
  Siren,
  ShieldAlert,
  Search,
  WifiOff,
} from "lucide-react";
import { useStore } from "../../store/useStore";
import { translations } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import { getRiskLevel } from "../../lib/risk";

// =====================================================================
// مساعد السلامة الذكي العائم — متاح للجميع في كل صفحات التطبيق
//  • محادثة عامة عن أي مشكلة أو خطر
//  • مساعدة بخصوص بلاغ سابق بالبحث عنه بكوده
// =====================================================================

type View = "home" | "general" | "lookup" | "incident";
type ChatMessage = { sender: "user" | "ai"; text: string; local?: boolean; error?: boolean };

interface TrackedIncident {
  id: string;
  timestamp?: string;
  employeeName?: string;
  agency?: string;
  incidentLocation?: string;
  classification?: string;
  description?: string;
  riskScore?: number;
  status?: string;
  correctiveAction?: string;
}

// عرض بسيط وآمن لتنسيق Markdown (عناوين، نقاط، نص عريض) بدون innerHTML
function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4
      ? <strong key={`${keyPrefix}-${i}`} className="text-white font-bold">{part.slice(2, -2)}</strong>
      : <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>
  );
}

function FormattedText({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  return (
    <div className="space-y-1">
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={i} className="h-1.5" />;
        const heading = line.match(/^#{1,4}\s+(.*)$/);
        if (heading) {
          return <p key={i} className="font-bold text-white pt-1">{renderInline(heading[1], `h${i}`)}</p>;
        }
        const bullet = line.match(/^\s*(?:[-*•])\s+(.*)$/);
        if (bullet) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-brand-primary shrink-0">•</span>
              <span>{renderInline(bullet[1], `b${i}`)}</span>
            </div>
          );
        }
        return <p key={i}>{renderInline(line, `p${i}`)}</p>;
      })}
    </div>
  );
}

export function AiAssistant() {
  const { language, isRTL } = useStore();
  const t = translations[language];
  const en = language === "en";

  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<View>("home");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);

  const [lookupCode, setLookupCode] = React.useState("");
  const [lookupError, setLookupError] = React.useState("");
  const [isLookingUp, setIsLookingUp] = React.useState(false);
  const [incident, setIncident] = React.useState<TrackedIncident | null>(null);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // إغلاق بزر Escape
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // النزول لآخر رسالة تلقائياً
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isSending, view, incident]);

  const resetToHome = () => {
    setView("home");
    setMessages([]);
    setInput("");
    setIncident(null);
    setLookupCode("");
    setLookupError("");
  };

  const startGeneral = (firstQuestion?: string) => {
    setIncident(null);
    setView("general");
    const greeting: ChatMessage = {
      sender: "ai",
      local: true,
      text: en
        ? "Hello! Describe the safety problem or hazard you are facing, and I will help you analyze it and suggest practical solutions."
        : "أهلاً بك! اكتب المشكلة أو الخطر الذي تواجهه في موقع العمل، وسأساعدك في تحليله واقتراح حلول عملية."
    };
    setMessages([greeting]);
    if (firstQuestion) {
      sendMessage(firstQuestion, { mode: "general", history: [greeting] });
    } else {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const sendMessage = async (
    text: string,
    opts?: { mode?: "general" | "incident"; history?: ChatMessage[]; incidentId?: string }
  ) => {
    const clean = text.trim();
    if (!clean || isSending) return;
    if (!isOnline) {
      setMessages(prev => [...prev, { sender: "ai", error: true, text: en ? "Internet connection is required." : "الاتصال بالإنترنت مطلوب لاستخدام المساعد." }]);
      return;
    }
    const mode = opts?.mode || (view === "incident" ? "incident" : "general");
    const incidentId = opts?.incidentId || (mode === "incident" ? incident?.id : undefined);
    const history = [...(opts?.history || messages), { sender: "user" as const, text: clean }];
    setMessages(history);
    setInput("");
    setIsSending(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          incidentId,
          // رسائل الترحيب المحلية والأخطاء لا تُرسل للمساعد
          messages: history.filter(m => !m.local && !m.error).map(m => ({ sender: m.sender, text: m.text }))
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.reply) {
        setMessages(prev => [...prev, { sender: "ai", text: data.reply }]);
      } else {
        const msg = res.status === 429
          ? (en ? "Too many requests right now. Please try again in a few minutes." : "عدد الطلبات كبير حالياً، يرجى المحاولة بعد دقائق.")
          : (en ? "Sorry, I could not reach the assistant. Please try again." : "عذراً، تعذّر الوصول للمساعد. يرجى المحاولة مرة أخرى.");
        setMessages(prev => [...prev, { sender: "ai", error: true, text: msg }]);
      }
    } catch {
      setMessages(prev => [...prev, { sender: "ai", error: true, text: en ? "Connection failed." : "فشل الاتصال بالشبكة." }]);
    } finally {
      setIsSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = lookupCode.trim();
    if (!code || isLookingUp) return;
    if (!isOnline) {
      setLookupError(en ? "Internet connection is required." : "الاتصال بالإنترنت مطلوب للبحث عن البلاغ.");
      return;
    }
    setIsLookingUp(true);
    setLookupError("");
    try {
      const res = await fetch(`/api/track/${encodeURIComponent(code)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && data.id) {
        setIncident(data);
        setView("incident");
        setMessages([{
          sender: "ai",
          local: true,
          text: en
            ? `I found report ${data.id}. What would you like help with? You can pick a suggestion below or type your question.`
            : `تم العثور على البلاغ ${data.id}. بماذا تحب أن أساعدك؟ اختر من الاقتراحات بالأسفل أو اكتب سؤالك.`
        }]);
      } else if (res.status === 404) {
        setLookupError(en ? "No report was found with this code. Please check it and try again." : "لا يوجد بلاغ بهذا الكود. تأكد من الكود وحاول مرة أخرى.");
      } else if (res.status === 429) {
        setLookupError(en ? "Too many searches. Please wait a few minutes." : "عدد محاولات البحث كبير، يرجى الانتظار بضع دقائق.");
      } else {
        setLookupError(en ? "Could not search right now. Please try again." : "تعذّر البحث حالياً، يرجى المحاولة مرة أخرى.");
      }
    } catch {
      setLookupError(en ? "Connection failed." : "فشل الاتصال بالشبكة.");
    } finally {
      setIsLookingUp(false);
    }
  };

  const generalPrompts = [
    { icon: ShieldAlert, text: en ? "Help me analyze a hazard I found at work" : "ساعدني في تحليل خطر وجدته في موقع العمل" },
    { icon: HardHat, text: en ? "What PPE is required for warehouse work?" : "ما معدات الوقاية المطلوبة للعمل في المخزن؟" },
    { icon: Siren, text: en ? "What should I do immediately after a work accident?" : "ماذا أفعل فوراً بعد وقوع حادث عمل؟" },
  ];

  const incidentPrompts = [
    en ? "What is the most suitable solution for this report?" : "ما الحل المناسب لهذا البلاغ؟",
    en ? "What PPE is needed for this case?" : "ما معدات الوقاية المطلوبة لهذه الحالة؟",
    en ? "How do we prevent this from happening again?" : "كيف نمنع تكرار هذه المشكلة؟",
  ];

  const Back = isRTL ? ChevronRight : ChevronLeft;
  const sideClass = isRTL ? "left-4 sm:left-6" : "right-4 sm:right-6";
  const hasUserMessages = messages.some(m => m.sender === "user");

  return (
    <>
      {/* الزر العائم */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="ai-fab"
            type="button"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setOpen(true)}
            aria-label={en ? "Open the smart safety assistant" : "فتح مساعد السلامة الذكي"}
            title={en ? "Smart Safety Assistant" : "مساعد السلامة الذكي"}
            className={cn(
              "fixed bottom-5 sm:bottom-6 z-40 w-14 h-14 rounded-2xl flex items-center justify-center cursor-pointer",
              "bg-gradient-to-br from-brand-primary to-brand-secondary text-black shadow-[0_8px_30px_rgba(0,242,255,0.35)] border border-white/20",
              sideClass
            )}
          >
            <span className="absolute inset-0 rounded-2xl bg-brand-primary/40 animate-ping opacity-30 pointer-events-none" />
            <Sparkles className="w-7 h-7 relative" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* نافذة المساعد */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="ai-panel"
            role="dialog"
            aria-label={en ? "Smart Safety Assistant" : "مساعد السلامة الذكي"}
            dir={isRTL ? "rtl" : "ltr"}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: "spring", damping: 26, stiffness: 260 }}
            className={cn(
              "fixed bottom-4 sm:bottom-6 z-[70] flex flex-col overflow-hidden",
              "w-[calc(100vw-2rem)] sm:w-[400px] h-[min(620px,calc(100vh-2rem))]",
              "bg-[#0a0a14]/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.6)]",
              sideClass
            )}
          >
            {/* الشريط العلوي */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10 bg-gradient-to-r from-brand-primary/10 to-brand-secondary/10 shrink-0">
              {view !== "home" ? (
                <button
                  type="button"
                  onClick={resetToHome}
                  aria-label={en ? "Back" : "رجوع"}
                  className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Back className="w-5 h-5" />
                </button>
              ) : (
                <div className="w-9 h-9 rounded-xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-brand-primary" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{en ? "Smart Safety Assistant" : "مساعد السلامة الذكي"}</p>
                <p className="text-[11px] text-white/45 truncate">
                  {view === "incident" && incident
                    ? (en ? `About report ${incident.id}` : `بخصوص البلاغ ${incident.id}`)
                    : (en ? "AI-powered HSE guidance" : "إرشادات سلامة مهنية بالذكاء الاصطناعي")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={en ? "Close" : "إغلاق"}
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!isOnline && (
              <div className="mx-4 mt-3 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2 shrink-0">
                <WifiOff className="w-4 h-4 shrink-0" />
                <span>{en ? "You are offline. The assistant needs an internet connection." : "أنت غير متصل بالإنترنت. المساعد يحتاج اتصالاً نشطاً."}</span>
              </div>
            )}

            {/* المحتوى */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {view === "home" && (
                <div className="space-y-5">
                  <div className="space-y-1">
                    <p className="text-base font-bold text-white">{en ? "How can I help you today?" : "كيف أقدر أساعدك اليوم؟"}</p>
                    <p className="text-xs text-white/50 leading-relaxed">
                      {en
                        ? "Ask about any safety problem, or get help with a report you submitted before."
                        : "اسأل عن أي مشكلة أو خطر في العمل، أو احصل على مساعدة بخصوص بلاغ أرسلته من قبل."}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => startGeneral()}
                      className="w-full flex items-start gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-brand-primary/40 hover:bg-brand-primary/[0.05] transition-all text-start cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center shrink-0">
                        <MessageSquareText className="w-5 h-5 text-brand-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{en ? "Ask about a problem or hazard" : "اسأل عن مشكلة أو خطر"}</p>
                        <p className="text-xs text-white/50 mt-0.5">{en ? "Describe the situation and get practical solutions" : "اشرح الموقف واحصل على حلول وإجراءات عملية"}</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setView("lookup"); setLookupError(""); }}
                      className="w-full flex items-start gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-brand-secondary/50 hover:bg-brand-secondary/[0.06] transition-all text-start cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-xl bg-brand-secondary/15 border border-brand-secondary/30 flex items-center justify-center shrink-0">
                        <FileSearch className="w-5 h-5 text-purple-300" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{en ? "Help with a previous report" : "مساعدة بخصوص بلاغ سابق"}</p>
                        <p className="text-xs text-white/50 mt-0.5">{en ? "Search by the report code you received" : "ابحث بكود البلاغ الذي حصلت عليه عند الإرسال"}</p>
                      </div>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-white/40 uppercase tracking-wider">{en ? "Quick questions" : "أسئلة سريعة"}</p>
                    {generalPrompts.map((p, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => startGeneral(p.text)}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/15 hover:bg-white/[0.05] text-xs text-white/75 hover:text-white transition-all text-start cursor-pointer"
                      >
                        <p.icon className="w-4 h-4 text-brand-primary shrink-0" />
                        <span>{p.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {view === "lookup" && (
                <form onSubmit={handleLookup} className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-white">{en ? "Find your report" : "ابحث عن بلاغك"}</p>
                    <p className="text-xs text-white/50 leading-relaxed">
                      {en ? "Enter the report code you received after submitting (e.g. A01253)." : "اكتب كود البلاغ الذي ظهر لك بعد الإرسال (مثال: A01253)."}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      dir="ltr"
                      autoFocus
                      value={lookupCode}
                      onChange={(e) => setLookupCode(e.target.value.toUpperCase())}
                      placeholder="A01253"
                      maxLength={20}
                      className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white text-center tracking-widest focus:outline-none focus:border-brand-primary/50"
                    />
                    <button
                      type="submit"
                      disabled={isLookingUp || !lookupCode.trim()}
                      className="px-4 rounded-xl bg-brand-primary text-black font-bold text-xs flex items-center gap-1.5 disabled:opacity-40 cursor-pointer shrink-0"
                    >
                      {isLookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      <span>{en ? "Search" : "بحث"}</span>
                    </button>
                  </div>
                  {lookupError && (
                    <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">{lookupError}</p>
                  )}
                </form>
              )}

              {view === "incident" && incident && (
                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-purple-300 text-sm">{incident.id}</span>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full border text-[10px] font-bold",
                      incident.status === "Resolved"
                        ? "text-green-400 bg-green-500/10 border-green-500/20"
                        : "text-orange-400 bg-orange-500/10 border-orange-500/20"
                    )}>
                      {incident.status === "Resolved" ? (en ? "Resolved" : "تم الحل") : (en ? "Open" : "مفتوح")}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-white/60">
                    <span className="truncate">{en ? "Branch:" : "الفرع:"} <span className="text-white/85">{incident.agency || "—"}</span></span>
                    <span className="truncate">{en ? "Type:" : "التصنيف:"} <span className="text-white/85">{(t.classifications as Record<string, string>)[incident.classification || ""] || incident.classification || "—"}</span></span>
                    <span className="truncate col-span-2">
                      {en ? "Risk:" : "الخطورة:"}{" "}
                      <span className={getRiskLevel(Number(incident.riskScore) || 1, language).color}>
                        {Number(incident.riskScore) || 1}/100 — {getRiskLevel(Number(incident.riskScore) || 1, language).label}
                      </span>
                    </span>
                  </div>
                  {incident.description && (
                    <p className="text-white/70 leading-relaxed line-clamp-3 border-t border-white/5 pt-2">{incident.description}</p>
                  )}
                </div>
              )}

              {(view === "general" || view === "incident") && (
                <div className="space-y-3">
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={cn("flex", m.sender === "user" ? "justify-start" : "justify-end")}
                      style={{ justifyContent: m.sender === "user" ? "flex-start" : "flex-end" }}
                    >
                      <div className={cn(
                        "max-w-[88%] px-3.5 py-2.5 rounded-2xl text-xs sm:text-[13px] leading-relaxed",
                        m.sender === "user"
                          ? "bg-white/10 border border-white/10 text-white"
                          : m.error
                            ? "bg-red-500/10 border border-red-500/20 text-red-300"
                            : "bg-brand-primary/[0.06] border border-brand-primary/15 text-white/85"
                      )}>
                        {m.sender === "ai" && !m.error ? <FormattedText text={m.text} /> : <span className="whitespace-pre-wrap">{m.text}</span>}
                      </div>
                    </div>
                  ))}

                  {isSending && (
                    <div className="flex justify-end" style={{ justifyContent: "flex-end" }}>
                      <div className="px-3.5 py-2.5 rounded-2xl bg-brand-primary/[0.06] border border-brand-primary/15 text-xs text-brand-primary flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{en ? "Thinking..." : "جاري التحليل..."}</span>
                      </div>
                    </div>
                  )}

                  {view === "incident" && !hasUserMessages && !isSending && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {incidentPrompts.map((p, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => sendMessage(p, { mode: "incident" })}
                          className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 hover:border-brand-primary/40 text-[11px] text-white/80 hover:text-white transition-all cursor-pointer"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* خانة الكتابة */}
            {(view === "general" || view === "incident") && (
              <form
                onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
                className="flex items-end gap-2 p-3 border-t border-white/10 bg-black/30 shrink-0"
              >
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage(input);
                    }
                  }}
                  maxLength={2000}
                  placeholder={en ? "Type your question..." : "اكتب سؤالك أو صف المشكلة..."}
                  className="flex-1 min-w-0 resize-none max-h-28 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-brand-primary/50"
                />
                <button
                  type="submit"
                  disabled={isSending || !input.trim()}
                  aria-label={en ? "Send" : "إرسال"}
                  className="w-11 h-11 rounded-xl bg-brand-primary text-black flex items-center justify-center disabled:opacity-40 cursor-pointer shrink-0"
                >
                  {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className={cn("w-5 h-5", isRTL && "-scale-x-100")} />}
                </button>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
