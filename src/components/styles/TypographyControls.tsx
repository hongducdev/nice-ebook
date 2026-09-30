import { 
  AlignJustify, 
  AlignLeft, 
  RotateCcw,
  SlidersHorizontal,
  Languages,
  Check
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Slider } from "../ui/slider";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
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
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <SlidersHorizontal size={15} className="text-primary" />
                <span>Bước 5: Cấu Hình Typography &amp; Bố Cục</span>
              </h2>
              {isVietnameseBook && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 flex items-center gap-1 border-primary/40 text-primary" title="Sách tiếng Việt - Tự động chọn font hỗ trợ đầy đủ dấu thanh">
                  <Languages size={10} />
                  <span>Tiếng Việt</span>
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Gói phong cách: <strong className="text-foreground">{activePreset.name}</strong>
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => {
              selectPreset(activePreset.id);
              toast.info("Đã khôi phục thông số mặc định của preset");
            }}
            className="h-6 text-xs px-2 gap-1"
            title="Khôi phục thông số mặc định"
          >
            <RotateCcw size={12} />
            <span>Mặc định</span>
          </Button>
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
                      ? "border-primary bg-primary/10 text-foreground font-semibold shadow-xs"
                      : "border-border hover:border-primary/50 bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="truncate text-[11px]" style={{ fontFamily: f.fontFamily }}>
                      {f.name}
                    </span>
                    {isSelected && <Check size={12} className="text-primary shrink-0" />}
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
          <div className="setting-card-row__action flex items-center gap-3">
            <Slider
              min={12}
              max={24}
              step={1}
              value={[fontSize]}
              onValueChange={(vals) => updateTypography({ fontSize: vals[0] })}
              className="w-24"
            />
            <Badge variant="outline" className="text-[11px] font-mono min-w-10 justify-center border-primary/40 text-primary">
              {fontSize}px
            </Badge>
          </div>
        </div>

        {/* Setting 2: Line Height */}
        <div className="setting-card-row">
          <div className="setting-card-row__copy">
            <h3 className="setting-card-row__title">Khoảng cách dòng (Line Height)</h3>
            <p className="setting-card-row__description">Độ giãn cách giữa các dòng văn bản, giúp tối ưu trải nghiệm đọc.</p>
          </div>
          <div className="setting-card-row__action flex items-center gap-3">
            <Slider
              min={1.3}
              max={2.3}
              step={0.05}
              value={[lineHeight]}
              onValueChange={(vals) => updateTypography({ lineHeight: Number(vals[0].toFixed(2)) })}
              className="w-24"
            />
            <Badge variant="secondary" className="text-[11px] font-mono min-w-10 justify-center">
              {lineHeight.toFixed(2)}
            </Badge>
          </div>
        </div>

        {/* Setting 3: Text Alignment */}
        <div className="setting-card-row">
          <div className="setting-card-row__copy">
            <h3 className="setting-card-row__title">Canh lề văn bản (Text Align)</h3>
            <p className="setting-card-row__description">Căn đều 2 bên (Justify) hoặc căn lề trái (Left-aligned).</p>
          </div>
          <div className="setting-card-row__action">
            <ToggleGroup
              type="single"
              value={textAlign}
              onValueChange={(val) => {
                if (val) updateTypography({ textAlign: val as "justify" | "left" });
              }}
              className="border border-border rounded-md p-0.5 bg-muted/40"
            >
              <ToggleGroupItem value="justify" size="sm" className="h-6 text-xs px-2 gap-1 data-[state=on]:bg-background data-[state=on]:text-primary" title="Căn đều hai bên">
                <AlignJustify size={13} />
                <span>Căn đều</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="left" size="sm" className="h-6 text-xs px-2 gap-1 data-[state=on]:bg-background data-[state=on]:text-primary" title="Căn lề trái">
                <AlignLeft size={13} />
                <span>Lề trái</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {/* Setting 4: First Line Indent */}
        <div className="setting-card-row">
          <div className="setting-card-row__copy">
            <h3 className="setting-card-row__title">Thụt lề đầu dòng (Indent)</h3>
            <p className="setting-card-row__description">Khoảng cách thụt vào của câu đầu tiên trong mỗi đoạn văn.</p>
          </div>
          <div className="setting-card-row__action">
            <ToggleGroup
              type="single"
              value={firstLineIndent}
              onValueChange={(val) => {
                if (val) updateTypography({ firstLineIndent: val });
              }}
              className="border border-border rounded-md p-0.5 bg-muted/40"
            >
              {["0em", "1em", "1.5em", "2em"].map((val) => (
                <ToggleGroupItem
                  key={val}
                  value={val}
                  size="sm"
                  className="h-6 font-mono text-xs px-2 data-[state=on]:bg-background data-[state=on]:text-primary"
                >
                  {val}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>

        {/* Setting 5: Drop Caps */}
        <div className="setting-card-row">
          <div className="setting-card-row__copy">
            <h3 className="setting-card-row__title">Chữ hoa đầu đoạn (Drop Caps)</h3>
            <p className="setting-card-row__description">Phóng to ký tự đầu tiên của chương theo phong cách sách cổ điển.</p>
          </div>
          <div className="setting-card-row__action">
            <ToggleGroup
              type="single"
              value={dropCaps ? "on" : "off"}
              onValueChange={(val) => {
                if (val) updateTypography({ dropCaps: val === "on" });
              }}
              className="border border-border rounded-md p-0.5 bg-muted/40"
            >
              <ToggleGroupItem value="on" size="sm" className="h-6 text-xs px-2.5 data-[state=on]:bg-background data-[state=on]:text-primary">
                Bật
              </ToggleGroupItem>
              <ToggleGroupItem value="off" size="sm" className="h-6 text-xs px-2.5 data-[state=on]:bg-background data-[state=on]:text-primary">
                Tắt
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {/* Setting 6: Scene Divider */}
        <div className="setting-card-row">
          <div className="setting-card-row__copy">
            <h3 className="setting-card-row__title">Dấu ngắt phân cảnh</h3>
            <p className="setting-card-row__description">Ký hiệu ngắt giữa các phân đoạn cảnh trong tiểu thuyết.</p>
          </div>
          <div className="setting-card-row__action">
            <ToggleGroup
              type="single"
              value={sceneDivider}
              onValueChange={(val) => {
                if (val) updateTypography({ sceneDivider: val });
              }}
              className="border border-border rounded-md p-0.5 bg-muted/40"
            >
              {["* * *", "♦ ♦ ♦", "———", "✦ ✦ ✦"].map((val) => (
                <ToggleGroupItem
                  key={val}
                  value={val}
                  size="sm"
                  className="h-6 font-mono text-xs px-2 data-[state=on]:bg-background data-[state=on]:text-primary"
                >
                  {val}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
      </div>

      {/* Right Column: Live Book Typography Preview */}
      <div className="flex-1 flex flex-col min-w-0">
        <Card className="flex-1 flex flex-col p-6 overflow-hidden bg-card border-border shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs border-primary/40 text-primary">Live Preview</Badge>
              <span className="text-xs text-muted-foreground">
                {currentBook ? `${currentBook.title} — Chương ${activeChapterIndex + 1}` : "Xem trước trang sách"}
              </span>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
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
            className="flex-1 p-8 rounded border border-border overflow-y-auto shadow-sm select-text transition-all"
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
        </Card>
      </div>
    </div>
  );
}
