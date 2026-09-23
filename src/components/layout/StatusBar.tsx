import { Activity, Cpu, Sparkles } from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";

export function StatusBar() {
  const { activeGateway, jevDecision, activePreset } = useAppStore();

  return (
    <footer className="h-8 border-t border-[#27272a] px-4 flex items-center justify-between bg-[#101014] text-[11px] text-[#71717a] select-none z-10">
      <div className="flex items-center gap-4">
        {/* Gateway connection status */}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              activeGateway
                ? "bg-emerald-500 shadow-sm shadow-emerald-500/50 animate-pulse"
                : "bg-zinc-600"
            }`}
          />
          <span className="text-[#a1a1aa] font-medium">Gateway:</span>
          {activeGateway ? (
            <span className="text-emerald-400 font-mono flex items-center gap-1">
              <span>{activeGateway.name} (Port {activeGateway.port})</span>
              <span className="text-[9px] text-[#71717a]">[{activeGateway.latency_ms}ms]</span>
            </span>
          ) : (
            <span className="text-[#71717a] font-mono">Chưa kết nối (Dùng Jev Core)</span>
          )}
        </div>

        <span className="text-[#3f3f46]">|</span>

        {/* Jev System-1 Decision Badge */}
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-indigo-500" />
          <span className="text-[#a1a1aa] font-medium">Jev Core:</span>
          {jevDecision ? (
            <span className="text-indigo-400 font-mono flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5 text-indigo-400" />
              <span>{jevDecision.genre_label} ({(jevDecision.confidence * 100).toFixed(0)}%)</span>
            </span>
          ) : (
            <span className="text-indigo-400/80 font-mono">System-1 Heuristic Sẵn Sàng</span>
          )}
        </div>

        <span className="text-[#3f3f46]">|</span>

        {/* Active Preset */}
        <div className="flex items-center gap-1.5">
          <span className="text-[#a1a1aa] font-medium">Preset:</span>
          <span className="text-zinc-200 font-mono">{activePreset.name}</span>
        </div>
      </div>

      <div className="flex items-center gap-4 font-mono text-[10px] text-[#52525b]">
        <span className="flex items-center gap-1">
          <Cpu className="w-3 h-3 text-[#71717a]" />
          <span>Rust Native Core</span>
        </span>
        <span className="flex items-center gap-1">
          <Activity className="w-3 h-3 text-[#71717a]" />
          <span>RAM ~38MB</span>
        </span>
      </div>
    </footer>
  );
}
