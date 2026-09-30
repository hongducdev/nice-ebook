import { useState } from "react";
import { X, CheckCircle2, AlertCircle, Zap, Shield, Cpu } from "lucide-react";
import { ConfiguredProviderInfo, useAppStore } from "../../stores/useAppStore";
import { toast } from "sonner";

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
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-[#141418] border border-[#27272a] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="h-14 px-6 border-b border-[#27272a] flex items-center justify-between bg-[#101013]">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-sm text-zinc-100">Cấu Hình AI Provider / 9Router</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-[#1f1f26] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Base URL */}
          <div>
            <label className="text-xs font-medium text-zinc-300 block mb-1.5">
              API Base URL (Tương thích OpenAI)
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://100.118.3.52:20128/v1 hoặc http://127.0.0.1:20128/v1"
              className="w-full bg-[#1c1c22] border border-[#2e2e38] rounded-xl px-3.5 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-indigo-500"
            />
            <span className="text-[10px] text-[#71717a] mt-1 block">
              Mặc định 9Router Server là <code className="text-indigo-400">http://100.118.3.52:20128/v1</code>, Local là <code className="text-indigo-400">http://127.0.0.1:20128/v1</code>
            </span>
          </div>

          {/* API Key */}
          <div>
            <label className="text-xs font-medium text-zinc-300 block mb-1.5 flex items-center justify-between">
              <span>API Key (Tùy chọn)</span>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-normal">
                <Shield className="w-3 h-3" />
                <span>9Router / Cockpit cục bộ không cần key</span>
              </span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-... (để trống nếu dùng 9Router cục bộ)"
              className="w-full bg-[#1c1c22] border border-[#2e2e38] rounded-xl px-3.5 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Model Name */}
          <div>
            <label className="text-xs font-medium text-zinc-300 block mb-1.5">
              Model ID
            </label>
            <input
              type="text"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder="claude-3-5-sonnet, gpt-4o, gemini-1.5-pro, qwen2.5-coder..."
              className="w-full bg-[#1c1c22] border border-[#2e2e38] rounded-xl px-3.5 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Connection Test Result */}
          {testStatus !== "none" && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                testStatus === "success"
                  ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
                  : "bg-red-950/20 border-red-500/30 text-red-300"
              }`}
            >
              {testStatus === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              )}
              <span className="truncate">{testMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-14 px-6 border-t border-[#27272a] bg-[#101013] flex items-center justify-between">
          <button
            onClick={handleTestConnection}
            disabled={isTesting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1c1c22] hover:bg-[#22222a] border border-[#2e2e38] text-xs font-medium text-zinc-300 transition-colors disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5 text-indigo-400" />
            <span>{isTesting ? "Đang kiểm tra..." : "Test Kết Nối"}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-[#a1a1aa] hover:text-zinc-200 hover:bg-[#18181f] transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all"
            >
              Lưu & Áp Dụng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
