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
      <div className="flex flex-col items-center justify-center h-[calc(100vh-140px)] text-center p-6">
        <div className="w-16 h-16 rounded-full bg-[var(--muted)] flex items-center justify-center mb-4 text-[var(--muted-foreground)]">
          <BookOpen size={32} />
        </div>
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">
          Chưa có sách nào được mở
        </h2>
        <p className="text-sm text-[var(--muted-foreground)] max-w-md mb-6">
          Vui lòng nạp một file sách (EPUB, PDF, TXT) trước để sử dụng bộ công cụ Kindle Companion.
        </p>
        <button
          type="button"
          onClick={() => setActiveTab("books")}
          className="app-btn app-btn--primary px-4 py-2"
        >
          Đến Thư Viện Sách
        </button>
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
    <div className="flex-1 flex flex-col h-[calc(100vh-80px)] overflow-hidden bg-[var(--background)]">
      {/* Top Banner Header */}
      <div className="p-4 border-b border-[var(--border)] bg-[var(--card)] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-[var(--foreground)] flex items-center gap-2">
              <Sparkles size={18} className="text-[var(--primary)]" />
              Bước 7: Kindle X-Ray, Word Wise &amp; Xuất Bản
            </h1>
            <span className="app-badge app-badge--brand text-[10px] h-[18px]">Universal EPUB</span>
          </div>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            Sách hiện tại: <span className="font-semibold text-[var(--foreground)]">{currentBook.title}</span> — {currentBook.author} ({currentBook.chapter_count} chương)
          </p>
        </div>

        {/* Sub-tab Navigation */}
        <div className="segmented-toggle">
          <button
            type="button"
            data-active={activeSubTab === "wordwise" ? "true" : undefined}
            onClick={() => setActiveSubTab("wordwise")}
            className="segmented-toggle__item flex items-center gap-1.5"
          >
            <Languages size={14} />
            Word Wise (Từ vựng)
          </button>
          <button
            type="button"
            data-active={activeSubTab === "xray" ? "true" : undefined}
            onClick={() => setActiveSubTab("xray")}
            className="segmented-toggle__item flex items-center gap-1.5"
          >
            <UserCheck size={14} />
            X-Ray (Nhân vật &amp; Bối cảnh)
          </button>
          <button
            type="button"
            data-active={activeSubTab === "sdr" ? "true" : undefined}
            onClick={() => setActiveSubTab("sdr")}
            className="segmented-toggle__item flex items-center gap-1.5"
          >
            <Usb size={14} />
            Xuất Kindle (.sdr)
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* ===================== TAB 1: WORD WISE ===================== */}
        {activeSubTab === "wordwise" && (
          <div className="max-w-4xl mx-auto flex flex-col gap-6">
            {/* Stat Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-[var(--ui-radius-card)] bg-[var(--card)] border border-[var(--border)]">
                <span className="text-xs text-[var(--muted-foreground)]">Chương đã có Word Wise</span>
                <div className="text-xl font-bold text-[var(--foreground)] mt-1 flex items-center gap-2">
                  {annotatedChaptersCount} / {currentBook.chapter_count}
                  {annotatedChaptersCount > 0 && (
                    <span className="app-badge app-badge--success text-[10px]">Đã bật</span>
                  )}
                </div>
              </div>
              <div className="p-3.5 rounded-[var(--ui-radius-card)] bg-[var(--card)] border border-[var(--border)]">
                <span className="text-xs text-[var(--muted-foreground)]">Cấp độ từ lọc</span>
                <div className="text-xl font-bold text-[var(--foreground)] mt-1">
                  Mức {wordWiseSettings.maxDifficulty} (CEFR {wordWiseSettings.maxDifficulty <= 1 ? "C2" : wordWiseSettings.maxDifficulty <= 3 ? "C1+" : "B2+"})
                </div>
              </div>
              <div className="p-3.5 rounded-[var(--ui-radius-card)] bg-[var(--card)] border border-[var(--border)]">
                <span className="text-xs text-[var(--muted-foreground)]">Ngôn ngữ giải nghĩa</span>
                <div className="text-xl font-bold text-[var(--foreground)] mt-1 flex items-center gap-2">
                  {wordWiseSettings.language === "vi" ? "Tiếng Việt (Anh - Việt)" : "English (Anh - Anh)"}
                </div>
              </div>
            </div>

            {/* Word Wise Configuration Card */}
            <div className="p-5 rounded-[var(--ui-radius-card)] bg-[var(--card)] border border-[var(--border)] flex flex-col gap-5">
              <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
                <Sliders size={18} className="text-[var(--primary)]" />
                <h2 className="text-sm font-semibold text-[var(--foreground)]">
                  Cấu Hình Word Wise
                </h2>
              </div>

              {/* Setting: Difficulty Level */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-[var(--foreground)]">
                    Độ khó từ vựng muốn hiển thị gợi ý
                  </label>
                  <span className="text-xs font-mono text-[var(--primary)]">
                    Mức {wordWiseSettings.maxDifficulty} / 5
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {[
                    { lvl: 1, label: "Mức 1: C2 Hiếm", desc: "Chỉ từ rất hiếm/văn học" },
                    { lvl: 2, label: "Mức 2: C1 Nâng cao", desc: "Từ học thuật/văn phong cao" },
                    { lvl: 3, label: "Mức 3: C1 Khuyên dùng", desc: "Từ trung cấp nâng cao" },
                    { lvl: 4, label: "Mức 4: B2+", desc: "Nhiều từ phong phú hơn" },
                    { lvl: 5, label: "Mức 5: Toàn bộ", desc: "Bao gồm cả từ B2 thông dụng" },
                  ].map((item) => (
                    <button
                      key={item.lvl}
                      type="button"
                      onClick={() => setWordWiseSettings({ maxDifficulty: item.lvl as any })}
                      className={`p-2.5 rounded-[var(--ui-radius-button)] border text-left transition-all ${
                        wordWiseSettings.maxDifficulty === item.lvl
                          ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))] text-[var(--primary)] font-medium"
                          : "border-[var(--border)] hover:bg-[var(--secondary)] text-[var(--foreground)]"
                      }`}
                    >
                      <div className="text-xs font-bold">{item.label}</div>
                      <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{item.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Setting: Language */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
                <div>
                  <div className="text-xs font-medium text-[var(--foreground)]">Ngôn ngữ chú thích (Glosses)</div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    Gợi ý hiển thị bằng Tiếng Việt giúp người học tiếng Anh ghi nhớ từ vựng nhanh gấp 3 lần.
                  </div>
                </div>
                <div className="segmented-toggle">
                  <button
                    type="button"
                    data-active={wordWiseSettings.language === "vi" ? "true" : undefined}
                    onClick={() => setWordWiseSettings({ language: "vi" })}
                    className="segmented-toggle__item"
                  >
                    Tiếng Việt (Anh - Việt)
                  </button>
                  <button
                    type="button"
                    data-active={wordWiseSettings.language === "en" ? "true" : undefined}
                    onClick={() => setWordWiseSettings({ language: "en" })}
                    className="segmented-toggle__item"
                  >
                    Tiếng Anh (Anh - Anh)
                  </button>
                </div>
              </div>

              {/* Setting: Max occurrences per chapter */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
                <div>
                  <div className="text-xs font-medium text-[var(--foreground)]">Tần suất chú thích lặp lại mỗi chương</div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    Tránh làm rối mắt nếu một từ xuất hiện nhiều lần liên tiếp trong một chương.
                  </div>
                </div>
                <div className="segmented-toggle">
                  {[
                    { val: 1, label: "1 lần" },
                    { val: 2, label: "2 lần" },
                    { val: 3, label: "3 lần (Chuẩn)" },
                    { val: 0, label: "Không giới hạn" },
                  ].map((item) => (
                    <button
                      key={item.val}
                      type="button"
                      data-active={wordWiseSettings.maxOccurrencesPerWord === item.val ? "true" : undefined}
                      onClick={() => setWordWiseSettings({ maxOccurrencesPerWord: item.val })}
                      className="segmented-toggle__item"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Preview Box */}
            <div className="p-5 rounded-[var(--ui-radius-card)] bg-[var(--card)] border border-[var(--border)] flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                  <Eye size={14} className="text-[var(--primary)]" />
                  Xem Trước Hiển Thị Word Wise (Live Preview)
                </span>
                <span className="text-[10px] text-[var(--muted-foreground)]">
                  Thẻ HTML5 &lt;ruby&gt; chuẩn Kindle &amp; EPUB
                </span>
              </div>
              <div className="p-4 rounded border border-[var(--border)] bg-[var(--background)] text-sm leading-relaxed font-serif">
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
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleApplyWordWise}
                disabled={isApplyingWordWise}
                className="app-btn app-btn--primary px-4 py-2 text-xs flex items-center gap-2"
              >
                {isApplyingWordWise ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                {isApplyingWordWise ? "Đang nhúng Word Wise..." : "Áp Dụng Vào Sách (Nhúng Thẻ Ruby)"}
              </button>

              {annotatedChaptersCount > 0 && (
                <button
                  type="button"
                  onClick={handleRemoveWordWise}
                  disabled={isStrippingWordWise}
                  className="app-btn app-btn--secondary px-4 py-2 text-xs flex items-center gap-2 text-[var(--destructive)]"
                >
                  {isStrippingWordWise ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  Gỡ Bỏ Chú Thích Word Wise
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveTab("reader")}
                className="app-btn app-btn--secondary px-4 py-2 text-xs ml-auto flex items-center gap-1.5"
              >
                <BookOpen size={14} />
                Xem Thử Trong Trình Đọc
              </button>
            </div>
          </div>
        )}

        {/* ===================== TAB 2: X-RAY ===================== */}
        {activeSubTab === "xray" && (
          <div className="max-w-4xl mx-auto flex flex-col gap-6">
            {/* Stat Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-[var(--ui-radius-card)] bg-[var(--card)] border border-[var(--border)]">
                <span className="text-xs text-[var(--muted-foreground)]">Nhân vật (People)</span>
                <div className="text-xl font-bold text-[var(--foreground)] mt-1 flex items-center gap-2">
                  {xrayData?.people.length || 0}
                </div>
              </div>
              <div className="p-3.5 rounded-[var(--ui-radius-card)] bg-[var(--card)] border border-[var(--border)]">
                <span className="text-xs text-[var(--muted-foreground)]">Địa danh &amp; Thuật ngữ (Terms)</span>
                <div className="text-xl font-bold text-[var(--foreground)] mt-1">
                  {xrayData?.terms.length || 0}
                </div>
              </div>
              <div className="p-3.5 rounded-[var(--ui-radius-card)] bg-[var(--card)] border border-[var(--border)]">
                <span className="text-xs text-[var(--muted-foreground)]">Tổng lượt xuất hiện đã quét</span>
                <div className="text-xl font-bold text-[var(--foreground)] mt-1">
                  {xrayData?.totalOccurrences || 0} lần
                </div>
              </div>
            </div>

            {/* Action Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-[var(--ui-radius-card)] bg-[var(--card)] border border-[var(--border)]">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunXRayScan}
                  disabled={isAnalyzingXRay}
                  className="app-btn app-btn--primary px-3 py-1.5 text-xs flex items-center gap-1.5"
                >
                  {isAnalyzingXRay ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Sparkles size={13} />
                  )}
                  {isAnalyzingXRay ? "Đang quét..." : "Quét Tự Động Nhân Vật (X-Ray)"}
                </button>

                <button
                  type="button"
                  onClick={handleEmbedAppendix}
                  disabled={isEmbeddingAppendix || !xrayData}
                  className={`app-btn px-3 py-1.5 text-xs flex items-center gap-1.5 ${
                    hasAppendixChapter
                      ? "app-btn--secondary text-[var(--ui-success)]"
                      : "app-btn--secondary"
                  }`}
                >
                  {isEmbeddingAppendix ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Layers size={13} />
                  )}
                  {hasAppendixChapter ? "Đã nhúng phụ lục (Cập nhật)" : "Nhúng Phụ Lục Vào Sách"}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditForm({ name: "", aliases: "", type: "person", role: "", description: "" });
                    setIsAddingNew(true);
                    setEditingEntity(null);
                  }}
                  className="app-btn app-btn--secondary px-3 py-1.5 text-xs flex items-center gap-1.5"
                >
                  <Plus size={13} />
                  Thêm Thủ Công
                </button>
              </div>
            </div>

            {/* Search and Filters */}
            {xrayData && (
              <div className="flex flex-col md:flex-row items-center justify-between gap-3">
                <div className="segmented-toggle">
                  <button
                    type="button"
                    data-active={xrayFilter === "all" ? "true" : undefined}
                    onClick={() => setXrayFilter("all")}
                    className="segmented-toggle__item"
                  >
                    Tất cả ({(xrayData.people.length + xrayData.terms.length)})
                  </button>
                  <button
                    type="button"
                    data-active={xrayFilter === "person" ? "true" : undefined}
                    onClick={() => setXrayFilter("person")}
                    className="segmented-toggle__item"
                  >
                    Nhân vật ({xrayData.people.length})
                  </button>
                  <button
                    type="button"
                    data-active={xrayFilter === "term" ? "true" : undefined}
                    onClick={() => setXrayFilter("term")}
                    className="segmented-toggle__item"
                  >
                    Thuật ngữ ({xrayData.terms.length})
                  </button>
                </div>

                <div className="relative w-full md:w-64">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
                  <input
                    type="text"
                    placeholder="Tìm nhân vật, địa danh..."
                    value={xraySearch}
                    onChange={(e) => setXraySearch(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-1.5 rounded-[var(--ui-radius-button)] border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>
            )}

            {/* Entities List */}
            {filteredEntities.length === 0 ? (
              <div className="p-8 text-center rounded-[var(--ui-radius-card)] bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)] text-xs">
                {xrayData ? "Không tìm thấy thực thể nào phù hợp." : "Chưa có dữ liệu X-Ray. Hãy bấm 'Quét Tự Động Nhân Vật' để bắt đầu."}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredEntities.map((entity) => {
                  const initials = entity.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                  return (
                    <div
                      key={entity.id}
                      className="p-4 rounded-[var(--ui-radius-card)] bg-[var(--card)] border border-[var(--border)] flex flex-col justify-between gap-3 shadow-xs"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-bold flex items-center justify-center flex-shrink-0">
                              {initials}
                            </div>
                            <div>
                              <h3 className="text-xs font-bold text-[var(--foreground)]">{entity.name}</h3>
                              {entity.role && (
                                <span className="text-[10px] text-[var(--muted-foreground)]">{entity.role}</span>
                              )}
                            </div>
                          </div>
                          <span className="app-badge app-badge--neutral text-[10px] font-mono">
                            {entity.occurrencesCount} lần
                          </span>
                        </div>

                        {entity.aliases && entity.aliases.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {entity.aliases.map((a, i) => (
                              <span key={i} className="text-[9.5px] px-1.5 py-0.5 rounded bg-[var(--secondary)] text-[var(--secondary-foreground)]">
                                {a}
                              </span>
                            ))}
                          </div>
                        )}

                        <p className="text-xs text-[var(--foreground)] line-clamp-3 leading-relaxed">
                          {entity.description}
                        </p>
                      </div>

                      {/* Excerpt Snippet */}
                      {entity.excerpts && entity.excerpts.length > 0 && (
                        <div className="p-2 rounded bg-[var(--background)] border border-[var(--border)] text-[11px] text-[var(--muted-foreground)] italic line-clamp-2">
                          "{entity.excerpts[0].snippet}"
                        </div>
                      )}

                      {/* Card Actions */}
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                        <button
                          type="button"
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
                          className="text-[11px] text-[var(--primary)] hover:underline"
                        >
                          Chỉnh sửa
                        </button>
                        <span className="text-[var(--border)]">|</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteEntity(entity.id)}
                          className="text-[11px] text-[var(--destructive)] hover:underline"
                        >
                          Xóa
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===================== TAB 3: KINDLE NATIVE SDR ===================== */}
        {activeSubTab === "sdr" && (
          <div className="max-w-4xl mx-auto flex flex-col gap-6">
            <div className="p-5 rounded-[var(--ui-radius-card)] bg-[var(--card)] border border-[var(--border)] flex flex-col gap-4">
              <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
                <Info size={18} className="text-[var(--primary)]" />
                <h2 className="text-sm font-semibold text-[var(--foreground)]">
                  Hướng Dẫn Kích Hoạt Trên Máy Kindle
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Method 1: Send-to-Kindle (Recommended) */}
                <div className="p-4 rounded border border-[var(--border)] bg-[var(--background)] flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold text-[var(--foreground)] mb-1">
                      <Send size={14} className="text-[var(--ui-success)]" />
                      Cách 1: Gửi Qua Send-to-Kindle (Khuyên dùng)
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)] leading-relaxed mb-3">
                      Không cần cắm cáp USB! Chỉ cần xuất sách EPUB đã nhúng thẻ Word Wise (tại tab Word Wise), sau đó gửi qua email hoặc website Send-to-Kindle của Amazon.
                    </p>
                    <ul className="text-xs text-[var(--foreground)] space-y-1.5 list-disc pl-4">
                      <li>Máy Kindle hiển thị chữ chú thích nhỏ ngay trên đầu từ.</li>
                      <li>Hỗ trợ cả giải nghĩa <strong>Anh - Việt</strong>.</li>
                      <li>Hoạt động trên cả Kindle app điện thoại và máy đọc sách.</li>
                    </ul>
                    <div className="mt-3 p-2 rounded bg-[var(--card)] border border-[var(--border)] text-[10px] text-[var(--muted-foreground)] leading-relaxed">
                      <strong className="text-[var(--foreground)]">Lưu ý về cách gọi tên:</strong> đây là
                      chú thích từ vựng dạng <em>ruby</em> (chữ nhỏ phía trên từ), hiển thị giống Word
                      Wise nhưng KHÔNG kích hoạt công cụ Word Wise độc quyền của Amazon.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab("wordwise")}
                    className="app-btn app-btn--primary px-3 py-1.5 text-xs flex items-center justify-center gap-1.5 w-full mt-2"
                  >
                    <Languages size={13} />
                    Đến Tab Word Wise Nhúng Vào Sách
                  </button>
                </div>

                {/* Method 2: Sideload via USB (.sdr) */}
                <div className="p-4 rounded border border-[var(--border)] bg-[var(--background)] flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold text-[var(--foreground)] mb-1">
                      <Usb size={14} className="text-[var(--primary)]" />
                      Cách 2: Chép Cáp USB (Thư Mục .sdr)
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)] leading-relaxed mb-3">
                      Dành cho sách định dạng AZW3 / KFX chép trực tiếp vào thư mục <code>documents/</code> của máy Kindle.
                    </p>
                    <div className="text-xs text-[var(--foreground)] space-y-2">
                      <div className="p-2 rounded bg-[var(--card)] font-mono text-[11px] border border-[var(--border)]">
                        documents/<br />
                        ├── {currentBook.title.replace(/[\\/:*?"<>|]/g, "_")}.azw3<br />
                        └── {currentBook.title.replace(/[\\/:*?"<>|]/g, "_")}.sdr/<br />
                        &nbsp;&nbsp;&nbsp;&nbsp;├── XRAY.entities.B0xxxxxx.asc<br />
                        &nbsp;&nbsp;&nbsp;&nbsp;└── LanguageLayer.en.B0xxxxxx.kll
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 mt-3 pt-3 border-t border-[var(--border)]">
                    <div>
                      <label className="text-[11px] font-medium text-[var(--foreground)] block mb-1">
                        Mã định danh ASIN sách trên Kindle
                      </label>
                      <input
                        type="text"
                        value={sdrAsin}
                        onChange={(e) => setSdrAsin(e.target.value.toUpperCase())}
                        placeholder="B0XXXXXXXX"
                        className="w-full text-xs font-mono px-3 py-1.5 rounded-[var(--ui-radius-button)] border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-[var(--foreground)] block mb-1">
                        Thư mục lưu (chọn thư mục documents trên Kindle hoặc thư mục máy tính)
                      </label>                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={targetSdrDir || ""}
                          placeholder="Chưa chọn thư mục..."
                          className="flex-1 text-xs px-3 py-1.5 rounded-[var(--ui-radius-button)] border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none"
                        />
                        <button
                          type="button"
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
                          className="app-btn app-btn--secondary px-2.5 py-1.5 text-xs flex items-center gap-1.5 flex-shrink-0"
                        >
                          <FolderOpen size={13} />
                          Chọn thư mục
                        </button>
                      </div>
                    </div>

                    <label className="flex items-start gap-2 p-2 rounded-[var(--ui-radius-button)] border border-[var(--border)] cursor-pointer hover:bg-[var(--secondary)]">
                      <input
                        type="checkbox"
                        checked={allowMissingBookFile}
                        onChange={(e) => setAllowMissingBookFile(e.target.checked)}
                        className="mt-0.5 accent-[var(--primary)]"
                      />
                      <span>
                        <span className="block text-[11px] font-semibold text-[var(--foreground)]">
                          Tôi sẽ tự chép kèm tệp sách (chưa có trong thư mục)
                        </span>
                        <span className="block text-[10px] text-[var(--muted-foreground)] leading-relaxed">
                          Mặc định ứng dụng sẽ từ chối tạo sidecar nếu chưa thấy tệp sách trong thư mục
                          đã chọn, vì sidecar mồ côi sẽ không có tác dụng trên máy Kindle.
                        </span>
                      </span>
                    </label>

                    <button
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
                      className="app-btn app-btn--primary px-4 py-2 text-xs flex items-center justify-center gap-1.5 w-full mt-1"
                    >
                      {isExportingSdr ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Usb size={13} />
                      )}
                      {isExportingSdr ? "Đang xuất file SDR..." : "Xuất Thư Mục .sdr Cho Kindle"}
                    </button>

                    <div className="p-2.5 rounded bg-[color-mix(in_srgb,var(--ui-warning)_10%,var(--card))] border border-[color-mix(in_srgb,var(--ui-warning)_30%,var(--border))] flex items-start gap-1.5">
                      <Info size={11} className="text-[var(--ui-warning)] mt-0.5 flex-shrink-0" />
                      <p className="text-[10px] text-[var(--foreground)] leading-relaxed">
                        <strong>Hai cách này loại trừ nhau.</strong> Thư mục <code>.sdr</code> chỉ hợp lệ
                        khi đi kèm <em>đúng</em> tệp sách mà nó được tạo ra (byte offset phải khớp).
                        Vì bản Kindle do NiceEbook tạo đã nhúng sẵn chú thích ruby trong nội dung, bạn
                        <strong> không cần</strong> và <strong>không nên</strong> ghép sidecar này với tệp
                        AZW3 do ứng dụng xuất ra — hãy dùng một trong hai hướng, không dùng cả hai.
                      </p>
                    </div>

                    {exportedSdrResult && (
                      <div className="p-3 rounded bg-[color-mix(in_srgb,var(--ui-success)_10%,var(--card))] border border-[var(--ui-success)]/30 text-xs text-[var(--foreground)] flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-[var(--ui-success)] font-semibold">
                          <CheckCircle2 size={14} />
                          Đã tạo xong thư mục sidecar:
                        </div>
                        <div className="font-mono text-[11px] break-all">{exportedSdrResult.path}</div>
                        <div className="text-[10px] text-[var(--muted-foreground)]">
                          Dung lượng SQLite: {(exportedSdrResult.bytes / 1024).toFixed(1)} KB
                        </div>
                        <div className="text-[10px] text-[var(--muted-foreground)]">
                          {exportedSdrResult.pairedBookFile
                            ? `Ghép với tệp sách: ${exportedSdrResult.pairedBookFile}`
                            : "Chưa có tệp sách đi kèm — hãy tự chép kèm đúng tệp sách này."}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit / Add Modal */}
      {(editingEntity || isAddingNew) && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-[var(--ui-radius-card)] bg-[var(--card)] border border-[var(--border)] shadow-xl p-5 flex flex-col gap-4">
            <h3 className="text-sm font-bold text-[var(--foreground)]">
              {isAddingNew ? "Thêm Thực Thể X-Ray Mới" : "Chỉnh Sửa Thực Thể X-Ray"}
            </h3>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-[var(--foreground)] block mb-1">
                  Tên thực thể
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Ví dụ: Sherlock Holmes hoặc Phố Baker"
                  className="w-full text-xs px-3 py-2 rounded-[var(--ui-radius-button)] border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-[var(--foreground)] block mb-1">
                    Phân loại
                  </label>
                  <select
                    value={editForm.type}
                    onChange={(e) => setEditForm({ ...editForm, type: e.target.value as any })}
                    className="w-full text-xs px-3 py-2 rounded-[var(--ui-radius-button)] border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
                  >
                    <option value="person">Nhân vật (Person)</option>
                    <option value="term">Thuật ngữ / Địa danh (Term)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-[var(--foreground)] block mb-1">
                    Vai trò / Nhãn phụ
                  </label>
                  <input
                    type="text"
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    placeholder="Thám tử, Địa danh..."
                    className="w-full text-xs px-3 py-2 rounded-[var(--ui-radius-button)] border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--foreground)] block mb-1">
                  Tên gọi khác / Bí danh (ngăn cách bằng dấu phẩy)
                </label>
                <input
                  type="text"
                  value={editForm.aliases}
                  onChange={(e) => setEditForm({ ...editForm, aliases: e.target.value })}
                  placeholder="Holmes, Mr. Holmes..."
                  className="w-full text-xs px-3 py-2 rounded-[var(--ui-radius-button)] border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--foreground)] block mb-1">
                  Mô tả / Tiểu sử
                </label>
                <textarea
                  rows={3}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Mô tả tóm tắt về nhân vật hoặc địa danh..."
                  className="w-full text-xs px-3 py-2 rounded-[var(--ui-radius-button)] border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)] resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => {
                  setEditingEntity(null);
                  setIsAddingNew(false);
                }}
                className="app-btn app-btn--secondary px-3 py-1.5 text-xs"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleSaveEntity}
                className="app-btn app-btn--primary px-3 py-1.5 text-xs"
              >
                Lưu Thay Đổi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
