import React, { useState, useRef, useEffect } from "react";
import {
  Bot,
  Send,
  Trash2,
  Sparkles,
  Sliders,
  Loader2,
  Check,
  Copy,
  X,
  BookOpen,
  ArrowRight,
  Zap,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { useAppStore } from "../../stores/useAppStore";
import { ActionProposal } from "../../services/agent/agentTools";
import { ChatMessageContent } from "./ChatMessageContent";
import { AgentModelSelector } from "./AgentModelSelector";
import { toast } from "sonner";

const DEFAULT_QUICK_ACTIONS = [
  "Tóm tắt thông tin cuốn sách hiện tại",
  "Đọc và tóm tắt nội dung chương 1",
  "Đổi phong cách sách sang Cổ Phong / Tiên Hiệp",
  "Chuyển sang màn hình Đọc thử & Soát lỗi",
  "Kiểm tra xem sách có bao nhiêu chương và đã dịch được bao nhiêu",
];

const ACTION_CARDS = [
  {
    icon: BookOpen,
    title: "Tóm tắt cuốn sách",
    desc: "Đọc tổng quan về nội dung, thể loại và văn án tác phẩm",
    prompt: "Tóm tắt thông tin cuốn sách hiện tại",
  },
  {
    icon: Sparkles,
    title: "Tóm tắt chương 1",
    desc: "Đọc và phân tích ngắn gọn trích đoạn mở đầu của sách",
    prompt: "Đọc và tóm tắt nội dung chương 1",
  },
  {
    icon: Sliders,
    title: "Đổi phong cách Cổ Phong",
    desc: "Áp dụng định dạng trang nhã cho truyện tiên hiệp / cổ phong",
    prompt: "Đổi phong cách sách sang Cổ Phong / Tiên Hiệp",
  },
  {
    icon: Zap,
    title: "Tiến độ dịch & chương",
    desc: "Kiểm tra số lượng chương đã hoàn thành và còn lại",
    prompt: "Kiểm tra xem sách có bao nhiêu chương và đã dịch được bao nhiêu",
  },
];

export function BookAgentFullView() {
  const {
    agentMessages,
    isAgentThinking,
    agentThinkingStatus,
    sendAgentMessage,
    confirmAgentAction,
    clearAgentChat,
    currentBook,
  } = useAppStore();

  const [inputVal, setInputVal] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [agentMessages, isAgentThinking]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  async function handleCopyMessage(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast.success("Đã sao chép câu trả lời vào clipboard!");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Không thể sao chép văn bản");
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
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Top Header Bar */}
      <header className="px-6 py-3 border-b border-border bg-card/40 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-9 rounded-lg flex items-center justify-center bg-primary/10 text-primary border border-primary/20 shrink-0">
            <Bot size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-foreground">
                Trợ Lý Dự Án Sách (Agent AI)
              </h1>
              <Badge variant="outline" className="text-[10px] h-4.5 px-1.5 border-primary/40 text-primary">
                Full Workspace View
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tương tác trực tiếp với trợ lý thông minh để tóm tắt, tinh chỉnh giao diện và tự động hóa quy trình sách.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {currentBook && (
            <Badge variant="secondary" className="text-xs font-normal gap-1.5 px-2.5 py-1">
              <BookOpen size={12} className="text-primary" />
              <span className="text-foreground font-medium truncate max-w-[200px]">
                {currentBook.title}
              </span>
            </Badge>
          )}

          <AgentModelSelector />

          <Button
            variant="outline"
            size="sm"
            onClick={clearAgentChat}
            className="text-xs h-7 px-2.5 gap-1.5 text-muted-foreground hover:text-destructive"
            title="Xóa toàn bộ cuộc trò chuyện"
          >
            <Trash2 size={13} />
            <span>Xóa đoạn chat</span>
          </Button>
        </div>
      </header>

      {/* Main Conversation Stream */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl w-full mx-auto flex flex-col gap-4">
          {agentMessages.length === 0 ? (
            <div className="flex flex-col items-center text-center py-10 select-none">
              <div className="size-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4 shadow-sm animate-in zoom-in-95 duration-200">
                <Sparkles size={32} />
              </div>
              <h2 className="text-lg font-bold text-foreground mb-2">
                Chào bạn! Tôi có thể giúp gì cho cuốn sách?
              </h2>
              <p className="text-xs text-muted-foreground max-w-md leading-relaxed mb-8">
                Tôi có thể đọc trích đoạn các chương, kiểm tra tình trạng sách, cập nhật thông tin tác phẩm, đổi phong cách hoặc điều hướng giao diện giúp bạn.
              </p>

              {/* 2-Column Action Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full text-left">
                {ACTION_CARDS.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Card
                      key={card.prompt}
                      onClick={() => sendAgentMessage(card.prompt)}
                      className="p-3.5 bg-card/60 hover:bg-card border-border hover:border-primary/50 transition-all cursor-pointer group shadow-2xs"
                    >
                      <div className="flex items-start gap-3">
                        <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                          <Icon size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                              {card.title}
                            </span>
                            <ArrowRight size={13} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-1">
                            {card.desc}
                          </p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
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
                  className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed select-text cursor-text ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-xs font-medium shadow-xs"
                      : "bg-card text-foreground rounded-bl-xs border border-border shadow-xs"
                  }`}
                >
                  <ChatMessageContent content={msg.content} role={msg.role} />

                  {/* Mutating Action Proposal Confirmation Card */}
                  {msg.actionProposal && (
                    <ActionProposalCard
                      proposal={msg.actionProposal}
                      status={msg.actionStatus || "pending"}
                      onConfirm={(approved) => handleConfirmAction(msg.id, approved)}
                    />
                  )}
                </div>

                <div className="flex items-center gap-2 px-1">
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {msg.role === "assistant" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleCopyMessage(msg.id, msg.content)}
                      className="size-5 text-muted-foreground hover:text-foreground"
                      title="Sao chép câu trả lời"
                    >
                      {copiedId === msg.id ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Thinking Indicator */}
          {isAgentThinking && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 rounded-xl bg-card border border-border w-fit shadow-2xs animate-pulse">
              <Loader2 size={14} className="animate-spin text-primary" />
              <span>{agentThinkingStatus || "Trợ lý đang suy nghĩ và kiểm tra dự án sách..."}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Fixed Bottom Input Bar */}
      <footer className="p-4 border-t border-border bg-card/60 backdrop-blur-md shrink-0">
        <div className="max-w-3xl w-full mx-auto flex flex-col gap-2">
          {/* Quick chips if conversation is active */}
          {agentMessages.length > 0 && !isAgentThinking && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {DEFAULT_QUICK_ACTIONS.map((actionText) => (
                <button
                  key={actionText}
                  type="button"
                  onClick={() => sendAgentMessage(actionText)}
                  className="whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] bg-secondary border border-border hover:border-primary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {actionText}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2.5 bg-secondary/50 border border-border rounded-2xl p-2.5 focus-within:border-primary transition-colors shadow-xs">
            <textarea
              ref={inputRef}
              rows={2}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Hỏi về nội dung sách, yêu cầu đổi kiểu chữ, tóm tắt chương hoặc tự động hóa tác vụ..."
              disabled={isAgentThinking}
              className="flex-1 bg-transparent text-xs text-foreground outline-none resize-none leading-relaxed placeholder:text-muted-foreground select-text"
            />

            {isAgentThinking ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => useAppStore.setState({ isAgentThinking: false, agentThinkingStatus: null })}
                className="text-destructive hover:bg-destructive/10 shrink-0"
                title="Dừng / Hủy phản hồi"
              >
                <X size={14} />
              </Button>
            ) : (
              <Button
                type="button"
                disabled={!inputVal.trim()}
                onClick={handleSend}
                size="icon-sm"
                className="shrink-0"
                title="Gửi tin nhắn (Enter)"
              >
                <Send size={13} />
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
            <span>Trợ lý có thể thực thi các thao tác thay đổi trực tiếp sau khi bạn xác nhận.</span>
            <div className="flex items-center gap-3">
              <AgentModelSelector compact />
              <span className="text-[10px] opacity-75">Enter để gửi · Shift+Enter xuống dòng</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

interface ActionProposalCardProps {
  proposal: ActionProposal;
  status: "pending" | "approved" | "rejected" | "executed";
  onConfirm: (approved: boolean) => void;
}

function ActionProposalCard({ proposal, status, onConfirm }: ActionProposalCardProps) {
  return (
    <div className="mt-2.5 p-3 rounded-lg border border-amber-500/40 bg-amber-500/5 text-foreground flex flex-col gap-2 shadow-xs animate-in fade-in duration-150">
      {/* Proposal Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-semibold text-[11px] text-amber-500">
          <Sliders size={13} />
          <span>{proposal.title}</span>
        </div>

        {status === "executed" && (
          <Badge variant="secondary" className="text-[9px] px-1.5 h-3.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            Đã thực thi
          </Badge>
        )}
        {status === "rejected" && (
          <Badge variant="outline" className="text-[9px] px-1.5 h-3.5 text-muted-foreground">
            Đã bỏ qua
          </Badge>
        )}
        {status === "pending" && (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[9px] px-1.5 h-3.5">
            Chờ xác nhận
          </Badge>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground leading-tight">
        {proposal.description}
      </p>

      {/* Diffs / Changes Summary */}
      {proposal.diffSummary && proposal.diffSummary.length > 0 && (
        <div className="border border-border rounded bg-card/80 overflow-hidden mt-0.5">
          <table className="w-full text-[10px] text-left">
            <tbody className="divide-y divide-border/60">
              {proposal.diffSummary.map((d, i) => (
                <tr key={i} className="hover:bg-secondary/30">
                  <td className="p-1.5 font-medium text-muted-foreground w-24">
                    {d.field}
                  </td>
                  <td className="p-1.5 text-muted-foreground line-through">
                    {d.before || "(Trống)"}
                  </td>
                  <td className="p-1.5 text-center w-4 text-primary">➔</td>
                  <td className="p-1.5 font-semibold text-primary">
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
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onConfirm(false)}
            className="text-[10px] h-6 px-2 text-muted-foreground hover:text-foreground"
          >
            Bỏ qua
          </Button>
          <Button
            type="button"
            size="xs"
            onClick={() => onConfirm(true)}
            className="text-[10px] h-6 px-2.5 gap-1 font-medium shadow-xs"
          >
            <Check size={11} />
            <span>Chấp nhận thực thi</span>
          </Button>
        </div>
      )}
    </div>
  );
}
