import { Check, Sparkles, SlidersHorizontal, Palette } from "lucide-react";
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
    <div className="flex-1 flex flex-col p-4 overflow-y-auto select-none max-w-5xl mx-auto w-full gap-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--foreground)] tracking-tight flex items-center gap-2">
            <Palette size={18} className="text-[var(--primary)]" />
            <span>Thư Viện Phong Cách EPUB</span>
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            Các gói giao diện và định dạng CSS được thiết kế chuẩn quốc tế cho Apple Books, Kindle và Kobo.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab("editor")}
          className="lg-button lg-button--secondary h-7 text-xs px-2.5"
        >
          <SlidersHorizontal size={13} />
          <span>Tùy Chỉnh Thông Số</span>
        </button>
      </div>

      {/* Presets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {STYLE_PRESETS.map((preset) => {
          const isSelected = activePresetId === preset.id;
          const isJevRecommended = jevDecision?.recommended_preset === preset.id;

          return (
            <div
              key={preset.id}
              onClick={() => handleSelect(preset)}
              className={`card-surface p-4 cursor-pointer relative transition-all flex flex-col justify-between ${
                isSelected 
                  ? "ring-2 ring-[var(--primary)] shadow-md" 
                  : ""
              }`}
            >
              {/* Jev Recommendation Badge */}
              {isJevRecommended && (
                <div className="absolute top-2 right-2">
                  <span className="app-badge app-badge--brand text-[10px] h-[18px] px-1.5 font-mono">
                    <Sparkles size={10} />
                    <span>Jev Đề Xuất</span>
                  </span>
                </div>
              )}

              <div>
                <div className="flex items-start justify-between mb-2">
                  <div className="pr-16">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-[var(--foreground)]">
                        {preset.name}
                      </h3>
                      <span className="app-badge app-badge--neutral text-[10px] h-[18px]">
                        {preset.genreLabel}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed">
                      {preset.description}
                    </p>
                  </div>
                </div>

                {/* Typography Mini Preview Box */}
                <div
                  style={{
                    backgroundColor: preset.colors.bg,
                    color: preset.colors.text,
                    fontFamily: preset.fontFamily,
                  }}
                  className="p-3.5 rounded border border-[var(--border)] my-2.5 text-xs leading-relaxed shadow-sm"
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
                  <div style={{ color: preset.colors.accent }} className="text-center text-[10px] mt-1.5 opacity-80 font-mono">
                    {preset.sceneDivider}
                  </div>
                </div>
              </div>

              {/* Card Footer: Metadata & Colors */}
              <div className="flex items-center justify-between pt-2.5 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                <div className="flex items-center gap-2">
                  <span className="text-[11px]">Bảng màu:</span>
                  <div className="flex items-center -space-x-1">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/30 shadow-xs"
                      style={{ backgroundColor: preset.colors.bg }}
                      title="Nền"
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/30 shadow-xs"
                      style={{ backgroundColor: preset.colors.text }}
                      title="Chữ"
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/30 shadow-xs"
                      style={{ backgroundColor: preset.colors.accent }}
                      title="Điểm nhấn"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isSelected ? (
                    <span className="flex items-center gap-1 text-[var(--primary)] font-medium text-xs">
                      <Check size={13} />
                      <span>Đang sử dụng</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(preset);
                      }}
                      className="lg-button lg-button--secondary h-6 text-xs px-2"
                    >
                      Áp dụng
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
