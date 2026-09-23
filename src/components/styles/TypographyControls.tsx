import { Type, AlignJustify, AlignLeft, Sparkles, RefreshCw } from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
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
    updateTypography,
    selectPreset,
    currentBook,
    activeChapterIndex,
  } = useAppStore();

  const previewChapter = currentBook?.chapters[activeChapterIndex];
  const sampleText = previewChapter?.preview_text || 
    "Trần Phong hít sâu một hơi linh khí mát lạnh, cảm nhận kinh mạch trong cơ thể đang cuồn cuộn chảy xiết như sông lớn. Đây chính là cảnh giới Trúc Cơ kỳ mà hắn hằng ao ước bấy lâu nay. Ngoài đình, những cánh hoa đào rơi lả tả theo làn gió nhẹ, vương trên tà áo trắng tinh khôi của người thiếu niên...";

  return (
    <div className="flex-1 flex gap-6 p-6 overflow-hidden select-none max-w-6xl mx-auto w-full">
      {/* Left Column: Sliders & Settings */}
      <div className="w-[340px] flex-shrink-0 flex flex-col gap-4 overflow-y-auto pr-1">
        <div className="flex items-center justify-between pb-3 border-b border-[#27272a]">
          <div>
            <h2 className="text-sm font-bold text-zinc-100">Cấu Hình Typography</h2>
            <span className="text-[11px] text-[#71717a]">Gói: {activePreset.name}</span>
          </div>

          <button
            onClick={() => {
              selectPreset(activePreset.id);
              toast.info("Đã khôi phục thông số mặc định của preset");
            }}
            className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 p-1.5 rounded-lg bg-[#18181b] border border-[#27272a]"
            title="Khôi phục mặc định"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Mặc định</span>
          </button>
        </div>

        {/* Font Size Slider */}
        <div className="p-3.5 rounded-xl bg-[#141418] border border-[#27272a]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-200 flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 text-indigo-400" />
              <span>Cỡ chữ hiển thị</span>
            </span>
            <span className="text-xs font-mono font-semibold text-indigo-400">{fontSize}px</span>
          </div>
          <input
            type="range"
            min="12"
            max="26"
            step="1"
            value={fontSize}
            onChange={(e) => updateTypography({ fontSize: Number(e.target.value) })}
            className="w-full accent-indigo-500 cursor-pointer"
          />
        </div>

        {/* Line Height Slider */}
        <div className="p-3.5 rounded-xl bg-[#141418] border border-[#27272a]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-200">Khoảng cách dòng (Line Height)</span>
            <span className="text-xs font-mono font-semibold text-indigo-400">{lineHeight.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="1.3"
            max="2.3"
            step="0.05"
            value={lineHeight}
            onChange={(e) => updateTypography({ lineHeight: Number(e.target.value) })}
            className="w-full accent-indigo-500 cursor-pointer"
          />
        </div>

        {/* First Line Indent */}
        <div className="p-3.5 rounded-xl bg-[#141418] border border-[#27272a]">
          <span className="text-xs font-medium text-zinc-200 block mb-2">Thụt đầu dòng đoạn văn</span>
          <div className="grid grid-cols-4 gap-1.5">
            {["0em", "1em", "1.5em", "2em"].map((val) => (
              <button
                key={val}
                onClick={() => updateTypography({ firstLineIndent: val })}
                className={`py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                  firstLineIndent === val
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/50"
                    : "bg-[#1c1c22] text-[#71717a] hover:text-zinc-200"
                }`}
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        {/* Text Alignment & Drop-caps */}
        <div className="p-3.5 rounded-xl bg-[#141418] border border-[#27272a] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-200">Căn lề văn bản</span>
            <div className="flex items-center gap-1 bg-[#1c1c22] p-0.5 rounded-lg">
              <button
                onClick={() => updateTypography({ textAlign: "justify" })}
                className={`p-1.5 rounded-md ${
                  textAlign === "justify" ? "bg-indigo-600 text-white" : "text-[#71717a] hover:text-zinc-200"
                }`}
                title="Căn đều 2 bên"
              >
                <AlignJustify className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => updateTypography({ textAlign: "left" })}
                className={`p-1.5 rounded-md ${
                  textAlign === "left" ? "bg-indigo-600 text-white" : "text-[#71717a] hover:text-zinc-200"
                }`}
                title="Căn trái"
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#222228]">
            <div>
              <span className="text-xs font-medium text-zinc-200 block">Chữ cái đầu to (Drop-caps)</span>
              <span className="text-[10px] text-[#71717a]">Phóng to chữ cái đầu mỗi chương</span>
            </div>
            <button
              onClick={() => updateTypography({ dropCaps: !dropCaps })}
              className={`w-10 h-5 rounded-full transition-colors relative ${
                dropCaps ? "bg-indigo-600" : "bg-[#27272a]"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  dropCaps ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>
        </div>

        {/* Scene Break Glyphs */}
        <div className="p-3.5 rounded-xl bg-[#141418] border border-[#27272a]">
          <span className="text-xs font-medium text-zinc-200 block mb-2">Biểu tượng phân cách cảnh</span>
          <div className="grid grid-cols-5 gap-1.5">
            {["✦ ✦ ✦", "☁ ☁ ☁", "— ❖ —", "♦ ♦ ♦", "* * *"].map((glyph) => (
              <button
                key={glyph}
                onClick={() => updateTypography({ sceneDivider: glyph })}
                className={`py-1.5 rounded-lg text-xs font-medium transition-all ${
                  sceneDivider === glyph
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/50"
                    : "bg-[#1c1c22] text-[#71717a] hover:text-zinc-200"
                }`}
              >
                {glyph}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Column: Live Wysiwyg Preview Frame */}
      <div className="flex-1 flex flex-col bg-[#141418] rounded-2xl border border-[#27272a] overflow-hidden shadow-xl">
        <div className="h-10 px-4 border-b border-[#27272a] bg-[#101013] flex items-center justify-between text-xs text-[#71717a]">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-medium text-zinc-300">Khung Xem Thử Kiểu Chữ (Live Preview)</span>
          </span>
          <span className="text-[11px] font-mono">Font: {activePreset.fontFamily.split(",")[0]}</span>
        </div>

        <div
          style={{
            backgroundColor: activePreset.colors.bg,
            color: activePreset.colors.text,
            fontFamily: activePreset.fontFamily,
            fontSize: `${fontSize}px`,
            lineHeight: lineHeight,
            textAlign: textAlign,
          }}
          className="flex-1 p-10 overflow-y-auto transition-all"
        >
          {/* Chapter Title with Accent */}
          <div
            style={{
              color: activePreset.colors.accent,
              borderBottom: `1px solid ${activePreset.colors.border}`,
            }}
            className="text-center font-bold text-lg pb-3 mb-6 tracking-wide"
          >
            {previewChapter ? previewChapter.title : "CHƯƠNG I: KHỞI ĐẦU CUỘC HÀNH TRÌNH"}
          </div>

          {/* First Paragraph with Dropcap */}
          <p style={{ textIndent: firstLineIndent }} className="mb-4">
            {dropCaps && (
              <span
                style={{ color: activePreset.colors.accent }}
                className="float-left text-5xl leading-none pr-2 font-serif font-bold"
              >
                {sampleText.charAt(0)}
              </span>
            )}
            {dropCaps ? sampleText.slice(1) : sampleText}
          </p>

          {/* Scene Break Glyph */}
          <div
            style={{ color: activePreset.colors.accent }}
            className="text-center my-6 text-sm tracking-widest opacity-80"
          >
            {sceneDivider}
          </div>

          {/* Second Paragraph */}
          <p style={{ textIndent: firstLineIndent }} className="mb-4">
            “Ngươi có từng nghĩ đến tương lai xa xôi kia không?” Giọng nói của nàng cất lên trong trẻo, mang theo chút suy tư man mác giữa không gian tĩnh mịch. Hắn ngước nhìn bầu trời đêm đầy sao lấp lánh, mỉm cười không đáp, chỉ nhẹ nhàng siết chặt chuôi kiếm trong tay.
          </p>
        </div>
      </div>
    </div>
  );
}
