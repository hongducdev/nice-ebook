import { useState, useMemo } from "react";
import {
  Sparkles,
  BookOpen,
  Layers,
  CheckCircle2,
  Sliders,
  Languages,
  Trash2,
  Plus,
  Search,
  Usb,
  Send,
  Eye,
  Loader2,
  Info,
  UserCheck,
  FolderOpen
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { XRayEntityItem } from "../../services/kindle/xrayService";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

export function KindleCompanionView() {
  const {
    currentBook,
    setActiveTab,
    wordWiseSettings,
    setWordWiseSettings,
    applyWordWiseToBook,
    removeWordWiseFromBook,
    xrayData,
    setXRayData,
    isAnalyzingXRay,
    runXRayExtraction,
    embedXRayAppendixToBook,
    modifiedChapters,
  } = useAppStore();

  const [activeSubTab, setActiveSubTab] = useState<"wordwise" | "xray" | "sdr">("wordwise");
  const [isApplyingWordWise, setIsApplyingWordWise] = useState(false);
  const [isStrippingWordWise, setIsStrippingWordWise] = useState(false);
  const [isEmbeddingAppendix, setIsEmbeddingAppendix] = useState(false);

  // SDR export state
  const [sdrAsin, setSdrAsin] = useState(
    xrayData?.asin ||
      currentBook?.isbn?.replace(/[^A-Za-z0-9]/g, "") ||
      `B0${Math.abs((currentBook?.title || "book").split("").reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0))
        .toString(36)
        .toUpperCase()
        .padStart(8, "0")}`.slice(0, 10)
  );
  const [targetSdrDir, setTargetSdrDir] = useState<string | null>(null);
  const [isExportingSdr, setIsExportingSdr] = useState(false);
  const [exportedSdrResult, setExportedSdrResult] = useState<{
    path: string;
    bytes: number;
    pairedBookFile: string | null;
  } | null>(null);
  const [allowMissingBookFile, setAllowMissingBookFile] = useState(false);

  // X-Ray filter and search
  const [xrayFilter, setXrayFilter] = useState<"all" | "person" | "term">("all");
  const [xraySearch, setXraySearch] = useState("");

  // Edit / Add Modal state
  const [editingEntity, setEditingEntity] = useState<XRayEntityItem | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    aliases: "",
    type: "person" as "person" | "term",
    role: "",
    description: "",
  });

  // Calculate stats
  const annotatedChaptersCount = useMemo(() => {
    return Object.values(modifiedChapters).filter((html) => html.includes("kindle-wordwise")).length;
  }, [modifiedChapters]);

  const hasAppendixChapter = useMemo(() => {
    return currentBook?.chapters.some((c) => c.href === "xray_appendix.xhtml") || false;
  }, [currentBook]);

  // Filtered X-Ray entities
  const filteredEntities = useMemo(() => {
    if (!xrayData) return [];
    let list: XRayEntityItem[] = [];
    if (xrayFilter === "all") {
      list = [...xrayData.people, ...xrayData.terms];
    } else if (xrayFilter === "person") {
      list = xrayData.people;
    } else {
      list = xrayData.terms;
    }

    if (xraySearch.trim()) {
      const q = xraySearch.toLowerCase().trim();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.aliases.some((a) => a.toLowerCase().includes(q))
      );
    }
    return list;
  }, [xrayData, xrayFilter, xraySearch]);

  if (!currentBook) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Empty className="max-w-lg border border-border bg-card">
          <EmptyHeader>
            <EmptyMedia
              variant="icon"
              className="size-16 rounded-full bg-muted text-muted-foreground"
            >
              <BookOpen className="size-8" />
            </EmptyMedia>
            <EmptyTitle className="text-lg font-semibold text-foreground">
              Chưa có sách nào được mở
            </EmptyTitle>
            <EmptyDescription className="max-w-md text-sm">
              Vui lòng nạp một file sách (EPUB, PDF, TXT) trước để sử dụng bộ công cụ Kindle Companion.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={() => setActiveTab("books")}>
              Đến Thư Viện Sách
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const handleApplyWordWise = async () => {
    setIsApplyingWordWise(true);
    try {
      const count = await applyWordWiseToBook();
      toast.success(`Đã nhúng thành công ${count} chú thích Word Wise vào sách!`);
    } catch (err) {
      toast.error(`Lỗi khi nhúng Word Wise: ${err}`);
    } finally {
      setIsApplyingWordWise(false);
    }
  };

  const handleRemoveWordWise = async () => {
    setIsStrippingWordWise(true);
    try {
      const strippedCount = await removeWordWiseFromBook();
      toast.success(`Đã gỡ bỏ chú thích Word Wise khỏi ${strippedCount} chương.`);
    } catch (err) {
      toast.error(`Lỗi khi gỡ Word Wise: ${err}`);
    } finally {
      setIsStrippingWordWise(false);
    }
  };

  const handleRunXRayScan = async () => {
    const toastId = toast.loading("Đang quét nhân vật và thuật ngữ qua các chương sách...");
    const res = await runXRayExtraction();
    if (res) {
      toast.success(
        `Đã tìm thấy ${res.people.length} nhân vật và ${res.terms.length} thuật ngữ!`,
        { id: toastId }
      );
    } else {
      toast.error("Không thể quét dữ liệu X-Ray", { id: toastId });
    }
  };

  const handleEmbedAppendix = async () => {
    setIsEmbeddingAppendix(true);
    try {
      const ok = await embedXRayAppendixToBook();
      if (ok) {
        toast.success("Đã nhúng phụ lục X-Ray Dramatis Personae vào sách!");
      } else {
        toast.error("Vui lòng quét dữ liệu X-Ray trước khi nhúng phụ lục.");
      }
    } catch (err) {
      toast.error(`Lỗi: ${err}`);
    } finally {
      setIsEmbeddingAppendix(false);
    }
  };

  const handleSaveEntity = () => {
    if (!xrayData || !editForm.name.trim()) return;

    const aliases = editForm.aliases
      .split(/[,;]/)
      .map((a) => a.trim())
      .filter(Boolean);

    let updatedPeople = [...xrayData.people];
    let updatedTerms = [...xrayData.terms];

    if (isAddingNew) {
      const newEntity: XRayEntityItem = {
        id: Date.now(),
        name: editForm.name.trim(),
        aliases,
        type: editForm.type,
        role: editForm.role.trim() || undefined,
        description: editForm.description.trim() || "Chưa có mô tả.",
        occurrencesCount: 0,
        excerpts: [],
      };
      if (editForm.type === "person") {
        updatedPeople.unshift(newEntity);
      } else {
        updatedTerms.unshift(newEntity);
      }
    } else if (editingEntity) {
      const updateList = (list: XRayEntityItem[]) =>
        list.map((item) =>
          item.id === editingEntity.id
            ? {
                ...item,
                name: editForm.name.trim(),
                aliases,
                type: editForm.type,
                role: editForm.role.trim() || undefined,
                description: editForm.description.trim(),
              }
            : item
        );

      if (editingEntity.type === "person") {
        if (editForm.type === "person") {
          updatedPeople = updateList(updatedPeople);
        } else {
          updatedPeople = updatedPeople.filter((p) => p.id !== editingEntity.id);
          updatedTerms.unshift({ ...editingEntity, ...editForm, aliases, id: editingEntity.id });
        }
      } else {
        if (editForm.type === "term") {
          updatedTerms = updateList(updatedTerms);
        } else {
          updatedTerms = updatedTerms.filter((t) => t.id !== editingEntity.id);
          updatedPeople.unshift({ ...editingEntity, ...editForm, aliases, id: editingEntity.id });
        }
      }
    }

    setXRayData({
      ...xrayData,
      people: updatedPeople,
      terms: updatedTerms,
    });

    setEditingEntity(null);
    setIsAddingNew(false);
    toast.success("Đã lưu thông tin thực thể X-Ray!");
  };

  const handleDeleteEntity = (id: number) => {
    if (!xrayData) return;
    setXRayData({
      ...xrayData,
      people: xrayData.people.filter((p) => p.id !== id),
      terms: xrayData.terms.filter((t) => t.id !== id),
    });
    toast.success("Đã xóa thực thể.");
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-80px)] overflow-hidden bg-background">
      {/* Top Banner Header */}
      <div className="p-4 border-b border-border bg-card flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-foreground flex items-center gap-2">
              <Sparkles size={18} className="text-primary" />
              Bước 7: Kindle X-Ray, Word Wise &amp; Xuất Bản
            </h1>
            <Badge
              variant="outline"
              className="text-[10px] h-[18px] border-primary/40 text-primary"
            >
              Universal EPUB
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sách hiện tại: <span className="font-semibold text-foreground">{currentBook.title}</span> — {currentBook.author} ({currentBook.chapter_count} chương)
          </p>
        </div>

        {/* Sub-tab Navigation */}
        <ToggleGroup
          type="single"
          value={activeSubTab}
          onValueChange={(val) => {
            if (val === "wordwise" || val === "xray" || val === "sdr") setActiveSubTab(val);
          }}
          variant="outline"
          size="sm"
          className="border border-border rounded-md p-0.5 bg-muted/40"
        >
          <ToggleGroupItem
            value="wordwise"
            size="sm"
            className="h-6 text-xs px-2 gap-1.5 data-[state=on]:bg-background data-[state=on]:text-primary"
          >
            <Languages className="size-3.5" />
            Word Wise (Từ vựng)
          </ToggleGroupItem>
          <ToggleGroupItem
            value="xray"
            size="sm"
            className="h-6 text-xs px-2 gap-1.5 data-[state=on]:bg-background data-[state=on]:text-primary"
          >
            <UserCheck className="size-3.5" />
            X-Ray (Nhân vật &amp; Bối cảnh)
          </ToggleGroupItem>
          <ToggleGroupItem
            value="sdr"
            size="sm"
            className="h-6 text-xs px-2 gap-1.5 data-[state=on]:bg-background data-[state=on]:text-primary"
          >
            <Usb className="size-3.5" />
            Xuất Kindle (.sdr)
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* ===================== TAB 1: WORD WISE ===================== */}
        {activeSubTab === "wordwise" && (
          <div className="max-w-4xl mx-auto flex flex-col gap-6">
            {/* Stat Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card size="sm">
                <CardContent className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Chương đã có Word Wise</span>
                  <div className="text-xl font-bold text-foreground flex items-center gap-2">
                    {annotatedChaptersCount} / {currentBook.chapter_count}
                    {annotatedChaptersCount > 0 && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      >
                        Đã bật
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardContent className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Cấp độ từ lọc</span>
                  <div className="text-xl font-bold text-foreground">
                    Mức {wordWiseSettings.maxDifficulty} (CEFR {wordWiseSettings.maxDifficulty <= 1 ? "C2" : wordWiseSettings.maxDifficulty <= 3 ? "C1+" : "B2+"})
                  </div>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardContent className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Ngôn ngữ giải nghĩa</span>
                  <div className="text-xl font-bold text-foreground flex items-center gap-2">
                    {wordWiseSettings.language === "vi" ? "Tiếng Việt (Anh - Việt)" : "English (Anh - Anh)"}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Word Wise Configuration Card */}
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Sliders size={18} className="text-primary" />
                  Cấu Hình Word Wise
                </CardTitle>
              </CardHeader>

              <CardContent className="flex flex-col gap-5">
                {/* Setting: Difficulty Level */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-foreground">
                      Độ khó từ vựng muốn hiển thị gợi ý
                    </Label>
                    <span className="text-xs font-mono text-primary">
                      Mức {wordWiseSettings.maxDifficulty} / 5
                    </span>
                  </div>
                  <ToggleGroup
                    type="single"
                    value={String(wordWiseSettings.maxDifficulty)}
                    onValueChange={(val) => {
                      const lvl = Number(val);
                      if (lvl === 1 || lvl === 2 || lvl === 3 || lvl === 4 || lvl === 5) {
                        setWordWiseSettings({ maxDifficulty: lvl });
                      }
                    }}
                    variant="outline"
                    className="grid grid-cols-2 md:grid-cols-5 gap-2 w-full"
                  >
                    {[
                      { lvl: 1, label: "Mức 1: C2 Hiếm", desc: "Chỉ từ rất hiếm/văn học" },
                      { lvl: 2, label: "Mức 2: C1 Nâng cao", desc: "Từ học thuật/văn phong cao" },
                      { lvl: 3, label: "Mức 3: C1 Khuyên dùng", desc: "Từ trung cấp nâng cao" },
                      { lvl: 4, label: "Mức 4: B2+", desc: "Nhiều từ phong phú hơn" },
                      { lvl: 5, label: "Mức 5: Toàn bộ", desc: "Bao gồm cả từ B2 thông dụng" },
                    ].map((item) => (
                      <ToggleGroupItem
                        key={item.lvl}
                        value={String(item.lvl)}
                        className="w-full h-auto! flex-col items-start! justify-start whitespace-normal! p-2.5 text-left data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
                      >
                        <div className="text-xs font-bold">{item.label}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</div>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>

                <Separator />

                {/* Setting: Language */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-foreground">Ngôn ngữ chú thích (Glosses)</div>
                    <div className="text-[11px] text-muted-foreground">
                      Gợi ý hiển thị bằng Tiếng Việt giúp người học tiếng Anh ghi nhớ từ vựng nhanh gấp 3 lần.
                    </div>
                  </div>
                  <ToggleGroup
                    type="single"
                    value={wordWiseSettings.language}
                    onValueChange={(val) => {
                      if (val === "vi" || val === "en") setWordWiseSettings({ language: val });
                    }}
                    variant="outline"
                    size="sm"
                    className="border border-border rounded-md p-0.5 bg-muted/40"
                  >
                    <ToggleGroupItem
                      value="vi"
                      size="sm"
                      className="h-6 text-xs px-2 data-[state=on]:bg-background data-[state=on]:text-primary"
                    >
                      Tiếng Việt (Anh - Việt)
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="en"
                      size="sm"
                      className="h-6 text-xs px-2 data-[state=on]:bg-background data-[state=on]:text-primary"
                    >
                      Tiếng Anh (Anh - Anh)
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                <Separator />

                {/* Setting: Max occurrences per chapter */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-foreground">Tần suất chú thích lặp lại mỗi chương</div>
                    <div className="text-[11px] text-muted-foreground">
                      Tránh làm rối mắt nếu một từ xuất hiện nhiều lần liên tiếp trong một chương.
                    </div>
                  </div>
                  <ToggleGroup
                    type="single"
                    value={String(wordWiseSettings.maxOccurrencesPerWord)}
                    onValueChange={(val) => {
                      if (val) setWordWiseSettings({ maxOccurrencesPerWord: Number(val) });
                    }}
                    variant="outline"
                    size="sm"
                    className="border border-border rounded-md p-0.5 bg-muted/40"
                  >
                    {[
                      { val: 1, label: "1 lần" },
                      { val: 2, label: "2 lần" },
                      { val: 3, label: "3 lần (Chuẩn)" },
                      { val: 0, label: "Không giới hạn" },
                    ].map((item) => (
                      <ToggleGroupItem
                        key={item.val}
                        value={String(item.val)}
                        size="sm"
                        className="h-6 text-xs px-2 data-[state=on]:bg-background data-[state=on]:text-primary"
                      >
                        {item.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              </CardContent>
            </Card>

            {/* Live Preview Box */}
            <Card>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Eye className="size-3.5 text-primary" />
                    Xem Trước Hiển Thị Word Wise (Live Preview)
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Thẻ HTML5 &lt;ruby&gt; chuẩn Kindle &amp; EPUB
                  </span>
                </div>
                <div className="p-4 rounded border border-border bg-background text-sm leading-relaxed font-serif">
                The{" "}
                <ruby className="kindle-wordwise">
                  ephemeral
                  <rt>{wordWiseSettings.language === "vi" ? "phù du, ngắn ngủi" : "short-lived"}</rt>
                </ruby>{" "}
                morning mist vanished with{" "}
                <ruby className="kindle-wordwise">
                  nostalgic
                  <rt>{wordWiseSettings.language === "vi" ? "hoài niệm, nhớ nhung" : "longing for past"}</rt>
                </ruby>{" "}
                sweetness, while the detective watched with{" "}
                <ruby className="kindle-wordwise">
                  meticulous
                  <rt>{wordWiseSettings.language === "vi" ? "tỉ mỉ, cẩn trọng" : "very careful"}</rt>
                </ruby>{" "}
                observation.
              </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="sm"
                onClick={handleApplyWordWise}
                disabled={isApplyingWordWise}
                className="text-xs gap-2 px-4"
              >
                {isApplyingWordWise ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-3.5" />
                )}
                {isApplyingWordWise ? "Đang nhúng Word Wise..." : "Áp Dụng Vào Sách (Nhúng Thẻ Ruby)"}
              </Button>

              {annotatedChaptersCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveWordWise}
                  disabled={isStrippingWordWise}
                  className="text-xs gap-2 px-4 text-destructive"
                >
                  {isStrippingWordWise ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  Gỡ Bỏ Chú Thích Word Wise
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("reader")}
                className="text-xs ml-auto gap-1.5 px-4"
              >
                <BookOpen className="size-3.5" />
                Xem Thử Trong Trình Đọc
              </Button>
            </div>
          </div>
        )}

        {/* ===================== TAB 2: X-RAY ===================== */}
        {activeSubTab === "xray" && (
          <div className="max-w-4xl mx-auto flex flex-col gap-6">
            {/* Stat Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card size="sm">
                <CardContent className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Nhân vật (People)</span>
                  <div className="text-xl font-bold text-foreground flex items-center gap-2">
                    {xrayData?.people.length || 0}
                  </div>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardContent className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Địa danh &amp; Thuật ngữ (Terms)</span>
                  <div className="text-xl font-bold text-foreground">
                    {xrayData?.terms.length || 0}
                  </div>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardContent className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Tổng lượt xuất hiện đã quét</span>
                  <div className="text-xl font-bold text-foreground">
                    {xrayData?.totalOccurrences || 0} lần
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Action Toolbar */}
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleRunXRayScan}
                    disabled={isAnalyzingXRay}
                    className="text-xs gap-1.5"
                  >
                    {isAnalyzingXRay ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                    {isAnalyzingXRay ? "Đang quét..." : "Quét Tự Động Nhân Vật (X-Ray)"}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleEmbedAppendix}
                    disabled={isEmbeddingAppendix || !xrayData}
                    className={`text-xs gap-1.5 ${
                      hasAppendixChapter ? "text-emerald-600 dark:text-emerald-400" : ""
                    }`}
                  >
                    {isEmbeddingAppendix ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Layers className="size-3.5" />
                    )}
                    {hasAppendixChapter ? "Đã nhúng phụ lục (Cập nhật)" : "Nhúng Phụ Lục Vào Sách"}
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditForm({ name: "", aliases: "", type: "person", role: "", description: "" });
                      setIsAddingNew(true);
                      setEditingEntity(null);
                    }}
                    className="text-xs gap-1.5"
                  >
                    <Plus className="size-3.5" />
                    Thêm Thủ Công
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Search and Filters */}
            {xrayData && (
              <div className="flex flex-col md:flex-row items-center justify-between gap-3">
                <ToggleGroup
                  type="single"
                  value={xrayFilter}
                  onValueChange={(val) => {
                    if (val === "all" || val === "person" || val === "term") setXrayFilter(val);
                  }}
                  variant="outline"
                  size="sm"
                  className="border border-border rounded-md p-0.5 bg-muted/40"
                >
                  <ToggleGroupItem
                    value="all"
                    size="sm"
                    className="h-6 text-xs px-2 data-[state=on]:bg-background data-[state=on]:text-primary"
                  >
                    Tất cả ({(xrayData.people.length + xrayData.terms.length)})
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="person"
                    size="sm"
                    className="h-6 text-xs px-2 data-[state=on]:bg-background data-[state=on]:text-primary"
                  >
                    Nhân vật ({xrayData.people.length})
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="term"
                    size="sm"
                    className="h-6 text-xs px-2 data-[state=on]:bg-background data-[state=on]:text-primary"
                  >
                    Thuật ngữ ({xrayData.terms.length})
                  </ToggleGroupItem>
                </ToggleGroup>

                <div className="relative w-full md:w-64">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Tìm nhân vật, địa danh..."
                    value={xraySearch}
                    onChange={(e) => setXraySearch(e.target.value)}
                    className="h-8 w-full text-xs pl-8"
                  />
                </div>
              </div>
            )}

            {/* Entities List */}
            {filteredEntities.length === 0 ? (
              <Empty className="border border-border bg-card">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Search className="size-4" />
                  </EmptyMedia>
                  <EmptyDescription className="text-xs">
                    {xrayData ? "Không tìm thấy thực thể nào phù hợp." : "Chưa có dữ liệu X-Ray. Hãy bấm 'Quét Tự Động Nhân Vật' để bắt đầu."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredEntities.map((entity) => {
                  const initials = entity.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                  return (
                    <Card key={entity.id}>
                      <CardContent className="flex flex-col gap-3">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2.5">
                              <div className="size-8 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center flex-shrink-0">
                                {initials}
                              </div>
                              <div>
                                <h3 className="text-xs font-bold text-foreground">{entity.name}</h3>
                                {entity.role && (
                                  <span className="text-[10px] text-muted-foreground">{entity.role}</span>
                                )}
                              </div>
                            </div>
                            <Badge variant="secondary" className="text-[10px] font-mono">
                              {entity.occurrencesCount} lần
                            </Badge>
                          </div>

                          {entity.aliases && entity.aliases.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {entity.aliases.map((a, i) => (
                                <Badge
                                  key={i}
                                  variant="secondary"
                                  className="h-auto text-[9.5px] px-1.5 py-0.5 font-normal"
                                >
                                  {a}
                                </Badge>
                              ))}
                            </div>
                          )}

                          <p className="text-xs text-foreground line-clamp-3 leading-relaxed">
                            {entity.description}
                          </p>
                        </div>

                        {/* Excerpt Snippet */}
                        {entity.excerpts && entity.excerpts.length > 0 && (
                          <div className="p-2 rounded bg-muted/30 border border-border text-[11px] text-muted-foreground italic line-clamp-2">
                            "{entity.excerpts[0].snippet}"
                          </div>
                        )}

                        {/* Card Actions */}
                        <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-border">
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-[11px]"
                            onClick={() => {
                              setEditingEntity(entity);
                              setIsAddingNew(false);
                              setEditForm({
                                name: entity.name,
                                aliases: (entity.aliases || []).join(", "),
                                type: entity.type,
                                role: entity.role || "",
                                description: entity.description,
                              });
                            }}
                          >
                            Chỉnh sửa
                          </Button>
                          <Separator orientation="vertical" className="h-3" />
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-[11px] text-destructive hover:text-destructive"
                            onClick={() => handleDeleteEntity(entity.id)}
                          >
                            Xóa
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===================== TAB 3: KINDLE NATIVE SDR ===================== */}
        {activeSubTab === "sdr" && (
          <div className="max-w-4xl mx-auto flex flex-col gap-6">
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Info size={18} className="text-primary" />
                  Hướng Dẫn Kích Hoạt Trên Máy Kindle
                </CardTitle>
              </CardHeader>

              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Method 1: Send-to-Kindle (Recommended) */}
                  <div className="p-4 rounded border border-border bg-background flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-bold text-foreground mb-1">
                        <Send size={14} className="text-emerald-600 dark:text-emerald-400" />
                        Cách 1: Gửi Qua Send-to-Kindle (Khuyên dùng)
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                        Không cần cắm cáp USB! Chỉ cần xuất sách EPUB đã nhúng thẻ Word Wise (tại tab Word Wise), sau đó gửi qua email hoặc website Send-to-Kindle của Amazon.
                      </p>
                      <ul className="text-xs text-foreground flex flex-col gap-1.5 list-disc pl-4">
                        <li>Máy Kindle hiển thị chữ chú thích nhỏ ngay trên đầu từ.</li>
                        <li>Hỗ trợ cả giải nghĩa <strong>Anh - Việt</strong>.</li>
                        <li>Hoạt động trên cả Kindle app điện thoại và máy đọc sách.</li>
                      </ul>
                      <Alert className="mt-3 border-border bg-card">
                        <AlertDescription className="text-[10px] leading-relaxed">
                          <strong className="text-foreground">Lưu ý về cách gọi tên:</strong> đây là
                          chú thích từ vựng dạng <em>ruby</em> (chữ nhỏ phía trên từ), hiển thị giống Word
                          Wise nhưng KHÔNG kích hoạt công cụ Word Wise độc quyền của Amazon.
                        </AlertDescription>
                      </Alert>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setActiveSubTab("wordwise")}
                      className="text-xs gap-1.5 w-full mt-2"
                    >
                      <Languages className="size-3.5" />
                      Đến Tab Word Wise Nhúng Vào Sách
                    </Button>
                  </div>

                  {/* Method 2: Sideload via USB (.sdr) */}
                  <div className="p-4 rounded border border-border bg-background flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-bold text-foreground mb-1">
                        <Usb size={14} className="text-primary" />
                        Cách 2: Chép Cáp USB (Thư Mục .sdr)
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                        Dành cho sách định dạng AZW3 / KFX chép trực tiếp vào thư mục <code>documents/</code> của máy Kindle.
                      </p>
                      <div className="text-xs text-foreground flex flex-col gap-2">
                        <div className="p-2 rounded bg-card font-mono text-[11px] border border-border">
                          documents/<br />
                          ├── {currentBook.title.replace(/[\\/:*?"<>|]/g, "_")}.azw3<br />
                          └── {currentBook.title.replace(/[\\/:*?"<>|]/g, "_")}.sdr/<br />
                          &nbsp;&nbsp;&nbsp;&nbsp;├── XRAY.entities.B0xxxxxx.asc<br />
                          &nbsp;&nbsp;&nbsp;&nbsp;└── LanguageLayer.en.B0xxxxxx.kll
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 mt-3 pt-3 border-t border-border">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="kindle-sdr-asin" className="text-[11px] font-medium text-foreground">
                          Mã định danh ASIN sách trên Kindle
                        </Label>
                        <Input
                          id="kindle-sdr-asin"
                          type="text"
                          value={sdrAsin}
                          onChange={(e) => setSdrAsin(e.target.value.toUpperCase())}
                          placeholder="B0XXXXXXXX"
                          className="h-8 w-full text-xs font-mono"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <Label htmlFor="kindle-sdr-dir" className="text-[11px] font-medium text-foreground">
                          Thư mục lưu (chọn thư mục documents trên Kindle hoặc thư mục máy tính)
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id="kindle-sdr-dir"
                            type="text"
                            readOnly
                            value={targetSdrDir || ""}
                            placeholder="Chưa chọn thư mục..."
                            className="h-8 flex-1 text-xs"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const selected = await open({ directory: true, multiple: false });
                                if (selected && typeof selected === "string") {
                                  setTargetSdrDir(selected);
                                }
                              } catch (e) {
                                // Non-fatal: User cancelled directory selection dialog or denied access
                                console.error("Directory picker cancelled or failed:", e);
                              }
                            }}
                            className="text-xs gap-1.5 flex-shrink-0"
                          >
                            <FolderOpen className="size-3.5" />
                            Chọn thư mục
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 p-2 rounded-lg border border-border hover:bg-muted/40">
                        <Checkbox
                          id="kindle-allow-missing-book"
                          checked={allowMissingBookFile}
                          onCheckedChange={(checked) => setAllowMissingBookFile(checked === true)}
                          className="mt-0.5"
                        />
                        <Label
                          htmlFor="kindle-allow-missing-book"
                          className="text-left cursor-pointer leading-normal"
                        >
                          <span className="flex flex-col gap-0.5">
                            <span className="block text-[11px] font-semibold text-foreground">
                              Tôi sẽ tự chép kèm tệp sách (chưa có trong thư mục)
                            </span>
                            <span className="block text-[10px] font-normal text-muted-foreground leading-relaxed">
                              Mặc định ứng dụng sẽ từ chối tạo sidecar nếu chưa thấy tệp sách trong thư mục
                              đã chọn, vì sidecar mồ côi sẽ không có tác dụng trên máy Kindle.
                            </span>
                          </span>
                        </Label>
                      </div>

                      <Button
                        type="button"
                        disabled={isExportingSdr || !targetSdrDir}
                        onClick={async () => {
                          if (!targetSdrDir) {
                            toast.error("Vui lòng chọn thư mục lưu trữ trước.");
                            return;
                          }
                          setIsExportingSdr(true);
                          setExportedSdrResult(null);
                          try {
                            const xrayPayload = xrayData
                              ? {
                                  asin: sdrAsin,
                                  book_title: currentBook.title,
                                  people: xrayData.people.map((p) => ({
                                    id: p.id,
                                    name: p.name,
                                    aliases: p.aliases,
                                    entity_type: "person",
                                    role: p.role,
                                    description: p.description,
                                    occurrences_count: p.occurrencesCount,
                                    occurrences: p.excerpts.map((ex) => [ex.startOffset || 100, p.name.length]),
                                  })),
                                  terms: xrayData.terms.map((t) => ({
                                    id: t.id,
                                    name: t.name,
                                    aliases: t.aliases,
                                    entity_type: "term",
                                    role: t.role,
                                    description: t.description,
                                    occurrences_count: t.occurrencesCount,
                                    occurrences: t.excerpts.map((ex) => [ex.startOffset || 100, t.name.length]),
                                  })),
                                }
                              : null;
  
                            const wordwisePayload = {
                              asin: sdrAsin,
                              acr: currentBook.title.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 30),
                              revision: "rev_8d271dc3",
                              glosses: [],
                            };
  
                            const res = await invoke<{
                              sdr_dir_path: string;
                              total_bytes: number;
                              paired_book_file: string | null;
                            }>("export_kindle_sdr", {
                              outputDir: targetSdrDir,
                              bookBasename: currentBook.title,
                              asin: sdrAsin,
                              xrayPayload,
                              wordwisePayload,
                              allowMissingBookFile,
                            });
  
                            setExportedSdrResult({
                              path: res.sdr_dir_path,
                              bytes: res.total_bytes,
                              pairedBookFile: res.paired_book_file ?? null,
                            });
                            toast.success("Đã xuất thư mục .sdr cho máy Kindle thành công!");
                          } catch (err) {
                            // Handled via user-visible notification; not rethrown to prevent unhandled rejection in UI event
                            console.error("Export Kindle SDR failed:", err);
                            toast.error(`Lỗi khi xuất SDR: ${err}`);
                          } finally {
                            setIsExportingSdr(false);
                          }
                        }}
                        className="text-xs gap-1.5 w-full mt-1"
                      >
                        {isExportingSdr ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Usb className="size-3.5" />
                        )}
                        {isExportingSdr ? "Đang xuất file SDR..." : "Xuất Thư Mục .sdr Cho Kindle"}
                      </Button>
  
                      <Alert className="border-amber-500/30 bg-amber-500/10">
                        <Info className="size-3 text-amber-600 dark:text-amber-400" />
                        <AlertDescription className="text-[10px] text-foreground leading-relaxed">
                          <strong>Hai cách này loại trừ nhau.</strong> Thư mục <code>.sdr</code> chỉ hợp lệ
                          khi đi kèm <em>đúng</em> tệp sách mà nó được tạo ra (byte offset phải khớp).
                          Vì bản Kindle do NiceEbook tạo đã nhúng sẵn chú thích ruby trong nội dung, bạn
                          <strong> không cần</strong> và <strong>không nên</strong> ghép sidecar này với tệp
                          AZW3 do ứng dụng xuất ra — hãy dùng một trong hai hướng, không dùng cả hai.
                        </AlertDescription>
                      </Alert>
  
                      {exportedSdrResult && (
                        <Alert className="border-emerald-500/20 bg-emerald-500/10">
                          <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                          <AlertTitle className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            Đã tạo xong thư mục sidecar:
                          </AlertTitle>
                          <AlertDescription className="flex flex-col gap-1 text-xs text-foreground">
                            <div className="font-mono text-[11px] break-all">{exportedSdrResult.path}</div>
                            <div className="text-[10px] text-muted-foreground">
                              Dung lượng SQLite: {(exportedSdrResult.bytes / 1024).toFixed(1)} KB
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {exportedSdrResult.pairedBookFile
                                ? `Ghép với tệp sách: ${exportedSdrResult.pairedBookFile}`
                                : "Chưa có tệp sách đi kèm — hãy tự chép kèm đúng tệp sách này."}
                            </div>
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Edit / Add Modal */}
      <Dialog
        open={Boolean(editingEntity || isAddingNew)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingEntity(null);
            setIsAddingNew(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground">
              {isAddingNew ? "Thêm Thực Thể X-Ray Mới" : "Chỉnh Sửa Thực Thể X-Ray"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="xray-entity-name" className="text-xs font-medium text-foreground">
                Tên thực thể
              </Label>
              <Input
                id="xray-entity-name"
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Ví dụ: Sherlock Holmes hoặc Phố Baker"
                className="h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium text-foreground">Phân loại</Label>
                <Select
                  value={editForm.type}
                  onValueChange={(val) => {
                    if (val === "person" || val === "term") setEditForm({ ...editForm, type: val });
                  }}
                >
                  <SelectTrigger size="sm" className="w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="person">Nhân vật (Person)</SelectItem>
                      <SelectItem value="term">Thuật ngữ / Địa danh (Term)</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="xray-entity-role" className="text-xs font-medium text-foreground">
                  Vai trò / Nhãn phụ
                </Label>
                <Input
                  id="xray-entity-role"
                  type="text"
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  placeholder="Thám tử, Địa danh..."
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="xray-entity-aliases" className="text-xs font-medium text-foreground">
                Tên gọi khác / Bí danh (ngăn cách bằng dấu phẩy)
              </Label>
              <Input
                id="xray-entity-aliases"
                type="text"
                value={editForm.aliases}
                onChange={(e) => setEditForm({ ...editForm, aliases: e.target.value })}
                placeholder="Holmes, Mr. Holmes..."
                className="h-8 text-xs"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="xray-entity-description" className="text-xs font-medium text-foreground">
                Mô tả / Tiểu sử
              </Label>
              <Textarea
                id="xray-entity-description"
                rows={3}
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Mô tả tóm tắt về nhân vật hoặc địa danh..."
                className="min-h-16 text-xs resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => {
                setEditingEntity(null);
                setIsAddingNew(false);
              }}
            >
              Hủy bỏ
            </Button>
            <Button
              type="button"
              size="sm"
              className="text-xs"
              onClick={handleSaveEntity}
            >
              Lưu Thay Đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
