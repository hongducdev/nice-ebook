import { RefreshCw, CheckCircle2, XCircle, Cpu, Zap, Sparkles } from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import { toast } from "sonner";

export function GatewayView() {
  const {
    gateways,
    isScanningGateways,
    scanGateways,
    activeGateway,
    selectGateway,
    selectedModel,
    setSelectedModel,
    jevDecision,
  } = useAppStore();

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto select-none max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <span>AI Gateway & Điều Phối Model</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 font-mono">
              Auto-Discovery
            </span>
          </h2>
          <p className="text-xs text-[#71717a] mt-0.5">
            Tự động tìm kiếm các cổng AI Proxy cục bộ (9Router, Cockpit Tools, Ollama, LM Studio) không cần cấu hình thủ công.
          </p>
        </div>

        <button
          onClick={() => {
            toast.loading("Đang quét lại các cổng loopback...", { id: "rescan" });
            scanGateways().then(() => {
              toast.success("Đã hoàn tất quét AI Gateway!", { id: "rescan" });
            });
          }}
          disabled={isScanningGateways}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isScanningGateways ? "animate-spin" : ""}`} />
          <span>{isScanningGateways ? "Đang quét..." : "Quét lại Gateway"}</span>
        </button>
      </div>

      {/* Jev Core Highlight Card (Offline 100%, 0 Key) */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-[#181822] to-[#141418] border border-indigo-500/30 shadow-lg mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-100">Jev Core (System-1 Decision Engine)</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-medium border border-emerald-500/30">
                  Hoạt động 100% Offline
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono">
                  Zero API Key
                </span>
              </div>
              <p className="text-xs text-[#a1a1aa] mt-1.5 leading-relaxed max-w-2xl">
                Cơ chế phân loại heuristic siêu tốc được nhúng trực tiếp vào lõi Rust của app. Khi không có kết nối mạng hoặc không có API key, Jev Core tự động đảm nhận việc phân tích thể loại sách, đo tỷ lệ hội thoại và đề xuất phong cách typography chuẩn mực.
              </p>
            </div>
          </div>

          {jevDecision && (
            <div className="text-right flex-shrink-0 pl-4 border-l border-[#27272a]">
              <span className="text-[10px] text-[#71717a] block">Thể loại sách hiện tại</span>
              <span className="text-xs font-bold text-indigo-400">{jevDecision.genre_label}</span>
              <span className="text-[10px] font-mono text-[#52525b] block mt-0.5">
                {(jevDecision.confidence * 100).toFixed(0)}% tin cậy
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Detected Gateways List */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#71717a]">
          Danh Sách AI Gateway Cục Bộ (Localhost)
        </h3>
        <span className="text-xs text-[#52525b] font-mono">
          {gateways.filter((g) => g.is_online).length} / {gateways.length || 7} cổng trực tuyến
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {gateways.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#141418] border border-[#27272a] text-center flex flex-col items-center">
            <Cpu className="w-8 h-8 text-[#52525b] mb-2" />
            <p className="text-xs text-zinc-400 mb-1">Chưa chạy quét cổng cục bộ</p>
            <p className="text-[11px] text-[#71717a] mb-4">
              Bấm nút "Quét lại Gateway" để kiểm tra 9Router, Cockpit Tools, Ollama trên máy tính.
            </p>
            <button
              onClick={() => scanGateways()}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-[#1c1c22] hover:bg-[#22222a] border border-[#27272a] text-zinc-200"
            >
              Bắt đầu quét ngay
            </button>
          </div>
        ) : (
          gateways.map((gw) => {
            const isSelected = activeGateway?.port === gw.port;

            return (
              <div
                key={gw.port}
                onClick={() => gw.is_online && selectGateway(gw)}
                className={`p-4 rounded-xl border transition-all flex items-center justify-between ${
                  gw.is_online
                    ? isSelected
                      ? "bg-indigo-950/20 border-indigo-500 shadow-md shadow-indigo-500/10 cursor-pointer"
                      : "bg-[#141418] hover:bg-[#18181f] border-[#27272a] cursor-pointer"
                    : "bg-[#101014]/50 border-[#222228] opacity-50 cursor-not-allowed"
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      gw.is_online ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-800 text-zinc-600"
                    }`}
                  >
                    {gw.is_online ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-100">{gw.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1f1f26] text-[#a1a1aa]">
                        Port {gw.port}
                      </span>
                      {gw.is_online && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">
                          {gw.latency_ms}ms
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-[#71717a]">{gw.base_url}</span>
                  </div>
                </div>

                {/* Right: Model Selection or Status */}
                <div className="flex items-center gap-3">
                  {gw.is_online ? (
                    gw.models.length > 0 ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[10px] text-[#71717a]">Model:</span>
                        <select
                          value={isSelected ? selectedModel || gw.models[0] : gw.models[0]}
                          onChange={(e) => {
                            if (isSelected) {
                              setSelectedModel(e.target.value);
                            } else {
                              selectGateway(gw);
                              setSelectedModel(e.target.value);
                            }
                          }}
                          className="bg-[#1c1c22] border border-[#2e2e38] text-zinc-200 text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:border-indigo-500 font-mono"
                        >
                          {gw.models.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        <span>Sẵn sàng kết nối</span>
                      </span>
                    )
                  ) : (
                    <span className="text-[11px] text-[#52525b] font-mono">Không phản hồi</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
