import { 
  AlignJustify, 
  AlignLeft, 
  RotateCcw,
  SlidersHorizontal,
  Languages,
  Check,
  Wand2,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  Copy,
  Code2,
  FileCode,
  BookOpen,
  Eye,
  Loader2
} from "lucide-react";
import { useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Slider } from "../ui/slider";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { useAppStore } from "../../stores/useAppStore";
import { VIETNAMESE_FONTS } from "../../utils/vietnameseHelper";
import { generateEpubCss } from "../../utils/cssGenerator";
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
    customCss,
    isVietnameseBook,
    updateTypography,
    currentBook,
    activeChapterIndex,
    bookStyleSignature,
    bookStyleCss,
    styleAuditReport,
    isAuditingStyle,
    auditAndFixBookStyle,
    applyAiStyleFixes,
    revertToOriginalStyle,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<"ai" | "manual" | "css">("ai");
  const [cssViewMode, setCssViewMode] = useState<"overrides" | "original">("overrides");
  const [copied, setCopied] = useState(false);

  const previewChapter = currentBook?.chapters[activeChapterIndex];
  const sampleText = previewChapter?.preview_text || 
    "Trần Phong hít sâu một hơi linh khí mát lạnh, cảm nhận kinh mạch trong cơ thể đang cuồn cuộn chảy xiết như sông lớn. Đây chính là cảnh giới Trúc Cơ kỳ mà hắn hằng ao ước bấy lâu nay. Ngoài đình, những cánh hoa đào rơi lả tả theo làn gió nhẹ, vương trên tà áo trắng tinh khôi của người thiếu niên. Trên bầu trời phương xa, từng áng mây hồng lững lờ trôi, báo hiệu một thời khắc chuyển giao trọng đại sắp diễn ra...";

  const generatedCss = generateEpubCss({
    preset: activePreset,
    fontSize,
    lineHeight,
    firstLineIndent,
    dropCaps,
    textAlign,
    sceneDivider,
    customOverrides: customCss,
    isVietnamese: isVietnameseBook,
    fontFamily: fontFamily || activePreset.fontFamily,
    signature: bookStyleSignature,
  });

  async function handleRunAiAudit() {
    toast.loading("AI đang kiểm tra và phân tích style gốc...", { id: "ai-audit" });
    const result = await auditAndFixBookStyle();
    if (result) {
      toast.success(`Đã hoàn tất kiểm tra! Điểm đánh giá: ${result.overallScore}/100`, { id: "ai-audit" });
    } else {
      toast.error("Không thể kết nối dịch vụ AI hoặc phân tích sách", { id: "ai-audit" });
    }
  }

  function handleApplyAiFixes() {
    if (!styleAuditReport) return;
    applyAiStyleFixes(styleAuditReport);
    toast.success("Đã áp dụng toàn bộ sửa đổi & tinh chỉnh của AI!");
  }

  function handleRevert() {
    revertToOriginalStyle();
    toast.info("Đã khôi phục về định dạng gốc của sách");
  }

  function handleCopyCss(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Đã sao chép mã CSS vào clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex-1 flex gap-4 p-4 overflow-hidden select-none max-w-7xl mx-auto w-full h-full">
      {/* Left Column: Style Controls (AI Audit, Manual Typography, CSS Inspector) */}
      <div className="w-[460px] flex-shrink-0 flex flex-col h-full overflow-hidden bg-card border border-border rounded-xl shadow-xs">
        {/* Header bar */}
        <div className="p-3.5 border-b border-border bg-muted/20 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles size={16} className="text-primary" />
                <span>Định Kiểu &amp; Typography</span>
              </h2>
              {isVietnameseBook && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 border-primary/40 text-primary">
                  <Languages size={10} className="mr-0.5" />
                  Tiếng Việt
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={handleRevert}
                className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground"
                title="Khôi phục CSS gốc của sách"
              >
                <RotateCcw size={12} />
                <span>Khôi phục gốc</span>
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1 truncate">
              <BookOpen size={12} className="text-muted-foreground shrink-0" />
              <strong className="text-foreground truncate">
                {currentBook ? currentBook.title : "Chưa mở sách"}
              </strong>
            </span>
            {bookStyleSignature && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                Khớp {Math.round(bookStyleSignature.confidence * 100)}% CSS gốc
              </Badge>
            )}
          </div>

          {/* Navigation Sub-Tabs */}
          <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="w-full mt-1">
            <TabsList className="w-full grid grid-cols-3 h-8 bg-muted/60 p-0.5">
              <TabsTrigger value="ai" className="text-xs gap-1.5 py-1 data-[state=on]:bg-background data-[state=on]:text-primary">
                <Wand2 size={13} />
                <span>AI Kiểm Tra</span>
              </TabsTrigger>
              <TabsTrigger value="manual" className="text-xs gap-1.5 py-1 data-[state=on]:bg-background data-[state=on]:text-primary">
                <SlidersHorizontal size={13} />
                <span>Typography</span>
              </TabsTrigger>
              <TabsTrigger value="css" className="text-xs gap-1.5 py-1 data-[state=on]:bg-background data-[state=on]:text-primary">
                <Code2 size={13} />
                <span>Mã CSS</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
          {/* TAB 1: AI AUDIT & FIX */}
          {activeTab === "ai" && (
            <div className="space-y-3.5">
              {/* Card Style Gốc Hiện Tại */}
              <Card className="p-3 bg-muted/15 border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <FileCode size={13} className="text-primary" />
                    <span>Hiện trạng CSS Gốc</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {bookStyleSignature?.stylesheetCount || 0} file CSS
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded bg-background border border-border">
                    <span className="text-muted-foreground block text-[10px]">Font gốc:</span>
                    <strong className="text-foreground truncate block font-serif">
                      {bookStyleSignature?.fontFamily ? bookStyleSignature.fontFamily.split(",")[0].replace(/['"]/g, "") : "Mặc định (Serif)"}
                    </strong>
                  </div>
                  <div className="p-2 rounded bg-background border border-border">
                    <span className="text-muted-foreground block text-[10px]">Giãn dòng:</span>
                    <strong className="text-foreground block font-mono">
                      {lineHeight ? lineHeight.toFixed(2) : "1.75"}
                    </strong>
                  </div>
                  <div className="p-2 rounded bg-background border border-border">
                    <span className="text-muted-foreground block text-[10px]">Thụt lề:</span>
                    <strong className="text-foreground block font-mono">
                      {firstLineIndent || "1.5em"}
                    </strong>
                  </div>
                  <div className="p-2 rounded bg-background border border-border">
                    <span className="text-muted-foreground block text-[10px]">Canh lề:</span>
                    <strong className="text-foreground block capitalize">
                      {textAlign === "justify" ? "Căn đều hai bên" : "Lề trái"}
                    </strong>
                  </div>
                </div>
              </Card>

              {/* Action Banner or Audit Result */}
              {!styleAuditReport && !isAuditingStyle && (
                <Card className="p-4 bg-primary/5 border-primary/20 text-center space-y-3">
                  <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
                    <Wand2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Kiểm Tra &amp; Sửa Style Bằng AI
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      AI sẽ quét stylesheet gốc của sách, phát hiện lỗi font tiếng Việt, độ tương phản, khoảng cách dòng, và tạo các quy tắc CSS bổ trợ mà vẫn giữ nguyên bản sắc của nhà xuất bản.
                    </p>
                  </div>
                  <Button
                    onClick={handleRunAiAudit}
                    className="w-full gap-2 text-xs font-medium"
                    size="sm"
                  >
                    <Sparkles size={14} />
                    <span>Bắt Đầu Kiểm Tra &amp; Tối Ưu</span>
                  </Button>
                </Card>
              )}

              {isAuditingStyle && (
                <Card className="p-6 text-center space-y-3 bg-muted/20 border-border">
                  <Loader2 size={24} className="animate-spin text-primary mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-xs font-semibold text-foreground">
                      AI Đang Phân Tích CSS Gốc...
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Đang rà soát font chữ, độ tương phản và quy chuẩn e-reader
                    </p>
                  </div>
                </Card>
              )}

              {styleAuditReport && !isAuditingStyle && (
                <div className="space-y-3">
                  {/* Score & Summary Card */}
                  <Card className="p-3.5 bg-card border-border space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`size-8 rounded-full flex items-center justify-center font-bold text-xs ${
                          styleAuditReport.overallScore >= 80 
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                            : styleAuditReport.overallScore >= 70
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                            : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30"
                        }`}>
                          {styleAuditReport.overallScore}
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-foreground block">
                            Điểm Đánh Giá Style Gốc
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {styleAuditReport.auditItems.length} hạng mục được kiểm tra
                          </span>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRunAiAudit}
                        className="h-7 text-xs px-2 gap-1"
                        title="Chạy lại kiểm tra AI"
                      >
                        <RefreshCw size={11} />
                        <span>Kiểm tra lại</span>
                      </Button>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed bg-muted/30 p-2.5 rounded border border-border">
                      {styleAuditReport.summary}
                    </p>

                    {styleAuditReport.preservationNotes && (
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-start gap-1.5">
                        <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
                        <span>{styleAuditReport.preservationNotes}</span>
                      </div>
                    )}
                  </Card>

                  {/* Audit Checklist Items */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-foreground block px-0.5">
                      Kết Quả Rà Soát Chi Tiết
                    </span>
                    {styleAuditReport.auditItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg border border-border bg-card space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground flex items-center gap-1.5 truncate">
                            {item.status === "pass" && <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />}
                            {item.status === "warning" && <AlertTriangle size={13} className="text-amber-500 shrink-0" />}
                            {item.status === "issue" && <AlertTriangle size={13} className="text-red-500 shrink-0" />}
                            <span className="truncate">{item.title}</span>
                          </span>
                          <Badge
                            variant={item.status === "pass" ? "secondary" : "outline"}
                            className={`text-[9px] px-1 py-0 uppercase tracking-wider shrink-0 ${
                              item.status === "pass"
                                ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                : item.status === "warning"
                                ? "text-amber-600 dark:text-amber-400 border-amber-500/30"
                                : "text-red-600 dark:text-red-400 border-red-500/30"
                            }`}
                          >
                            {item.status === "pass" ? "Đạt" : item.status === "warning" ? "Lưu ý" : "Cần sửa"}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {item.detail}
                        </p>
                        {item.fixRecommendation && (
                          <div className="text-[10px] text-primary bg-primary/5 p-1.5 rounded border border-primary/20 flex items-start gap-1">
                            <Info size={11} className="shrink-0 mt-0.5" />
                            <span>{item.fixRecommendation}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Apply AI Fixes CTA */}
                  <div className="pt-1">
                    <Button
                      onClick={handleApplyAiFixes}
                      className="w-full gap-2 text-xs font-semibold h-9"
                    >
                      <Check size={14} />
                      <span>Áp Dụng Toàn Bộ Sửa Đổi AI</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MANUAL TYPOGRAPHY CONTROLS */}
          {activeTab === "manual" && (
            <div className="space-y-3">
              {/* Setting 0: Font Family */}
              <div className="setting-card-row flex-col items-start gap-2 p-2.5 bg-card border border-border rounded-lg">
                <div className="setting-card-row__copy w-full flex items-center justify-between">
                  <div>
                    <h3 className="setting-card-row__title flex items-center gap-1.5 text-xs font-semibold">
                      <span>Phông chữ hiển thị (Font Family)</span>
                    </h3>
                    <p className="text-[10px] text-muted-foreground">
                      Ưu tiên các phông chữ hỗ trợ đầy đủ dấu thanh tiếng Việt.
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
              <div className="p-2.5 bg-card border border-border rounded-lg flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold text-foreground">Cỡ chữ hiển thị</h3>
                  <p className="text-[10px] text-muted-foreground">Kích thước chữ tiêu chuẩn đoạn văn.</p>
                </div>
                <div className="flex items-center gap-2.5">
                  <Slider
                    min={12}
                    max={24}
                    step={1}
                    value={[fontSize]}
                    onValueChange={(vals) => updateTypography({ fontSize: vals[0] })}
                    className="w-24"
                  />
                  <Badge variant="outline" className="text-[11px] font-mono min-w-9 justify-center border-primary/40 text-primary">
                    {fontSize}px
                  </Badge>
                </div>
              </div>

              {/* Setting 2: Line Height */}
              <div className="p-2.5 bg-card border border-border rounded-lg flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold text-foreground">Khoảng cách dòng</h3>
                  <p className="text-[10px] text-muted-foreground">Độ giãn cách giữa các dòng chữ.</p>
                </div>
                <div className="flex items-center gap-2.5">
                  <Slider
                    min={1.3}
                    max={2.3}
                    step={0.05}
                    value={[lineHeight]}
                    onValueChange={(vals) => updateTypography({ lineHeight: Number(vals[0].toFixed(2)) })}
                    className="w-24"
                  />
                  <Badge variant="secondary" className="text-[11px] font-mono min-w-9 justify-center">
                    {lineHeight.toFixed(2)}
                  </Badge>
                </div>
              </div>

              {/* Setting 3: Text Alignment */}
              <div className="p-2.5 bg-card border border-border rounded-lg flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold text-foreground">Canh lề văn bản</h3>
                  <p className="text-[10px] text-muted-foreground">Căn đều 2 bên hoặc lề trái.</p>
                </div>
                <ToggleGroup
                  type="single"
                  value={textAlign}
                  onValueChange={(val) => {
                    if (val) updateTypography({ textAlign: val as "justify" | "left" });
                  }}
                  className="border border-border rounded-md p-0.5 bg-muted/40"
                >
                  <ToggleGroupItem value="justify" size="sm" className="h-6 text-xs px-2 gap-1 data-[state=on]:bg-background data-[state=on]:text-primary">
                    <AlignJustify size={12} />
                    <span>Căn đều</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem value="left" size="sm" className="h-6 text-xs px-2 gap-1 data-[state=on]:bg-background data-[state=on]:text-primary">
                    <AlignLeft size={12} />
                    <span>Lề trái</span>
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {/* Setting 4: First Line Indent */}
              <div className="p-2.5 bg-card border border-border rounded-lg flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold text-foreground">Thụt lề đầu dòng</h3>
                  <p className="text-[10px] text-muted-foreground">Khoảng cách thụt câu đầu đoạn.</p>
                </div>
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

              {/* Setting 5: Drop Caps */}
              <div className="p-2.5 bg-card border border-border rounded-lg flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold text-foreground">Chữ hoa đầu đoạn (Drop Cap)</h3>
                  <p className="text-[10px] text-muted-foreground">Phóng to ký tự đầu tiên của chương.</p>
                </div>
                <ToggleGroup
                  type="single"
                  value={dropCaps ? "on" : "off"}
                  onValueChange={(val) => {
                    if (val) updateTypography({ dropCaps: val === "on" });
                  }}
                  className="border border-border rounded-md p-0.5 bg-muted/40"
                >
                  <ToggleGroupItem value="on" size="sm" className="h-6 text-xs px-2 data-[state=on]:bg-background data-[state=on]:text-primary">
                    Bật
                  </ToggleGroupItem>
                  <ToggleGroupItem value="off" size="sm" className="h-6 text-xs px-2 data-[state=on]:bg-background data-[state=on]:text-primary">
                    Tắt
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {/* Setting 6: Scene Divider */}
              <div className="p-2.5 bg-card border border-border rounded-lg flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold text-foreground">Ký hiệu ngắt cảnh</h3>
                  <p className="text-[10px] text-muted-foreground">Ký hiệu phân cách giữa các phân đoạn.</p>
                </div>
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
          )}

          {/* TAB 3: CSS INSPECTOR & EDITOR */}
          {activeTab === "css" && (
            <div className="space-y-3 h-full flex flex-col">
              <div className="flex items-center justify-between pb-1">
                <ToggleGroup
                  type="single"
                  value={cssViewMode}
                  onValueChange={(v) => {
                    if (v) setCssViewMode(v as any);
                  }}
                  className="border border-border rounded-md p-0.5 bg-muted/40"
                >
                  <ToggleGroupItem value="overrides" size="sm" className="h-6 text-xs px-2.5 data-[state=on]:bg-background data-[state=on]:text-primary">
                    CSS Bổ Trợ / Sửa Đổi
                  </ToggleGroupItem>
                  <ToggleGroupItem value="original" size="sm" className="h-6 text-xs px-2.5 data-[state=on]:bg-background data-[state=on]:text-primary">
                    CSS Gốc Của Sách
                  </ToggleGroupItem>
                </ToggleGroup>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopyCss(cssViewMode === "overrides" ? (customCss || generatedCss) : (bookStyleCss || "/* Không có CSS gốc */"))}
                  className="h-6 text-[11px] px-2 gap-1"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  <span>Sao chép</span>
                </Button>
              </div>

              {cssViewMode === "overrides" ? (
                <div className="flex-1 min-h-[300px] border border-border rounded-lg overflow-hidden flex flex-col bg-background">
                  <div className="bg-muted/40 px-3 py-1.5 border-b border-border flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="font-mono">custom-fixes.css (Có thể chỉnh sửa)</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateTypography({ customCss: "" })}
                      className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-foreground"
                    >
                      Xóa trắng
                    </Button>
                  </div>
                  <div className="flex-1 overflow-auto text-xs font-mono">
                    <CodeMirror
                      value={customCss}
                      height="100%"
                      extensions={[css()]}
                      theme="dark"
                      onChange={(val) => updateTypography({ customCss: val })}
                      className="h-full"
                      placeholder="/* Nhập các quy tắc CSS bổ trợ hoặc áp dụng từ AI... */"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-[300px] border border-border rounded-lg overflow-hidden flex flex-col bg-background">
                  <div className="bg-muted/40 px-3 py-1.5 border-b border-border flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="font-mono">original-book-style.css (Chỉ đọc)</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      Từ EPUB
                    </Badge>
                  </div>
                  <div className="flex-1 overflow-auto text-xs font-mono">
                    <CodeMirror
                      value={bookStyleCss || "/* Cuốn sách này không chứa stylesheet CSS bên ngoài */"}
                      height="100%"
                      extensions={[css()]}
                      theme="dark"
                      editable={false}
                      className="h-full opacity-80"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Live Book Typography Preview */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Card className="flex-1 flex flex-col p-6 overflow-hidden bg-card border-border shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs border-primary/40 text-primary flex items-center gap-1">
                <Eye size={12} />
                <span>Xem Trước Trực Tiếp</span>
              </Badge>
              <span className="text-xs text-muted-foreground truncate">
                {currentBook ? `${currentBook.title} — Chương ${activeChapterIndex + 1}` : "Xem trước trang sách"}
              </span>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
              Font: {(fontFamily || activePreset.fontFamily).split(",")[0].replace(/['"]/g, "")} ({fontSize}px / {lineHeight})
            </span>
          </div>

          <div 
            style={{
              backgroundColor: activePreset.colors.bg || "var(--card)",
              color: activePreset.colors.text || "var(--foreground)",
              fontFamily: fontFamily || activePreset.fontFamily,
              textAlign: textAlign,
              fontSize: `${fontSize}px`,
              lineHeight: lineHeight,
            }}
            className="flex-1 p-8 rounded-lg border border-border overflow-y-auto shadow-sm select-text transition-all"
          >
            <div 
              style={{ color: activePreset.colors.accent || "var(--primary)" }}
              className="text-center font-bold text-base tracking-wider uppercase mb-6"
            >
              CHƯƠNG I: KHỞI ĐẦU CUỘC HÀNH TRÌNH
            </div>

            <p style={{ textIndent: dropCaps ? "0" : firstLineIndent }} className="mb-4">
              {dropCaps && (
                <span 
                  style={{ color: activePreset.colors.accent || "var(--primary)" }}
                  className="float-left text-4xl font-serif font-bold leading-none pr-2 pt-1"
                >
                  {sampleText.charAt(0)}
                </span>
              )}
              {dropCaps ? sampleText.slice(1) : sampleText}
            </p>

            <div 
              style={{ color: activePreset.colors.accent || "var(--primary)" }}
              className="text-center my-6 font-mono text-sm tracking-widest opacity-80"
            >
              {sceneDivider}
            </div>

            <p style={{ textIndent: firstLineIndent }} className="mb-4">
              Màn đêm dần buông xuống trên những mái ngói rêu phong của thành cổ. Gió thổi qua từng tán lá ngân vang như khúc nhạc du dương của đất trời. Mọi sóng gió dường như mới chỉ vừa bắt đầu trên con đường tìm kiếm chân lý phía trước.
            </p>

            <blockquote className="my-5 p-4 rounded border-l-4 border-primary/60 bg-muted/20 italic text-sm text-muted-foreground">
              &ldquo;Con đường dài vạn dặm đều bắt đầu từ một bước chân kiên định. Dù phong ba bão táp, tâm bất biến giữa dòng đời vạn biến.&rdquo;
            </blockquote>

            <p style={{ textIndent: firstLineIndent }}>
              Ánh trăng bàng bạc chiếu rọi qua khung cửa sổ nhỏ. Trong góc phòng, ngọn nến le lói tỏa ra ánh sáng ấm áp, xua tan cái lạnh giá của đêm đông giá buốt. Hắn khẽ mỉm cười, nắm chặt thanh kiếm trong tay, sẵn sàng cho những thử thách mới sắp tới.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
