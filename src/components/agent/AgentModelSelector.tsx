import { useMemo } from "react";
import { Cpu, Settings2, Zap } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from "../ui/select";
import { Button } from "../ui/button";
import { useAppStore } from "../../stores/useAppStore";
import { categorizeGatewayModels } from "../../utils/gatewayModelCategorizer";
import { toast } from "sonner";

const POPULAR_FALLBACK_MODELS = [
  "claude-3-5-sonnet",
  "claude-3-5-haiku",
  "gpt-4o",
  "gpt-4o-mini",
  "gemini-2.0-flash",
  "gemini-1.5-pro",
  "deepseek-chat",
  "qwen2.5-coder",
  "llama3.2",
];

interface AgentModelSelectorProps {
  className?: string;
  compact?: boolean;
}

export function AgentModelSelector({ className, compact = false }: AgentModelSelectorProps) {
  const {
    activeGateway,
    selectedModel,
    setSelectedModel,
    setActiveTab,
    cavemanMode,
    setCavemanMode,
  } = useAppStore();

  const categorizedModels = useMemo(
    () => categorizeGatewayModels(activeGateway),
    [activeGateway]
  );

  const currentModel = selectedModel || (activeGateway?.models?.[0]) || "claude-3-5-sonnet";
  const isOnline = Boolean(activeGateway?.is_online);

  return (
    <div className={`flex items-center gap-1.5 ${className || ""}`}>
      <Select
        value={currentModel}
        onValueChange={(val) => {
          setSelectedModel(val);
          toast.success(`Đã kích hoạt mô hình: ${val}`);
        }}
      >
        <SelectTrigger
          size="sm"
          className={`h-7 text-xs font-mono gap-1.5 bg-muted/50 border-border transition-all ${
            compact ? "max-w-[170px]" : "min-w-[160px] max-w-[240px]"
          }`}
          title={`Mô hình AI đang dùng: ${currentModel} (${activeGateway?.name || "Lõi Cục Bộ"})`}
        >
          <span
            className={`size-1.5 rounded-full shrink-0 ${
              isOnline ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
            }`}
          />
          <Cpu className="size-3 text-primary shrink-0" />
          <span className="truncate text-left flex-1 font-medium">{currentModel}</span>
          {cavemanMode !== "off" && !compact && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/15 text-amber-500 font-mono shrink-0">
              ⚡ Caveman
            </span>
          )}
        </SelectTrigger>

        <SelectContent align="end" className="max-h-80 w-64 text-xs font-mono">
          {categorizedModels.length > 0 ? (
            categorizedModels.map((category) => (
              <SelectGroup key={category.id}>
                <SelectLabel className="text-[10px] font-sans font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span>{category.name}</span>
                  <span className="text-[9px] font-mono opacity-70">
                    {category.models.length}
                  </span>
                </SelectLabel>
                {category.models.map((model) => (
                  <SelectItem key={model} value={model} className="text-xs font-mono">
                    <span className="truncate">{model}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))
          ) : (
            <SelectGroup>
              <SelectLabel className="text-[10px] font-sans font-semibold uppercase tracking-wider text-muted-foreground">
                {activeGateway ? activeGateway.name : "Mô hình phổ biến (Cần Gateway)"}
              </SelectLabel>
              {(activeGateway?.models?.length ? activeGateway.models : POPULAR_FALLBACK_MODELS).map(
                (model) => (
                  <SelectItem key={model} value={model} className="text-xs font-mono">
                    <span className="truncate">{model}</span>
                  </SelectItem>
                )
              )}
            </SelectGroup>
          )}

          <SelectSeparator />
          <div className="p-2 flex flex-col gap-1.5 bg-muted/20">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-foreground flex items-center gap-1">
                <Zap size={10} className="text-amber-500" />
                <span>Caveman Token Opt</span>
              </span>
              <span className="text-[9px] font-mono text-primary font-medium">
                {cavemanMode.toUpperCase()}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {(["off", "lite", "full", "ultra"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCavemanMode(mode);
                    toast.info(`Caveman: ${mode.toUpperCase()}`);
                  }}
                  className={`text-[9px] py-0.5 rounded border transition-colors cursor-pointer ${
                    cavemanMode === mode
                      ? "border-primary bg-primary/15 text-primary font-bold"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <SelectSeparator />
          <div className="p-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setActiveTab("ai")}
              className="w-full justify-start text-[11px] font-sans gap-1.5 text-muted-foreground hover:text-primary h-7"
            >
              <Settings2 size={12} />
              <span>Quản lý Cổng AI &amp; Khóa API...</span>
            </Button>
          </div>
        </SelectContent>
      </Select>
    </div>
  );
}
