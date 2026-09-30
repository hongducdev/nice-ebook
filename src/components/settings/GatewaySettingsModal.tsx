import { useState } from "react";
import { CheckCircle2, AlertCircle, Zap, Shield, Cpu } from "lucide-react";
import { ConfiguredProviderInfo, useAppStore } from "../../stores/useAppStore";
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
export function GatewaySettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { activeGateway, selectedModel, setSelectedModel, selectGateway } = useAppStore();

  const [baseUrl, setBaseUrl] = useState(activeGateway?.base_url || "http://100.118.3.52:20128/v1");
  const [apiKey, setApiKey] = useState(activeGateway?.api_key || "");
  const [customModel, setCustomModel] = useState(selectedModel || "claude-3-5-sonnet");
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<"none" | "success" | "error">("none");
  const [testMessage, setTestMessage] = useState("");

  if (!isOpen) return null;

  async function handleTestConnection() {
    setIsTesting(true);
    setTestStatus("none");

    let url = baseUrl.trim();
    if (url.endsWith("/")) url = url.slice(0, -1);
    const rootUrl = url.replace(/\/v1\/?$/, "");
    const testUrl = `${url}/models`;

    try {
      let effectiveKey = apiKey.trim();
      if (!effectiveKey) {
        try {
          const keyRes = await fetch(`${rootUrl}/api/keys`);
          if (keyRes.ok) {
            const keyData = await keyRes.json();
            const activeKey = keyData.keys?.find((k: { isActive: boolean; key: string }) => k.isActive)?.key;
            if (activeKey) {
              effectiveKey = activeKey;
              setApiKey(activeKey);
            }
          }
        } catch {
          // ignore
        }
      }

      const headers: Record<string, string> = {};
      if (effectiveKey) {
        headers["Authorization"] = `Bearer ${effectiveKey}`;
      }

      const res = await fetch(testUrl, { headers });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      const modelsList = data.data ? data.data.map((m: { id: string }) => m.id) : [];

      let configuredProviders: ConfiguredProviderInfo[] = [];
      try {
        const provRes = await fetch(`${rootUrl}/api/providers`);
        if (provRes.ok) {
          const provData = await provRes.json();
          if (provData.connections) {
            configuredProviders = provData.connections.flatMap((c: { provider: string; name?: string; isActive: boolean; testStatus?: string }) =>
              c.isActive
                ? [{
                    provider: c.provider,
                    name: c.name || "",
                    is_active: c.isActive,
                    test_status: c.testStatus,
                  }]
                : []
            );
          }
        }
      } catch {
        // ignore
      }

      setTestStatus("success");
      setTestMessage(`Kết nối thành công! Tìm thấy ${modelsList.length} models.`);
      toast.success("Kết nối Gateway thành công!");

      // Update store active gateway
      selectGateway({
        name: url.includes("100.118.3.52") ? "9Router Server" : "Custom Gateway",
        base_url: url,
        port: 0,
        is_online: true,
        models: modelsList,
        gateway_type: "9router",
        latency_ms: 15,
        api_key: effectiveKey || undefined,
        configured_providers: configuredProviders,
      });

      if (modelsList.length > 0) {
        setSelectedModel(modelsList[0]);
        setCustomModel(modelsList[0]);
      }
    } catch (err) {
      setTestStatus("error");
      setTestMessage(String(err));
      toast.error("Không thể kết nối tới endpoint này");
    } finally {
      setIsTesting(false);
    }
  }

  function handleSave() {
    let url = baseUrl.trim();
    if (url.endsWith("/")) url = url.slice(0, -1);

    selectGateway({
      name: url.includes("100.118.3.52") ? "9Router Server" : "Custom Gateway",
      base_url: url,
      port: 0,
      is_online: true,
      models: customModel ? [customModel] : [],
      gateway_type: "9router",
      latency_ms: 10,
      api_key: apiKey.trim() ? apiKey.trim() : undefined,
    });
    setSelectedModel(customModel);
    toast.success("Đã lưu cấu hình AI Gateway");
    onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 py-3.5 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-2">
            <Cpu className="size-4 text-primary" />
            <DialogTitle className="text-sm font-semibold">Cấu Hình AI Provider / 9Router</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Thiết lập endpoint API tương thích OpenAI, khóa truy cập và định danh mô hình.
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4">
          {/* Base URL */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gateway-base-url" className="text-xs font-medium">
              API Base URL (Tương thích OpenAI)
            </Label>
            <Input
              id="gateway-base-url"
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://100.118.3.52:20128/v1 hoặc http://127.0.0.1:20128/v1"
              className="text-xs font-mono"
            />
            <span className="text-[11px] text-muted-foreground">
              Mặc định 9Router Server là <code className="text-primary font-mono font-medium">http://100.118.3.52:20128/v1</code>, Local là <code className="text-primary font-mono font-medium">http://127.0.0.1:20128/v1</code>
            </span>
          </div>

          {/* API Key */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="gateway-api-key" className="text-xs font-medium">
                API Key (Tùy chọn)
              </Label>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-normal">
                <Shield className="size-3" />
                <span>9Router / Cockpit cục bộ không cần key</span>
              </span>
            </div>
            <Input
              id="gateway-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-... (để trống nếu dùng 9Router cục bộ)"
              className="text-xs font-mono"
            />
          </div>

          {/* Model Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gateway-model-id" className="text-xs font-medium">
              Model ID
            </Label>
            <Input
              id="gateway-model-id"
              type="text"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder="claude-3-5-sonnet, gpt-4o, gemini-1.5-pro, qwen2.5-coder..."
              className="text-xs font-mono"
            />
          </div>

          {/* Connection Test Result */}
          {testStatus !== "none" && (
            <Alert className={testStatus === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 py-2.5" : "border-destructive/30 bg-destructive/10 text-destructive py-2.5"}>
              {testStatus === "success" ? (
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="size-4 text-destructive" />
              )}
              <AlertDescription className="text-xs font-medium truncate">
                {testMessage}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="m-0 px-5 py-3 border-t border-border bg-muted/30 flex items-center justify-between shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={isTesting}
            className="text-xs h-8 gap-1.5"
          >
            <Zap className="size-3.5 text-primary" />
            <span>{isTesting ? "Đang kiểm tra..." : "Test Kết Nối"}</span>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs h-8"
            >
              Hủy
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              className="text-xs h-8"
            >
              Lưu & Áp Dụng
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
