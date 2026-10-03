import { useState, useRef, useEffect } from "react";
import {
  Bot,
  X,
  Send,
  Trash2,
  Sparkles,
  Loader2,
  Check,
  ChevronRight,
  Copy
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../ui/sheet";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { useAppStore } from "../../stores/useAppStore";
import { ChatMessageContent } from "./ChatMessageContent";
import { AgentModelSelector } from "./AgentModelSelector";
import { ActionProposalCard } from "./ActionProposalCard";
import { AgentActiveTaskMonitor } from "./AgentActiveTaskMonitor";
import { toast } from "sonner";

const DEFAULT_QUICK_ACTIONS = [
  "Tóm tắt thông tin cuốn sách hiện tại",
  "Đọc và tóm tắt nội dung chương 1",
  "Đổi phong cách sách sang Cổ Phong / Tiên Hiệp",
  "Chuyển sang màn hình Đọc thử & Soát lỗi",
  "Kiểm tra xem sách có bao nhiêu chương và đã dịch được bao nhiêu",
];

const TAB_QUICK_ACTIONS: Record<string, string[]> = {
  reader: [
    "Tóm tắt chương hiện tại",
    "Đổi phong cách sách sang Cổ Phong / Tiên Hiệp",
    "Kiểm tra xem sách có bao nhiêu chương",
    "Xuất sách sang file EPUB hoàn chỉnh",
  ],
  translator: [
    "Dịch chương hiện tại sang tiếng Việt",
    "Kiểm tra tiến độ dịch và các tác vụ nền",
    "Thêm từ khóa nhân vật vào Glossary",
    "Chuyển sang màn hình Đọc thử & Soát lỗi",
  ],
  ai: [
    "Chuẩn hóa tiêu đề H1 và sửa lỗi chính tả chương này",
    "Làm sạch watermark và rác quảng cáo trong sách",
    "Kiểm tra tình trạng các chương đã tinh chỉnh",
    "Chuyển sang màn hình Đọc thử",
  ],
  "ai-editor": [
    "Chuẩn hóa tiêu đề H1 và sửa lỗi chính tả chương này",
    "Làm sạch watermark và rác quảng cáo trong sách",
    "Kiểm tra tình trạng các chương đã tinh chỉnh",
    "Chuyển sang màn hình Đọc thử",
  ],
  converter: [
    "Kiểm tra trạng thái các tác vụ nền (Workflow Jobs)",
    "Chuyển sang tab Đọc thử sau khi chuyển đổi",
    "Cập nhật tên sách và tác giả",
    "Tóm tắt chương đầu tiên",
  ],
};

export function BookAgentDrawer() {
  const {
    isAgentDrawerOpen,
    toggleAgentDrawer,
    setAgentDrawerOpen,
    agentMessages,
    isAgentThinking,
    agentThinkingStatus,
    sendAgentMessage,
    confirmAgentAction,
    clearAgentChat,
    currentBook,
    activeTab,
  } = useAppStore();

  const currentQuickActions = TAB_QUICK_ACTIONS[activeTab] || DEFAULT_QUICK_ACTIONS;
  const [inputVal, setInputVal] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function handleCopyMessage(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast.success("Đã sao chép phản hồi vào clipboard!");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Không thể sao chép văn bản");
    }
  }

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

  if (!isAgentDrawerOpen || activeTab === "agent") {
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
    <Sheet open={isAgentDrawerOpen} onOpenChange={(open) => setAgentDrawerOpen(open)}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[420px] max-w-[95vw] p-0 flex flex-col gap-0 border-l border-border bg-card shadow-2xl select-text"
      >
        {/* Drawer Header */}
        <SheetHeader className="flex flex-row items-center justify-between px-4 py-3 border-b border-border bg-muted/40 shrink-0 space-y-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary border border-primary/20 shrink-0">
              <Bot size={18} />
            </div>
            <div className="flex flex-col min-w-0 text-left">
              <div className="flex items-center gap-1.5">
                <SheetTitle className="text-xs font-semibold text-foreground truncate">
                  Trợ Lý Dự Án Sách
                </SheetTitle>
                <Badge variant="outline" className="text-xs px-2 h-5 border-primary/40 text-primary">
                  Agent AI
                </Badge>
              </div>
              <SheetDescription className="text-xs text-muted-foreground truncate">
                {currentBook ? currentBook.title : "Chưa mở sách"}
              </SheetDescription>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <AgentModelSelector compact className="mr-1" />

            <Button
              variant="ghost"
              size="icon"
              onClick={clearAgentChat}
              className="size-7 text-muted-foreground hover:text-destructive"
              title="Xóa toàn bộ cuộc trò chuyện"
            >
              <Trash2 size={13} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleAgentDrawer}
              className="size-7 text-muted-foreground hover:text-foreground"
              title="Đóng ngăn kéo"
            >
              <X size={15} />
            </Button>
          </div>
        </SheetHeader>
        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          <AgentActiveTaskMonitor />

          {agentMessages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 select-none">
              <div className="size-12 rounded-2xl bg-secondary border border-border flex items-center justify-center text-primary mb-3 shadow-xs">
                <Sparkles size={24} />
              </div>
              <h3 className="text-xs font-semibold text-foreground mb-1">
                Chào bạn! Tôi có thể giúp gì cho cuốn sách?
              </h3>
              <p className="text-xs text-muted-foreground max-w-xs leading-relaxed mb-6">
                Tôi có thể đọc và tóm tắt các chương, kiểm tra tình trạng sách, cập nhật thông tin tác phẩm, đổi phong cách hoặc điều hướng giao diện giúp bạn.
              </p>

              <div className="w-full flex flex-col gap-1.5 text-left">
                <span className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
                  Gợi ý thao tác nhanh:
                </span>
                {currentQuickActions.map((promptText) => (
                  <button
                    key={promptText}
                    type="button"
                    onClick={() => sendAgentMessage(promptText)}
                    className="p-2 rounded-lg border border-border bg-secondary/30 hover:bg-secondary hover:border-primary/50 text-xs text-foreground flex items-center justify-between gap-2 transition-all text-left cursor-pointer group"
                  >
                    <span>{promptText}</span>
                    <ChevronRight size={12} className="text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
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
                  className={`max-w-[92%] rounded-xl p-3 text-xs leading-relaxed select-text cursor-text ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-xs font-medium shadow-xs"
                      : "bg-secondary/70 text-foreground rounded-bl-xs border border-border shadow-xs"
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
                  <span className="text-xs text-muted-foreground">
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground p-2.5 rounded-lg bg-secondary/50 border border-border/60 animate-pulse">
              <Loader2 size={13} className="animate-spin text-primary shrink-0" />
              <span className="truncate font-medium">{agentThinkingStatus || "Trợ lý đang suy nghĩ và kiểm tra dự án..."}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Drawer Footer: Input Box */}
        <footer className="p-3 border-t border-border bg-card/90 backdrop-blur-xs flex flex-col gap-2">
          {/* Quick chips if conversation is active */}
          {agentMessages.length > 0 && !isAgentThinking && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {currentQuickActions.slice(0, 4).map((actionText) => (
                <button
                  key={actionText}
                  type="button"
                  onClick={() => sendAgentMessage(actionText)}
                  className="whitespace-nowrap px-2 py-0.5 rounded-full text-xs bg-secondary border border-border hover:border-primary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {actionText.length > 25 ? `${actionText.slice(0, 24)}...` : actionText}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 bg-secondary/60 border border-border rounded-xl p-2 focus-within:border-primary transition-colors">
            <textarea
              ref={inputRef}
              rows={2}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Hỏi về nội dung sách, yêu cầu đổi kiểu chữ, tóm tắt chương..."
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
        </footer>
      </SheetContent>
    </Sheet>
  );
}
