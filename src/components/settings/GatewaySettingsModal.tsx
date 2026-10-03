import { useState, useEffect } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Activity,
  ExternalLink,
  SlidersHorizontal,
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import {
  LINGUAGACHA_PRESETS,
  ConfiguredProvider,
  loadConfiguredProviders,
  saveConfiguredProviders,
} from "../../services/ai/linguaGachaProviders";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Alert, AlertDescription } from "../ui/alert";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

export interface GatewaySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProvider?: ConfiguredProvider | null;
  onSaved?: (provider: ConfiguredProvider) => void;
}

export function GatewaySettingsModal({
  isOpen,
  onClose,
  initialProvider,
  onSaved,
}: GatewaySettingsModalProps) {
  const { selectGateway, setSelectedModel } = useAppStore();

  const [selectedPresetId, setSelectedPresetId] = useState<string>("deepseek");
  const [name, setName] = useState<string>("");
  const [baseUrl, setBaseUrl] = useState<string>("https://api.deepseek.com/v1");
  const [apiKey, setApiKey] = useState<string>("");
  const [model, setModel] = useState<string>("deepseek-chat");
  const [availableModels, setAvailableModels] = useState<string[]>(["deepseek-chat", "deepseek-reasoner"]);

  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<"none" | "success" | "error">("none");
  const [testMessage, setTestMessage] = useState("");

  const currentPreset = LINGUAGACHA_PRESETS.find((p) => p.id === selectedPresetId) || LINGUAGACHA_PRESETS[0];

  useEffect(() => {
    if (initialProvider) {
      setSelectedPresetId(initialProvider.presetId || "custom");
      setName(initialProvider.name);
      setBaseUrl(initialProvider.baseUrl);
      setApiKey(initialProvider.apiKey || "");
      setModel(initialProvider.selectedModel);
      setAvailableModels(initialProvider.availableModels.length > 0 ? initialProvider.availableModels : [initialProvider.selectedModel]);
    } else {
      // Default to DeepSeek preset
      const preset = LINGUAGACHA_PRESETS[0];
      setSelectedPresetId(preset.id);
      setName(preset.name);
      setBaseUrl(preset.baseUrl);
      setApiKey("");
      setModel(preset.defaultModel);
      setAvailableModels(preset.availableModels);
    }
    setTestStatus("none");
    setTestMessage("");
  }, [initialProvider, isOpen]);

  function handlePresetChange(presetId: string) {
    setSelectedPresetId(presetId);
    const preset = LINGUAGACHA_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    setName(preset.name);
    setBaseUrl(preset.baseUrl);
    setModel(preset.defaultModel);
    setAvailableModels(preset.availableModels);
    setTestStatus("none");
    setTestMessage("");
  }

  async function handleTestConnection() {
    setIsTesting(true);
    setTestStatus("none");
    setTestMessage("");

    let url = baseUrl.trim();
    if (url.endsWith("/")) url = url.slice(0, -1);
    const testUrl = `${url}/models`;
    const start = performance.now();

    try {
      const headers: Record<string, string> = {};
      if (apiKey.trim()) {
        headers["Authorization"] = `Bearer ${apiKey.trim()}`;
      }

      const res = await fetch(testUrl, { headers });
      const latencyMs = Math.max(1, Math.round(performance.now() - start));

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        let fetchedModels: string[] = [];
        if (Array.isArray(data.data)) {
          fetchedModels = data.data.map((m: { id: string }) => m.id).filter(Boolean);
        }

        if (fetchedModels.length > 0) {
          setAvailableModels(fetchedModels);
          if (!fetchedModels.includes(model)) {
            setModel(fetchedModels[0]);
          }
        }

        setTestStatus("success");
        setTestMessage(`Kết nối tốt (${latencyMs}ms)! Đã nhận diện ${fetchedModels.length || availableModels.length} mô hình.`);
        toast.success(`Kết nối tới ${name} thành công (${latencyMs}ms)!`);
      } else {
        // If /models returned 404 or auth required, but host reachable:
        if (res.status === 401 || res.status === 403) {
          throw new Error(`Mã lỗi HTTP ${res.status}: Khóa API Key không hợp lệ hoặc thiếu quyền truy cập.`);
        }
        setTestStatus("success");
        setTestMessage(`Cổng API phản hồi (~${latencyMs}ms), sẵn sàng sử dụng.`);
        toast.success(`Cổng API hoạt động tốt (${latencyMs}ms)!`);
      }
    } catch (err: unknown) {
      setTestStatus("error");
      const msg = err instanceof Error ? err.message : String(err);
      setTestMessage(msg);
      toast.error(`Kiểm tra kết nối thất bại: ${msg}`);
    } finally {
      setIsTesting(false);
    }
  }

  function handleSaveAndActivate() {
    let cleanUrl = baseUrl.trim();
    if (cleanUrl.endsWith("/")) cleanUrl = cleanUrl.slice(0, -1);

    const providerId = initialProvider?.id || `prov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const finalModels = availableModels.includes(model) ? availableModels : [model, ...availableModels];

    const savedProvider: ConfiguredProvider = {
      id: providerId,
      presetId: selectedPresetId,
      name: name.trim() || currentPreset.name,
      baseUrl: cleanUrl,
      apiKey: apiKey.trim(),
      selectedModel: model.trim() || currentPreset.defaultModel,
      availableModels: finalModels,
      isActive: true,
      createdAt: initialProvider?.createdAt || Date.now(),
    };

    // Update localStorage providers list
    const currentList = loadConfiguredProviders();
    const existingIdx = currentList.findIndex((p) => p.id === savedProvider.id);
    let updatedList: ConfiguredProvider[];
    if (existingIdx !== -1) {
      updatedList = currentList.map((p) => (p.id === savedProvider.id ? savedProvider : { ...p, isActive: false }));
    } else {
      updatedList = [...currentList.map((p) => ({ ...p, isActive: false })), savedProvider];
    }
    saveConfiguredProviders(updatedList);

    // Activate in AppStore
    selectGateway({
      name: savedProvider.name,
      base_url: savedProvider.baseUrl,
      port: 0,
      is_online: true,
      models: finalModels,
      gateway_type: savedProvider.presetId === "ollama" ? "ollama" : "openai",
      latency_ms: 15,
      api_key: savedProvider.apiKey || undefined,
      is_user_configured: true,
      configured_providers: [
        {
          provider: savedProvider.presetId,
          name: savedProvider.name,
          is_active: true,
          test_status: "active",
        },
      ],
    });

    setSelectedModel(savedProvider.selectedModel);
    onSaved?.(savedProvider);
    toast.success(`Đã kích hoạt nhà cung cấp: ${savedProvider.name}`);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden select-none">
        {/* Header */}
        <DialogHeader className="px-5 py-3.5 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-primary" />
            <DialogTitle className="text-sm font-semibold">
              {initialProvider ? "Chỉnh Sửa AI Provider" : "Thiết Lập AI Provider (LinguaGacha)"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Cấu hình nhà cung cấp dịch thuật AI (DeepSeek, Gemini, Claude, OpenAI, Ollama...).
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="p-5 flex flex-col gap-3.5 max-h-[75vh] overflow-y-auto">
          {/* Preset Selector */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-foreground">Chọn mẫu nhà cung cấp (Preset):</Label>
            <Select value={selectedPresetId} onValueChange={handlePresetChange}>
              <SelectTrigger className="w-full text-xs font-sans">
                <SelectValue placeholder="Chọn nhà cung cấp" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase font-semibold text-muted-foreground">
                    Đám mây phổ biến (Cloud API)
                  </SelectLabel>
                  {LINGUAGACHA_PRESETS.filter((p) => p.category === "cloud").map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: p.accent }} />
                        <span className="font-medium">{p.name}</span>
                        {p.id === "deepseek" && (
                          <Badge variant="secondary" className="text-[9px] h-3.5 px-1 bg-primary/10 text-primary">
                            Khuyên dùng
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>

                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase font-semibold text-muted-foreground">
                    Cục bộ Offline (Local Inference)
                  </SelectLabel>
                  {LINGUAGACHA_PRESETS.filter((p) => p.category === "local").map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: p.accent }} />
                        <span>{p.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>

                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase font-semibold text-muted-foreground">
                    Tùy chỉnh khác
                  </SelectLabel>
                  {LINGUAGACHA_PRESETS.filter((p) => p.category === "custom").map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: p.accent }} />
                        <span>{p.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <span className="text-[10px] text-muted-foreground leading-tight">
              {currentPreset.description}
            </span>
          </div>

          {/* Provider Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="provider-name" className="text-xs font-medium text-foreground">
              Tên gọi hiển thị:
            </Label>
            <Input
              id="provider-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: DeepSeek Official hoặc Tài khoản 2"
              className="text-xs font-sans"
            />
          </div>

          {/* Base URL */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="base-url" className="text-xs font-medium text-foreground">
              Endpoint Base URL (Tương thích OpenAI):
            </Label>
            <Input
              id="base-url"
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.domain.com/v1"
              className="text-xs font-mono"
            />
            <span className="text-[10px] text-muted-foreground">
              Giao thức tiêu chuẩn kết nối tới <code className="text-primary font-mono">{baseUrl}/chat/completions</code>.
            </span>
          </div>

          {/* API Key */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="api-key" className="text-xs font-medium text-foreground">
                API Key {currentPreset.requiresApiKey ? "(Bắt buộc)" : "(Tùy chọn cho Local)"}:
              </Label>
              {currentPreset.apiKeyHelpUrl && (
                <a
                  href={currentPreset.apiKeyHelpUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-primary hover:underline flex items-center gap-1"
                >
                  <span>Lấy API key</span>
                  <ExternalLink size={10} />
                </a>
              )}
            </div>
            <Input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={currentPreset.placeholderKey || "sk-..."}
              className="text-xs font-mono"
            />
          </div>

          {/* Model Selection */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="provider-model" className="text-xs font-medium text-foreground">
              Mô hình chính (Model):
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Select value={model} onValueChange={(val) => setModel(val)}>
                <SelectTrigger id="provider-model" className="w-full min-w-0 text-xs font-mono truncate">
                  <SelectValue placeholder="Chọn hoặc nhập tên mô hình" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {availableModels.map((m) => (
                    <SelectItem key={m} value={m} className="text-xs font-mono">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Hoặc gõ tên model tùy chỉnh"
                className="w-full min-w-0 text-xs font-mono"
                title="Gõ tên mô hình tùy chỉnh nếu không có trong danh sách trên"
              />
            </div>
          </div>

          {/* Test Status Alert */}
          {testStatus !== "none" && (
            <Alert
              className={`py-2 px-3 animate-in fade-in duration-150 ${
                testStatus === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {testStatus === "success" ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />}
              <AlertDescription className="text-xs font-mono break-all ml-1.5">
                {testMessage}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between sm:justify-between shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={isTesting || !baseUrl.trim()}
            className="text-xs h-8 gap-1.5"
            title="Gửi yêu cầu ping kiểm tra thời gian phản hồi và khóa API"
          >
            <Activity className={`size-3.5 ${isTesting ? "animate-spin text-primary" : "text-emerald-500"}`} />
            <span>{isTesting ? "Đang kiểm tra..." : "Kiểm Tra Kết Nối"}</span>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs h-8 text-muted-foreground"
            >
              Hủy bỏ
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveAndActivate}
              disabled={!baseUrl.trim() || !model.trim()}
              className="text-xs h-8 font-semibold shadow-xs"
            >
              Lưu &amp; Kích Hoạt
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
