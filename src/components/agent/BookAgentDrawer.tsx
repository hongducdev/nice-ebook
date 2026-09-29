import { useState, useRef, useEffect } from "react";
import {
  Bot,
  X,
  Send,
  Trash2,
  Sparkles,
  Sliders,
  Loader2,
  Check,
  ChevronRight
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import { ActionProposal } from "../../services/agent/agentTools";
import { toast } from "sonner";

const QUICK_ACTIONS = [
  "Tóm tắt thông tin cuốn sách hiện tại",
  "Đọc và tóm tắt nội dung chương 1",
  "Đổi phong cách sách sang Cổ Phong / Tiên Hiệp",
  "Chuyển sang màn hình Đọc thử & Soát lỗi",
  "Kiểm tra xem sách có bao nhiêu chương và đã dịch được bao nhiêu",
];

export function BookAgentDrawer() {
  const {
    isAgentDrawerOpen,
    toggleAgentDrawer,
    setAgentDrawerOpen,
    agentMessages,
    isAgentThinking,
    sendAgentMessage,
    confirmAgentAction,
    clearAgentChat,
    currentBook,
    activeGateway,
    selectedModel,
  } = useAppStore();

  const [inputVal, setInputVal] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto scroll to bottom when messages update or thinking
  useEffect(() => {
    if (isAgentDrawerOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [agentMessages, isAgentThinking, isAgentDrawerOpen]);

  // Focus input on drawer open
  useEffect(() => {
    if (isAgentDrawerOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isAgentDrawerOpen]);

  if (!isAgentDrawerOpen) {
    return null;
  }

  async function handleSend() {
    const text = inputVal.trim();
    if (!text || isAgentThinking) return;
    setInputVal("");
    await sendAgentMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleConfirmAction(msgId: string, approved: boolean) {
    await confirmAgentAction(msgId, approved);
    if (approved) {
      toast.success("Đã thực thi hành động thành công!");
    } else {
      toast.info("Đã bỏ qua đề xuất.");
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200"
        onClick={() => setAgentDrawerOpen(false)}
      />

      {/* Slide-out Drawer Panel */}
      <aside className="fixed top-0 right-0 bottom-0 z-50 w-[420px] max-w-[95vw] bg-[var(--card)] border-l border-[var(--border)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 select-text">
        {/* Drawer Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--secondary)]/40 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[color-mix(in_srgb,var(--primary)_15%,var(--card))] text-[var(--primary)] border border-[var(--primary)]/30 shrink-0">
              <Bot size={18} />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs font-semibold text-[var(--foreground)] truncate">
                  Trợ Lý Dự Án Sách
                </h2>
                <span className="app-badge app-badge--brand text-[9px] px-1.5 h-3.5">
                  Agent AI
                </span>
              </div>
              <span className="text-[10px] text-[var(--muted-foreground)] truncate">
                {currentBook ? currentBook.title : "Chưa mở sách"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--secondary)] border border-[var(--border)] text-[10px] font-mono text-[var(--muted-foreground)] mr-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="truncate max-w-[100px]">
                {selectedModel || (activeGateway ? activeGateway.models[0] : "Ollama/Local")}
              </span>
            </div>

            <button
              type="button"
              onClick={clearAgentChat}
              className="p-1.5 rounded hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-red-400 transition-colors cursor-pointer"
              title="Xóa toàn bộ cuộc trò chuyện"
            >
              <Trash2 size={13} />
            </button>
            <button
              type="button"
              onClick={toggleAgentDrawer}
              className="p-1.5 rounded hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
              title="Đóng ngăn kéo"
            >
              <X size={15} />
            </button>
          </div>
        </header>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {agentMessages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 select-none">
              <div className="w-12 h-12 rounded-2xl bg-[var(--secondary)] border border-[var(--border)] flex items-center justify-center text-[var(--primary)] mb-3 shadow-xs">
                <Sparkles size={24} />
              </div>
              <h3 className="text-xs font-semibold text-[var(--foreground)] mb-1">
                Chào bạn! Tôi có thể giúp gì cho cuốn sách?
              </h3>
              <p className="text-[11px] text-[var(--muted-foreground)] max-w-xs leading-relaxed mb-6">
                Tôi có thể đọc và tóm tắt các chương, kiểm tra tình trạng sách, cập nhật thông tin tác phẩm, đổi phong cách hoặc điều hướng giao diện giúp bạn.
              </p>

              <div className="w-full flex flex-col gap-1.5 text-left">
                <span className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)] tracking-wider">
                  Gợi ý thao tác nhanh:
                </span>
                {QUICK_ACTIONS.map((promptText) => (
                  <button
                    key={promptText}
                    type="button"
                    onClick={() => sendAgentMessage(promptText)}
                    className="p-2 rounded-lg border border-[var(--border)] bg-[var(--secondary)]/30 hover:bg-[var(--secondary)] hover:border-[var(--primary)]/50 text-[11px] text-[var(--foreground)] flex items-center justify-between gap-2 transition-all text-left cursor-pointer group"
                  >
                    <span>{promptText}</span>
                    <ChevronRight size={12} className="text-[var(--muted-foreground)] group-hover:text-[var(--primary)] shrink-0 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            agentMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col gap-1.5 ${
                  msg.role === "user" ? "items-end" : "items-start"
                }`}
              >
                {/* Message Bubble */}
                <div
                  className={`max-w-[90%] rounded-xl p-3 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[var(--primary)] text-[var(--primary-foreground)] rounded-br-xs font-medium shadow-xs"
                      : "bg-[var(--secondary)]/70 text-[var(--foreground)] rounded-bl-xs border border-[var(--border)] shadow-xs"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>

                  {/* Mutating Action Proposal Confirmation Card */}
                  {msg.actionProposal && (
                    <ActionProposalCard
                      proposal={msg.actionProposal}
                      status={msg.actionStatus || "pending"}
                      onConfirm={(approved) => handleConfirmAction(msg.id, approved)}
                    />
                  )}
                </div>

                <span className="text-[9px] text-[var(--muted-foreground)] px-1">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))
          )}

          {/* Thinking Indicator */}
          {isAgentThinking && (
            <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] p-2">
              <Loader2 size={13} className="animate-spin text-[var(--primary)]" />
              <span>Trợ lý đang suy nghĩ và kiểm tra dự án...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Drawer Footer: Input Box */}
        <footer className="p-3 border-t border-[var(--border)] bg-[var(--card)]/90 backdrop-blur-xs flex flex-col gap-2">
          {/* Quick chips if conversation is active */}
          {agentMessages.length > 0 && !isAgentThinking && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                onClick={() => sendAgentMessage("Tóm tắt chương hiện tại")}
                className="whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] bg-[var(--secondary)] border border-[var(--border)] hover:border-[var(--primary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
              >
                Tóm tắt chương
              </button>
              <button
                type="button"
                onClick={() => sendAgentMessage("Kiểm tra tình trạng dự án sách")}
                className="whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] bg-[var(--secondary)] border border-[var(--border)] hover:border-[var(--primary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
              >
                Tình trạng sách
              </button>
              <button
                type="button"
                onClick={() => sendAgentMessage("Đổi phong cách sách sang Cổ Phong / Tiên Hiệp")}
                className="whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] bg-[var(--secondary)] border border-[var(--border)] hover:border-[var(--primary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
              >
                Đổi phong cách
              </button>
              <button
                type="button"
                onClick={() => sendAgentMessage("Chuyển sang màn hình Đọc thử & Soát lỗi")}
                className="whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] bg-[var(--secondary)] border border-[var(--border)] hover:border-[var(--primary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
              >
                Mở Đọc thử
              </button>
            </div>
          )}

          <div className="flex items-end gap-2 bg-[var(--secondary)]/60 border border-[var(--border)] rounded-xl p-2 focus-within:border-[var(--primary)] transition-colors">
            <textarea
              ref={inputRef}
              rows={2}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Hỏi về nội dung sách, yêu cầu đổi kiểu chữ, tóm tắt chương..."
              disabled={isAgentThinking}
              className="flex-1 bg-transparent text-xs text-[var(--foreground)] outline-none resize-none leading-relaxed placeholder:text-[var(--muted-foreground)]"
            />

            <button
              type="button"
              disabled={!inputVal.trim() || isAgentThinking}
              onClick={handleSend}
              className="p-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer shrink-0"
              title="Gửi tin nhắn (Enter)"
            >
              {isAgentThinking ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}

interface ActionProposalCardProps {
  proposal: ActionProposal;
  status: "pending" | "approved" | "rejected" | "executed";
  onConfirm: (approved: boolean) => void;
}

function ActionProposalCard({ proposal, status, onConfirm }: ActionProposalCardProps) {
  return (
    <div className="mt-2.5 p-3 rounded-lg border border-amber-500/40 bg-amber-500/5 text-[var(--foreground)] flex flex-col gap-2 shadow-xs animate-in fade-in duration-150">
      {/* Proposal Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-semibold text-[11px] text-amber-500">
          <Sliders size={13} />
          <span>{proposal.title}</span>
        </div>

        {status === "executed" && (
          <span className="app-badge app-badge--success text-[9px] px-1.5 h-3.5">
            Đã thực thi
          </span>
        )}
        {status === "rejected" && (
          <span className="app-badge app-badge--neutral text-[9px] px-1.5 h-3.5">
            Đã bỏ qua
          </span>
        )}
        {status === "pending" && (
          <span className="app-badge bg-amber-500/20 text-amber-500 border border-amber-500/30 text-[9px] px-1.5 h-3.5">
            Chờ xác nhận
          </span>
        )}
      </div>

      <p className="text-[10px] text-[var(--muted-foreground)] leading-tight">
        {proposal.description}
      </p>

      {/* Diffs / Changes Summary */}
      {proposal.diffSummary && proposal.diffSummary.length > 0 && (
        <div className="border border-[var(--border)] rounded bg-[var(--card)]/80 overflow-hidden mt-0.5">
          <table className="w-full text-[10px] text-left">
            <tbody className="divide-y divide-[var(--border)]/60">
              {proposal.diffSummary.map((d, i) => (
                <tr key={i} className="hover:bg-[var(--secondary)]/30">
                  <td className="p-1.5 font-medium text-[var(--muted-foreground)] w-24">
                    {d.field}
                  </td>
                  <td className="p-1.5 text-[var(--muted-foreground)] line-through">
                    {d.before || "(Trống)"}
                  </td>
                  <td className="p-1.5 text-center w-4 text-[var(--primary)]">➔</td>
                  <td className="p-1.5 font-semibold text-[var(--primary)]">
                    {d.after}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action Decision Buttons */}
      {status === "pending" && (
        <div className="flex items-center justify-end gap-2 pt-1 mt-1 border-t border-amber-500/20">
          <button
            type="button"
            onClick={() => onConfirm(false)}
            className="px-2.5 py-1 rounded text-[10px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors cursor-pointer"
          >
            Bỏ qua
          </button>
          <button
            type="button"
            onClick={() => onConfirm(true)}
            className="px-2.5 py-1 rounded text-[10px] font-semibold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity flex items-center gap-1 shadow-xs cursor-pointer"
          >
            <Check size={11} />
            <span>Chấp nhận thực thi</span>
          </button>
        </div>
      )}
    </div>
  );
}
