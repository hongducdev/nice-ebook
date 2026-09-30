import { 
  AlignJustify, 
  AlignLeft, 
  RotateCcw,
  SlidersHorizontal,
  Languages,
  Check
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import { VIETNAMESE_FONTS } from "../../utils/vietnameseHelper";
import { toast } from "sonner";

export function TypographyControls() {
  const {
    activePreset,
    fontSize,
    lineHeight,
    firstLineIndent,
    dropCaps,
    sceneDivider,
    textAlign,
    fontFamily,
    isVietnameseBook,
    updateTypography,
    selectPreset,
    currentBook,
    activeChapterIndex,
  } = useAppStore();

  const previewChapter = currentBook?.chapters[activeChapterIndex];
  const sampleText = previewChapter?.preview_text || 
    "Trần Phong hít sâu một hơi linh khí mát lạnh, cảm nhận kinh mạch trong cơ thể đang cuồn cuộn chảy xiết như sông lớn. Đây chính là cảnh giới Trúc Cơ kỳ mà hắn hằng ao ước bấy lâu nay. Ngoài đình, những cánh hoa đào rơi lả tả theo làn gió nhẹ, vương trên tà áo trắng tinh khôi của người thiếu niên. Trên bầu trời phương xa, từng áng mây hồng lững lờ trôi, báo hiệu một thời khắc chuyển giao trọng đại sắp diễn ra...";

  return (
    <div className="flex-1 flex gap-4 p-4 overflow-hidden select-none max-w-6xl mx-auto w-full">
      {/* Left Column: LinguaGacha Setting Rows */}
      <div className="w-[420px] flex-shrink-0 flex flex-col gap-2.5 overflow-y-auto pr-1">
        {/* Header bar */}
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                <SlidersHorizontal size={15} className="text-[var(--primary)]" />
                <span>Bước 5: Cấu Hình Typography &amp; Bố Cục</span>
              </h2>
              {isVietnameseBook && (
                <span className="app-badge app-badge--brand text-[10px] px-1.5 py-0.5 flex items-center gap-1" title="Sách tiếng Việt - Tự động chọn font hỗ trợ đầy đủ dấu thanh">
                  <Languages size={10} />
                  <span>Tiếng Việt</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Gói phong cách: <strong className="text-[var(--foreground)]">{activePreset.name}</strong>
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              selectPreset(activePreset.id);
              toast.info("Đã khôi phục thông số mặc định của preset");
            }}
            className="lg-button lg-button--secondary h-6 text-xs px-2 gap-1"
            title="Khôi phục thông số mặc định"
          >
            <RotateCcw size={12} />
            <span>Mặc định</span>
          </button>
        </div>

        {/* Setting 0: Font Family */}
        <div className="setting-card-row flex-col items-start gap-2.5">
          <div className="setting-card-row__copy w-full flex items-center justify-between">
            <div>
              <h3 className="setting-card-row__title flex items-center gap-1.5">
                <span>Phông chữ (Font Family)</span>
                {isVietnameseBook && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal">
                    (Đã tối ưu dấu thanh)
                  </span>
                )}
              </h3>
              <p className="setting-card-row__description">
                Chọn font chữ hiển thị, ưu tiên các font có hỗ trợ tiếng Việt đầy đủ.
              </p>
            </div>
          </div>
          <div className="w-full grid grid-cols-2 gap-1.5">
            {VIETNAMESE_FONTS.map((f) => {
              const isSelected = (fontFamily || activePreset.fontFamily).includes(f.id) ||
                (fontFamily || activePreset.fontFamily) === f.fontFamily;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    updateTypography({ fontFamily: f.fontFamily });
                    toast.success(`Đã đổi sang font ${f.name}`);
                  }}
                  className={`p-2 rounded text-left border transition-all text-xs flex flex-col justify-between ${
                    isSelected
                      ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)] font-semibold shadow-xs"
                      : "border-[var(--border)] hover:border-[var(--border-hover)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="truncate text-[11px]" style={{ fontFamily: f.fontFamily }}>
                      {f.name}
                    </span>
                    {isSelected && <Check size={12} className="text-[var(--primary)] flex-shrink-0" />}
                  </div>
                  <span className="text-[10px] opacity-75 line-clamp-1 leading-tight font-normal">
                    {f.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Setting 1: Font Size */}
        <div className="setting-card-row">
          <div className="setting-card-row__copy">
            <h3 className="setting-card-row__title">Cỡ chữ hiển thị (Font Size)</h3>
            <p className="setting-card-row__description">Kích thước chữ tiêu chuẩn cho toàn bộ đoạn văn nội dung sách.</p>
          </div>
          <div className="setting-card-row__action flex items-center gap-2">
            <input
              type="range"
              min="12"
              max="24"
              step="1"
              value={fontSize}
              onChange={(e) => updateTypography({ fontSize: Number(e.target.value) })}
              className="w-24 accent-[var(--primary)] cursor-pointer"
            />
            <span className="app-badge app-badge--brand text-[11px] font-mono min-w-10 text-center">
              {fontSize}px
            </span>
          </div>
        </div>

        {/* Setting 2: Line Height */}
        <div className="setting-card-row">
          <div className="setting-card-row__copy">
            <h3 className="setting-card-row__title">Khoảng cách dòng (Line Height)</h3>
            <p className="setting-card-row__description">Độ giãn cách giữa các dòng văn bản, giúp tối ưu trải nghiệm đọc.</p>
          </div>
          <div className="setting-card-row__action flex items-center gap-2">
            <input
              type="range"
              min="1.3"
              max="2.3"
              step="0.05"
              value={lineHeight}
              onChange={(e) => updateTypography({ lineHeight: Number(e.target.value) })}
              className="w-24 accent-[var(--primary)] cursor-pointer"
            />
            <span className="app-badge app-badge--neutral text-[11px] font-mono min-w-10 text-center">
              {lineHeight.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Setting 3: Text Alignment */}
        <div className="setting-card-row">
          <div className="setting-card-row__copy">
            <h3 className="setting-card-row__title">Canh lề văn bản (Text Align)</h3>
            <p className="setting-card-row__description">Căn đều 2 bên (Justify) hoặc căn lề trái (Left-aligned).</p>
          </div>
          <div className="setting-card-row__action">
            <div className="segmented-toggle">
              <button
                type="button"
                data-active={textAlign === "justify" ? "true" : undefined}
                data-variant="primary"
                onClick={() => updateTypography({ textAlign: "justify" })}
                className="segmented-toggle__item gap-1"
                title="Căn đều hai bên"
              >
                <AlignJustify size={13} />
                <span>Căn đều</span>
              </button>
              <button
                type="button"
                data-active={textAlign === "left" ? "true" : undefined}
                data-variant="primary"
                onClick={() => updateTypography({ textAlign: "left" })}
                className="segmented-toggle__item gap-1"
                title="Căn lề trái"
              >
                <AlignLeft size={13} />
                <span>Lề trái</span>
              </button>
            </div>
          </div>
        </div>

        {/* Setting 4: First Line Indent */}
        <div className="setting-card-row">
          <div className="setting-card-row__copy">
            <h3 className="setting-card-row__title">Thụt lề đầu dòng (Indent)</h3>
            <p className="setting-card-row__description">Khoảng cách thụt vào của câu đầu tiên trong mỗi đoạn văn.</p>
          </div>
          <div className="setting-card-row__action">
            <div className="segmented-toggle">
              {["0em", "1em", "1.5em", "2em"].map((val) => (
                <button
                  key={val}
                  type="button"
                  data-active={firstLineIndent === val ? "true" : undefined}
                  data-variant="primary"
                  onClick={() => updateTypography({ firstLineIndent: val })}
                  className="segmented-toggle__item font-mono text-xs px-2"
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Setting 5: Drop Caps */}
        <div className="setting-card-row">
          <div className="setting-card-row__copy">
            <h3 className="setting-card-row__title">Chữ hoa đầu đoạn (Drop Caps)</h3>
            <p className="setting-card-row__description">Phóng to ký tự đầu tiên của chương theo phong cách sách cổ điển.</p>
          </div>
          <div className="setting-card-row__action">
            <div className="segmented-toggle">
              <button
                type="button"
                data-active={dropCaps ? "true" : undefined}
                data-variant="primary"
                onClick={() => updateTypography({ dropCaps: true })}
                className="segmented-toggle__item"
              >
                Bật
              </button>
              <button
                type="button"
                data-active={!dropCaps ? "true" : undefined}
                onClick={() => updateTypography({ dropCaps: false })}
                className="segmented-toggle__item"
              >
                Tắt
              </button>
            </div>
          </div>
        </div>

        {/* Setting 6: Scene Divider */}
        <div className="setting-card-row">
          <div className="setting-card-row__copy">
            <h3 className="setting-card-row__title">Dấu ngắt phân cảnh</h3>
            <p className="setting-card-row__description">Ký hiệu ngắt giữa các phân đoạn cảnh trong tiểu thuyết.</p>
          </div>
          <div className="setting-card-row__action">
            <div className="segmented-toggle">
              {["* * *", "♦ ♦ ♦", "———", "✦ ✦ ✦"].map((val) => (
                <button
                  key={val}
                  type="button"
                  data-active={sceneDivider === val ? "true" : undefined}
                  data-variant="primary"
                  onClick={() => updateTypography({ sceneDivider: val })}
                  className="segmented-toggle__item font-mono text-xs px-2"
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Live Book Typography Preview */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="card-surface flex-1 flex flex-col p-6 overflow-hidden">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] mb-4">
            <div className="flex items-center gap-2">
              <span className="app-badge app-badge--brand text-xs">Live Preview</span>
              <span className="text-xs text-[var(--muted-foreground)]">
                {currentBook ? `${currentBook.title} — Chương ${activeChapterIndex + 1}` : "Xem trước trang sách"}
              </span>
            </div>
            <span className="text-[11px] font-mono text-[var(--muted-foreground)]">
              Font: {(fontFamily || activePreset.fontFamily).split(",")[0].replace(/['"]/g, "")}
            </span>
          </div>

          <div 
            style={{
              backgroundColor: activePreset.colors.bg,
              color: activePreset.colors.text,
              fontFamily: fontFamily || activePreset.fontFamily,
              textAlign: textAlign,
              fontSize: `${fontSize}px`,
              lineHeight: lineHeight,
            }}
            className="flex-1 p-8 rounded border border-[var(--border)] overflow-y-auto shadow-sm select-text transition-all"
          >
            <div 
              style={{ color: activePreset.colors.accent }}
              className="text-center font-bold text-sm tracking-wider uppercase mb-6"
            >
              CHƯƠNG I: KHỞI ĐẦU CUỘC HÀNH TRÌNH
            </div>

            <p style={{ textIndent: dropCaps ? "0" : firstLineIndent }} className="mb-4">
              {dropCaps && (
                <span 
                  style={{ color: activePreset.colors.accent }}
                  className="float-left text-4xl font-serif font-bold leading-none pr-2 pt-1"
                >
                  {sampleText.charAt(0)}
                </span>
              )}
              {dropCaps ? sampleText.slice(1) : sampleText}
            </p>

            <div 
              style={{ color: activePreset.colors.accent }}
              className="text-center my-6 font-mono text-sm tracking-widest opacity-80"
            >
              {sceneDivider}
            </div>

            <p style={{ textIndent: firstLineIndent }}>
              Màn đêm dần buông xuống trên những mái ngói rêu phong của thành cổ. Gió thổi qua từng tán lá ngân vang như khúc nhạc du dương của đất trời. Mọi sóng gió dường như mới chỉ vừa bắt đầu trên con đường tìm kiếm chân lý phía trước.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
