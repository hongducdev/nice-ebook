import { Check, Sparkles, Sliders } from "lucide-react";
import { STYLE_PRESETS, StylePreset } from "../../presets/styles";
import { useAppStore } from "../../stores/useAppStore";
import { toast } from "sonner";

export function PresetGallery() {
  const { activePresetId, selectPreset, jevDecision, setActiveTab } = useAppStore();

  function handleSelect(preset: StylePreset) {
    selectPreset(preset.id);
    toast.success(`Đã áp dụng phong cách: ${preset.name}`);
  }

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto select-none max-w-5xl mx-auto w-full">
      {/* Header info */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-zinc-100">Thư Viện Phong Cách Ebook</h2>
          <p className="text-xs text-[#71717a] mt-0.5">
            Chọn gói giao diện mẫu tối ưu sẵn chuẩn quốc tế, phù hợp cho Apple Books, Kindle, Kobo.
          </p>
        </div>

        <button
          onClick={() => setActiveTab("editor")}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-[#18181b] hover:bg-[#222226] border border-[#27272a] text-[#d4d4d8] transition-colors"
        >
          <Sliders className="w-3.5 h-3.5 text-indigo-400" />
          <span>Tùy Chỉnh Thông Số</span>
        </button>
      </div>

      {/* Presets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {STYLE_PRESETS.map((preset) => {
          const isSelected = activePresetId === preset.id;
          const isJevRecommended = jevDecision?.recommended_preset === preset.id;

          return (
            <div
              key={preset.id}
              onClick={() => handleSelect(preset)}
              className={`p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between group ${
                isSelected
                  ? "bg-[#181820] border-indigo-500 ring-2 ring-indigo-500/20 shadow-xl shadow-indigo-500/10"
                  : "bg-[#141418] hover:bg-[#191920] border-[#27272a]"
              }`}
            >
              {/* Jev Recommendation Badge */}
              {isJevRecommended && (
                <div className="absolute top-0 right-0 bg-gradient-to-l from-purple-600 to-indigo-600 text-white text-[10px] font-bold px-3 py-0.5 rounded-bl-xl shadow-md flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>Jev Khuyên Dùng</span>
                </div>
              )}

              <div>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100 group-hover:text-indigo-300 transition-colors flex items-center gap-2">
                      <span>{preset.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#222228] text-zinc-400 font-normal">
                        {preset.genreLabel}
                      </span>
                    </h3>
                    <p className="text-xs text-[#71717a] mt-1 leading-relaxed">{preset.description}</p>
                  </div>

                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm shadow-indigo-600/50">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>

                {/* Typography Mini Preview Box */}
                <div
                  style={{
                    backgroundColor: preset.colors.bg,
                    color: preset.colors.text,
                    fontFamily: preset.fontFamily,
                  }}
                  className="p-3.5 rounded-xl border border-white/10 my-3 text-xs leading-relaxed shadow-inner"
                >
                  <div
                    style={{ color: preset.colors.accent }}
                    className="font-bold text-center mb-1 text-[11px] tracking-wide"
                  >
                    CHƯƠNG THỨ NHẤT
                  </div>
                  <p className="text-[11px] opacity-90 line-clamp-2" style={{ textIndent: preset.firstLineIndent }}>
                    Ánh trăng bàng bạc chiếu qua khung cửa sổ mờ sương, tiếng gió đêm rít từng cơn lạnh buốt qua rừng trúc tịch mịch...
                  </p>
                  <div style={{ color: preset.colors.accent }} className="text-center text-[10px] mt-1.5 opacity-80">
                    {preset.sceneDivider}
                  </div>
                </div>
              </div>

              {/* Card Footer: Metadata & Colors */}
              <div className="flex items-center justify-between pt-2 border-t border-[#222228] text-[11px] text-[#71717a]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px]">Bảng màu:</span>
                  <div className="flex items-center -space-x-1">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/30"
                      style={{ backgroundColor: preset.colors.bg }}
                      title="Nền"
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/30"
                      style={{ backgroundColor: preset.colors.text }}
                      title="Chữ"
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/30"
                      style={{ backgroundColor: preset.colors.accent }}
                      title="Điểm nhấn"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-400">
                  <span>Line {preset.lineHeight}</span>
                  <span>{preset.dropCaps ? "DropCap: Bật" : "DropCap: Tắt"}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
