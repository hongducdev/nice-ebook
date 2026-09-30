import { Check, Sparkles, SlidersHorizontal, Palette, Wand2, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { STYLE_PRESETS, StylePreset } from "../../presets/styles";
import {
  MIN_NATIVE_STYLE_CONFIDENCE,
  NATIVE_PRESET_ID,
  shortFontName,
} from "../../utils/bookStyleAnalyzer";
import { useAppStore } from "../../stores/useAppStore";
import { toast } from "sonner";

export function PresetGallery() {
  const {
    activePresetId,
    selectPreset,
    jevDecision,
    setActiveTab,
    currentBook,
    bookStyleSignature,
    isAnalyzingBookStyle,
    autoStyleFromBook,
    setAutoStyleFromBook,
    analyzeBookStyle,
  } = useAppStore();

  const isNativeActive = activePresetId === NATIVE_PRESET_ID;
  const signature = bookStyleSignature;
  const hasUsableSignature = !!signature && signature.confidence >= MIN_NATIVE_STYLE_CONFIDENCE;

  function handleSelect(preset: StylePreset) {
    selectPreset(preset.id);
    toast.success(`Đã áp dụng phong cách: ${preset.name}`);
  }

  function handleSelectNative() {
    if (!currentBook) {
      toast.info("Hãy nạp một file sách trước khi dùng chế độ này.");
      return;
    }
    selectPreset(NATIVE_PRESET_ID);
    toast.success("Đã chuyển sang style bám theo định dạng gốc của sách.");
  }

  async function handleReanalyze() {
    if (!currentBook) {
      toast.info("Hãy nạp một file sách trước khi phân tích.");
      return;
    }
    const result = await analyzeBookStyle({ apply: isNativeActive });
    if (!result || result.stylesheetCount === 0) {
      toast.warning("Sách này không kèm file CSS nào nên không có định dạng gốc để bám theo.");
      return;
    }
    if (result.confidence < MIN_NATIVE_STYLE_CONFIDENCE) {
      toast.warning(
        `CSS gốc quá ít thông tin (${Math.round(result.confidence * 100)}%) — lớp phủ sẽ chỉ đổi font/cỡ chữ, giữ nguyên màu sắc.`
      );
      return;
    }
    toast.success(`Đã đọc được ${result.evidence.length} token định dạng từ CSS gốc của sách.`);
  }

  const nativeColors = [
    { label: "Nền gốc", value: signature?.colors.bg },
    { label: "Chữ gốc", value: signature?.colors.text },
    { label: "Tiêu đề", value: signature?.colors.accent },
    { label: "Trích dẫn", value: signature?.colors.cardBg },
  ].filter((c): c is { label: string; value: string } => Boolean(c.value));

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto select-none max-w-5xl mx-auto w-full gap-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground tracking-tight flex items-center gap-2">
            <Palette size={18} className="text-primary" />
            <span>Bước 4: Thư Viện Phong Cách EPUB</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Các gói giao diện và định dạng CSS được thiết kế chuẩn quốc tế cho Apple Books, Kindle và Kobo.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setActiveTab("editor")}
          className="h-7 text-xs px-2.5 gap-1.5"
        >
          <SlidersHorizontal className="size-3.5" />
          <span>Tùy Chỉnh Thông Số</span>
        </Button>
      </div>

      {/* Chế độ "theo sách hiện tại" */}
      <Card
        onClick={handleSelectNative}
        className={`shrink-0 p-4 cursor-pointer relative transition-all bg-card ${
          isNativeActive ? "ring-2 ring-primary shadow-md" : "hover:border-primary/50"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Wand2 size={15} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Theo sách hiện tại
              </h3>
              <Badge variant="outline" className="text-[10px] h-4.5 px-1.5 border-primary/40 text-primary">
                {autoStyleFromBook ? "Tự động" : "Thủ công"}
              </Badge>
              {signature && (
                <Badge variant="secondary" className="text-[10px] h-4.5 px-1.5 font-mono">
                  khớp {Math.round(signature.confidence * 100)}%
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Đọc CSS gốc của sách rồi chỉ <strong>phủ thêm</strong> những gì sách đã khai báo — font,
              cỡ chữ, giãn dòng, canh lề, bảng màu. Phần còn lại vẫn do CSS gốc của nhà xuất bản
              quyết định, không bị thay thế toàn bộ như các preset bên dưới.
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              Token nào sách không khai báo (ví dụ font hoặc màu) sẽ dùng thông số trong tab{" "}
              <strong>Kiểu chữ (Typography)</strong> — màu sắc không bao giờ bị bịa thêm.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                void handleReanalyze();
              }}
              disabled={isAnalyzingBookStyle || !currentBook}
              className="h-6 text-xs px-2 gap-1 disabled:opacity-50"
              title="Đọc lại CSS gốc của sách"
            >
              {isAnalyzingBookStyle ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              <span>Phân tích lại</span>
            </Button>
            {isNativeActive ? (
              <span className="flex items-center gap-1 text-primary font-medium text-xs">
                <Check size={13} />
                <span>Đang sử dụng</span>
              </span>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectNative();
                }}
                className="h-6 text-xs px-2"
              >
                Áp dụng
              </Button>
            )}
          </div>
        </div>

        {/* Bằng chứng đọc được từ CSS gốc */}
        {signature && signature.evidence.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {signature.evidence.map((item) => (
              <Badge
                key={item}
                variant="secondary"
                className="text-[10px] h-4.5 px-1.5 font-normal"
              >
                {item}
              </Badge>
            ))}
          </div>
        )}

        {!currentBook && (
          <p className="text-[11px] text-muted-foreground mt-2.5">
            Chưa có sách nào được nạp.
          </p>
        )}

        {currentBook && signature && !hasUsableSignature && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2.5 flex items-center gap-1.5">
            <AlertTriangle size={12} />
            <span>
              CSS gốc quá ít thông tin nên lớp phủ chỉ chỉnh font/cỡ chữ; màu sắc giữ nguyên theo
              sách.
            </span>
          </p>
        )}

        <div className="flex items-center justify-between gap-3 pt-2.5 mt-2.5 border-t border-border">
          {nativeColors.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Bảng màu gốc:</span>
              <div className="flex items-center -space-x-1">
                {nativeColors.map((c) => (
                  <span
                    key={c.label}
                    className="w-3.5 h-3.5 rounded-full border border-black/30 shadow-xs"
                    style={{ backgroundColor: c.value }}
                    title={`${c.label}: ${c.value}`}
                  />
                ))}
              </div>
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {signature?.fontFamily ? `Font gốc: ${shortFontName(signature.fontFamily)}` : "Chưa đọc được định dạng gốc"}
            </span>
          )}

          <label
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={autoStyleFromBook}
              onChange={(e) => setAutoStyleFromBook(e.target.checked)}
              className="accent-primary cursor-pointer"
            />
            <span>Tự động cho sách mới</span>
          </label>
        </div>
      </Card>

      {/* Presets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {STYLE_PRESETS.map((preset) => {
          const isSelected = activePresetId === preset.id;
          const isJevRecommended = jevDecision?.recommended_preset === preset.id;

          return (
            <Card
              key={preset.id}
              onClick={() => handleSelect(preset)}
              className={`p-4 cursor-pointer relative transition-all flex flex-col justify-between bg-card ${
                isSelected 
                  ? "ring-2 ring-primary shadow-md" 
                  : "hover:border-primary/50"
              }`}
            >
              {/* Smart Recommendation Badge */}
              {isJevRecommended && (
                <div className="absolute top-2 right-2">
                  <Badge variant="outline" className="text-[10px] h-4.5 px-1.5 font-mono border-primary/40 text-primary gap-1">
                    <Sparkles size={10} />
                    <span>Gợi ý phù hợp</span>
                  </Badge>
                </div>
              )}

              <div>
                <div className="flex items-start justify-between mb-2">
                  <div className="pr-16">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">
                        {preset.name}
                      </h3>
                      <Badge variant="secondary" className="text-[10px] h-4.5">
                        {preset.genreLabel}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
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
                  className="p-3.5 rounded-lg border border-border my-2.5 text-xs leading-relaxed shadow-xs"
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
              <div className="flex items-center justify-between pt-2.5 border-t border-border text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="text-[11px]">Bảng màu:</span>
                  <div className="flex items-center -space-x-1">
                    <span
                      className="size-3.5 rounded-full border border-black/30 shadow-xs"
                      style={{ backgroundColor: preset.colors.bg }}
                      title="Nền"
                    />
                    <span
                      className="size-3.5 rounded-full border border-black/30 shadow-xs"
                      style={{ backgroundColor: preset.colors.text }}
                      title="Chữ"
                    />
                    <span
                      className="size-3.5 rounded-full border border-black/30 shadow-xs"
                      style={{ backgroundColor: preset.colors.accent }}
                      title="Điểm nhấn"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isSelected ? (
                    <span className="flex items-center gap-1 text-primary font-medium text-xs">
                      <Check size={13} />
                      <span>Đang sử dụng</span>
                    </span>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(preset);
                      }}
                      className="h-6 text-xs px-2"
                    >
                      Áp dụng
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
