import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Sparkles,
  Search,
  Upload,
  Image as ImageIcon,
  Check,
  Trash2,
  BookOpen,
  Wand2,
  Building2,
  Calendar,
  Globe,
  Hash,
  Tag,
  ExternalLink,
  Layers,
  Loader2,
  FileText,
  BookmarkCheck,
  Compass
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import { Button } from "../ui/button";
import { BookMetadataService, BookMetadataItem, CoverOption, normalizeAuthor } from "../../services/metadata/bookMetadataService";
import { AiMetadataEnricher } from "../../services/metadata/aiMetadataEnricher";
import { AiCoverTab } from "./AiCoverTab";
import { toast } from "sonner";

interface MetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "metadata" | "covers" | "upload" | "ai-cover";
  // Optional mode for ConverterView
  converterValues?: {
    title: string;
    author: string;
    language: string;
    description: string;
    coverDataUrl?: string;
  };
  onApplyConverterValues?: (values: {
    title: string;
    author: string;
    language: string;
    description: string;
    coverDataUrl?: string;
  }) => void;
}

export function MetadataModal({
  isOpen,
  onClose,
  initialTab,
  converterValues,
  onApplyConverterValues,
}: MetadataModalProps) {
  const { currentBook, updateBookMetadata, activeGateway, selectedModel } = useAppStore();

  const isConverterMode = Boolean(converterValues && onApplyConverterValues);

  // Form State
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [publisher, setPublisher] = useState("");
  const [publishedYear, setPublishedYear] = useState("");
  const [language, setLanguage] = useState("vi");
  const [genre, setGenre] = useState("");
  const [isbn, setIsbn] = useState("");
  const [description, setDescription] = useState("");
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<"metadata" | "covers" | "upload" | "ai-cover">(initialTab || "metadata");

  // Search Source Mode: All / Wattpad & Webnovel / Published Books
  const [searchSourceMode, setSearchSourceMode] = useState<"all" | "wattpad" | "published">("all");

  // Search Online State
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [searchResults, setSearchResults] = useState<BookMetadataItem[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Cover Gallery State
  const [isSearchingCovers, setIsSearchingCovers] = useState(false);
  const [coverGallery, setCoverGallery] = useState<CoverOption[]>([]);
  const [coverSearchQuery, setCoverSearchQuery] = useState("");
  const [coverSourceMode, setCoverSourceMode] = useState<"all" | "wattpad" | "published">("all");

  // AI Enrichment State
  const [isAiEnriching, setIsAiEnriching] = useState(false);

  // Diff / Confirmation State
  const [diffModalData, setDiffModalData] = useState<{
    incoming: Partial<BookMetadataItem>;
    fieldsToApply: Record<string, boolean>;
  } | null>(null);

  // Custom Image URL state
  const [customImageUrl, setCustomImageUrl] = useState("");
  const [isFetchingCustomUrl, setIsFetchingCustomUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-Save State & Refs
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const isInitialSync = useRef(true);
  const prevIsOpenRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const valuesRef = useRef({
    title,
    author,
    publisher,
    publishedYear,
    language,
    genre,
    isbn,
    description,
    coverDataUrl,
  });

  valuesRef.current = {
    title,
    author,
    publisher,
    publishedYear,
    language,
    genre,
    isbn,
    description,
    coverDataUrl,
  };

  // The exact values last pushed from the store into this form. Any field whose
  // live value differs from its snapshot is an unsaved user edit and must never
  // be silently overwritten by an external `currentBook` change.
  const syncedSnapshotRef = useRef<{
    title: string;
    author: string;
    publisher: string;
    publishedYear: string;
    language: string;
    genre: string;
    isbn: string;
    description: string;
    coverDataUrl: string | null;
  } | null>(null);

  const performSave = (overrides?: Partial<typeof valuesRef.current>) => {
    const current = { ...valuesRef.current, ...overrides };
    const rawTitle = current.title ?? "";
    const trimmedTitle = String(rawTitle).trim();
    if (!trimmedTitle) {
      setSaveStatus("unsaved");
      return false;
    }

    setSaveStatus("saving");

    const trimmedAuthor = String(current.author ?? "").trim() || "Khuyết Danh";
    const trimmedLanguage = String(current.language ?? "vi").trim() || "vi";
    const trimmedDescription = String(current.description ?? "").trim();
    const rawPublisher = String(current.publisher ?? "").trim();
    const rawPublishedYear = String(current.publishedYear ?? "").trim();
    const rawGenre = String(current.genre ?? "").trim();
    const rawIsbn = String(current.isbn ?? "").trim();

    if (isConverterMode && onApplyConverterValues) {
      onApplyConverterValues({
        title: trimmedTitle,
        author: trimmedAuthor,
        language: trimmedLanguage,
        description: trimmedDescription,
        coverDataUrl: current.coverDataUrl || undefined,
      });
    } else {
      updateBookMetadata({
        title: trimmedTitle,
        author: trimmedAuthor,
        publisher: rawPublisher || undefined,
        published_year: rawPublishedYear || undefined,
        language: trimmedLanguage,
        genre: rawGenre || undefined,
        isbn: rawIsbn || undefined,
        description: trimmedDescription || null,
        cover_data_url: current.coverDataUrl || null,
      });
    }

    // The form now matches what was just written to the store, so the fields are no
    // longer "dirty" and may accept external updates again. Without this a field the
    // user edited even once would never re-converge with the store.
    syncedSnapshotRef.current = { ...current };

    setSaveStatus("saved");
    return true;
  };

  // Debounced auto-save on field edits
  useEffect(() => {
    if (!isOpen) return;

    if (isInitialSync.current) {
      isInitialSync.current = false;
      return;
    }

    setSaveStatus("saving");
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      performSave();
    }, 600);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [title, author, publisher, publishedYear, language, genre, isbn, description]);

  // Sync state ONLY when opening (isOpen transitions from false to true)
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      useAppStore.getState().setAgentDrawerOpen(false);
      isInitialSync.current = true;
      setSaveStatus("saved");
      if (initialTab) {
        setActiveTab(initialTab);
      }
      if (isConverterMode && converterValues) {
        setTitle(converterValues.title || "");
        setAuthor(converterValues.author || "");
        setLanguage(converterValues.language || "vi");
        setDescription(converterValues.description || "");
        setCoverDataUrl(converterValues.coverDataUrl || null);
        setCoverSearchQuery(converterValues.title || "");
      } else {
        const book = useAppStore.getState().currentBook;
        if (book) {
          setTitle(book.title || "");
          setAuthor(book.author || "");
          setPublisher(book.publisher || "");
          setPublishedYear(book.published_year || "");
          setLanguage(book.language || "vi");
          setGenre(book.genre || "");
          setIsbn(book.isbn || "");
          setDescription(book.description || "");
          setCoverDataUrl(book.cover_data_url || null);
          setCoverSearchQuery(book.title || "");
        }
      }

      // Record exactly what the store pushed into the form. Fields that later
      // diverge from this snapshot are the user's unsaved edits.
      const b = !isConverterMode ? useAppStore.getState().currentBook : null;
      syncedSnapshotRef.current = isConverterMode
        ? null
        : {
            title: b?.title || "",
            author: b?.author || "",
            publisher: b?.publisher || "",
            publishedYear: b?.published_year || "",
            language: b?.language || "vi",
            genre: b?.genre || "",
            isbn: b?.isbn || "",
            description: b?.description || "",
            coverDataUrl: b?.cover_data_url || null,
          };

      setSearchResults([]);
      setShowSearchResults(false);
      setDiffModalData(null);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, initialTab, isConverterMode, converterValues]);

  // Sync state when currentBook changes externally (e.g. from Chat Agent, or a
  // chapter translation completing while the modal is open).
  //
  // A field the user has typed into (i.e. one that no longer matches the last
  // snapshot pushed from the store) is deliberately NOT overwritten: otherwise
  // the incoming value silently replaces in-progress typing, and the 600 ms
  // debounce then persists the reverted value over the user's edit.
  const prevBookRef = useRef(currentBook);
  useEffect(() => {
    if (!isOpen || isConverterMode) return;
    if (!currentBook || currentBook === prevBookRef.current) return;
    prevBookRef.current = currentBook;

    const snapshot = syncedSnapshotRef.current;
    if (!snapshot) return;

    const form = valuesRef.current;
    const next = { ...snapshot };

    // Each field is refreshed only while it still matches the snapshot, i.e. the
    // user has not typed into it since the last store sync.
    if (form.title === snapshot.title) {
      next.title = currentBook.title ?? "";
      setTitle(next.title);
    }
    if (currentBook.author !== undefined && form.author === snapshot.author) {
      next.author = currentBook.author;
      setAuthor(next.author);
    }
    if (currentBook.publisher !== undefined && form.publisher === snapshot.publisher) {
      next.publisher = currentBook.publisher;
      setPublisher(next.publisher);
    }
    if (currentBook.published_year !== undefined && form.publishedYear === snapshot.publishedYear) {
      next.publishedYear = currentBook.published_year;
      setPublishedYear(next.publishedYear);
    }
    if (currentBook.language && form.language === snapshot.language) {
      next.language = currentBook.language;
      setLanguage(next.language);
    }
    if (currentBook.genre !== undefined && form.genre === snapshot.genre) {
      next.genre = currentBook.genre;
      setGenre(next.genre);
    }
    if (currentBook.isbn !== undefined && form.isbn === snapshot.isbn) {
      next.isbn = currentBook.isbn;
      setIsbn(next.isbn);
    }
    if (currentBook.description !== undefined && form.description === snapshot.description) {
      next.description = currentBook.description ?? "";
      setDescription(next.description);
    }
    if (
      currentBook.cover_data_url !== undefined &&
      form.coverDataUrl === snapshot.coverDataUrl
    ) {
      next.coverDataUrl = currentBook.cover_data_url;
      setCoverDataUrl(next.coverDataUrl);
    }

    syncedSnapshotRef.current = next;
  }, [isOpen, currentBook, isConverterMode]);

  function handleClose() {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    performSave();
    onClose();
  }

  // Handle ESC key to auto-save and close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !diffModalData) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, diffModalData]);

  if (!isOpen) return null;

  // Handle Online Search
  async function handleSearchOnline() {
    const q = title.trim();
    if (!q) {
      toast.error("Vui lòng nhập tựa sách / tên truyện để tra cứu");
      return;
    }

    setIsSearchingOnline(true);
    setShowSearchResults(true);
    toast.loading("Đang tra cứu trực tuyến...", { id: "meta-search" });

    try {
      const results = await BookMetadataService.searchBookMetadata(q, author.trim(), searchSourceMode);
      setSearchResults(results);
      if (results.length > 0) {
        toast.success(`Tìm thấy ${results.length} kết quả phù hợp!`, { id: "meta-search" });
      } else {
        toast.info("Không tìm thấy kết quả từ nguồn đã chọn. Bạn có thể đổi nguồn hoặc dùng AI Tóm tắt.", { id: "meta-search" });
      }
    } catch (err) {
      console.error(err);
      toast.error("Lỗi khi tra cứu dữ liệu trực tuyến", { id: "meta-search" });
    } finally {
      setIsSearchingOnline(false);
    }
  }

  // Handle Quick Auto Enrich (1-click)
  async function handleQuickAutoEnrich() {
    const q = title.trim();
    if (!q) {
      toast.error("Tựa sách / tên truyện đang trống");
      return;
    }

    setIsSearchingOnline(true);
    toast.loading("Đang tự động tìm kiếm bản ghi chuẩn nhất...", { id: "quick-enrich" });

    try {
      const results = await BookMetadataService.searchBookMetadata(q, author.trim(), searchSourceMode);
      if (results.length > 0) {
        const best = results[0];
        openDiffConfirmation(best);
        toast.success("Đã tìm thấy dữ liệu đối chiếu tốt nhất!", { id: "quick-enrich" });
      } else {
        toast.info("Chưa tìm thấy ấn bản trực tuyến khớp. Thử chọn chế độ AI Tóm tắt để đọc trực tiếp từ sách.", { id: "quick-enrich" });
      }
    } catch (err) {
      console.error(err);
      toast.error("Lỗi khi tự động tra cứu", { id: "quick-enrich" });
    } finally {
      setIsSearchingOnline(false);
    }
  }

  // Handle AI Metadata Enrichment
  async function handleAiEnrich() {
    if (!activeGateway || !selectedModel) {
      toast.error("Vui lòng kết nối AI Gateway trong mục Cài đặt AI trước");
      return;
    }

    setIsAiEnriching(true);
    toast.loading("AI đang phân tích trích đoạn & văn án sách...", { id: "ai-enrich" });

    try {
      const sampleText = currentBook?.sample_text || description || "";
      const result = await AiMetadataEnricher.enrichMetadata(
        {
          title,
          author,
          sampleText,
          language,
        },
        {
          baseUrl: activeGateway.base_url,
          model: selectedModel,
          gatewayType: activeGateway.gateway_type,
        }
      );

      openDiffConfirmation({
        title: result.title,
        author: result.author,
        description: result.description,
        categories: result.tags && result.tags.length > 0 ? result.tags : [result.genre],
        language: result.language,
      });

      toast.success("AI đã hoàn tất gợi ý metadata & văn án!", { id: "ai-enrich" });
    } catch (err: any) {
      console.error(err);
      toast.error(`Lỗi AI: ${err.message || err}`, { id: "ai-enrich" });
    } finally {
      setIsAiEnriching(false);
    }
  }

  // Open Diff Modal before applying
  function openDiffConfirmation(incoming: Partial<BookMetadataItem>) {
    const fieldsToApply: Record<string, boolean> = {
      title: Boolean(incoming.title && incoming.title !== title),
      author: Boolean(incoming.author && incoming.author !== author),
      publisher: Boolean(incoming.publisher && incoming.publisher !== publisher),
      publishedYear: Boolean(incoming.publishedYear && incoming.publishedYear !== publishedYear),
      language: Boolean(incoming.language && incoming.language !== language),
      genre: Boolean(incoming.categories && incoming.categories.length > 0),
      isbn: Boolean(incoming.isbn && incoming.isbn !== isbn),
      description: Boolean(incoming.description && incoming.description !== description),
      cover: Boolean(incoming.coverUrl && incoming.coverUrl !== coverDataUrl),
    };

    setDiffModalData({
      incoming,
      fieldsToApply,
    });
  }

  // Apply Selected Diff Fields
  async function applyDiffFields() {
    if (!diffModalData) return;
    const { incoming, fieldsToApply } = diffModalData;

    if (fieldsToApply.title && incoming.title) setTitle(incoming.title);
    if (fieldsToApply.author && incoming.author) setAuthor(normalizeAuthor(incoming.author));
    if (fieldsToApply.publisher && incoming.publisher) setPublisher(incoming.publisher);
    if (fieldsToApply.publishedYear && incoming.publishedYear) setPublishedYear(incoming.publishedYear);
    if (fieldsToApply.language && incoming.language) setLanguage(incoming.language);
    if (fieldsToApply.genre && incoming.categories) setGenre(incoming.categories.join(", "));
    if (fieldsToApply.isbn && incoming.isbn) setIsbn(incoming.isbn);
    if (fieldsToApply.description && incoming.description) setDescription(incoming.description);

    let appliedCoverDataUrl = coverDataUrl;
    if (fieldsToApply.cover && incoming.coverUrl) {
      toast.loading("Đang tải ảnh bìa chất lượng cao...", { id: "dl-cover" });
      try {
        const b64 = await BookMetadataService.fetchCoverDataUrl(incoming.coverUrl);
        setCoverDataUrl(b64);
        appliedCoverDataUrl = b64;
        toast.success("Đã nạp ảnh bìa mới!", { id: "dl-cover" });
      } catch (err) {
        console.error(err);
        toast.error("Không thể tải ảnh bìa về máy", { id: "dl-cover" });
      }
    }

    setDiffModalData(null);
    setShowSearchResults(false);
    performSave({
      title: fieldsToApply.title && incoming.title ? incoming.title : title,
      author: fieldsToApply.author && incoming.author ? normalizeAuthor(incoming.author) : author,
      publisher: fieldsToApply.publisher && incoming.publisher ? incoming.publisher : publisher,
      publishedYear: fieldsToApply.publishedYear && incoming.publishedYear ? incoming.publishedYear : publishedYear,
      language: fieldsToApply.language && incoming.language ? incoming.language : language,
      genre: fieldsToApply.genre && incoming.categories ? incoming.categories.join(", ") : genre,
      isbn: fieldsToApply.isbn && incoming.isbn ? incoming.isbn : isbn,
      description: fieldsToApply.description && incoming.description ? incoming.description : description,
      coverDataUrl: appliedCoverDataUrl,
    });
    toast.success("Đã áp dụng và tự động lưu thông tin vào bản thảo!");
  }

  // Search Covers Gallery
  async function handleSearchCovers() {
    const q = coverSearchQuery.trim() || title.trim();
    if (!q) {
      toast.error("Vui lòng nhập tên sách để tìm ảnh bìa");
      return;
    }

    setIsSearchingCovers(true);
    toast.loading("Đang tìm kiếm các ấn bản ảnh bìa đẹp...", { id: "cover-search" });

    try {
      const covers = await BookMetadataService.searchOnlineCovers(q, author.trim(), coverSourceMode);
      setCoverGallery(covers);
      if (covers.length > 0) {
        toast.success(`Tìm thấy ${covers.length} phiên bản ảnh bìa!`, { id: "cover-search" });
      } else {
        toast.info("Không tìm thấy ảnh bìa từ nguồn đã chọn", { id: "cover-search" });
      }
    } catch (err) {
      console.error(err);
      toast.error("Lỗi khi tìm ảnh bìa", { id: "cover-search" });
    } finally {
      setIsSearchingCovers(false);
    }
  }

  // Select Cover from Gallery
  async function handleSelectCover(cov: CoverOption) {
    toast.loading("Đang nạp ảnh bìa...", { id: "dl-cover-item" });
    try {
      const b64 = await BookMetadataService.fetchCoverDataUrl(cov.url);
      setCoverDataUrl(b64);
      performSave({ coverDataUrl: b64 });
      toast.success("Đã chọn và tự động lưu ảnh bìa mới!", { id: "dl-cover-item" });
      setActiveTab("metadata");
    } catch (err) {
      console.error(err);
      toast.error("Lỗi khi tải ảnh bìa này", { id: "dl-cover-item" });
    }
  }

  // Handle Local File Cover Upload
  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file hình ảnh (JPG, PNG, WebP)");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCoverDataUrl(reader.result);
        performSave({ coverDataUrl: reader.result });
        toast.success("Đã nạp và tự động lưu ảnh bìa từ máy tính!");
        setActiveTab("metadata");
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  // Handle Custom Image URL
  async function handleApplyCustomUrl() {
    const u = customImageUrl.trim();
    if (!u) return;

    setIsFetchingCustomUrl(true);
    toast.loading("Đang tải ảnh từ URL...", { id: "custom-url" });

    try {
      const b64 = await BookMetadataService.fetchCoverDataUrl(u);
      setCoverDataUrl(b64);
      setCustomImageUrl("");
      performSave({ coverDataUrl: b64 });
      toast.success("Đã áp dụng và tự động lưu ảnh bìa từ URL!", { id: "custom-url" });
      setActiveTab("metadata");
    } catch (err) {
      console.error(err);
      toast.error("Không thể tải ảnh từ URL này (vui lòng kiểm tra lại đường dẫn)", { id: "custom-url" });
    } finally {
      setIsFetchingCustomUrl(false);
    }
  }

  // Save All Changes
  function handleSaveAll() {
    if (!title.trim()) {
      toast.error("Tựa sách không được để trống");
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    performSave();

    if (isConverterMode) {
      toast.success("Đã lưu thông tin sách vào trình chuyển đổi!");
    } else {
      toast.success("Đã cập nhật metadata và ảnh bìa sách thành công!");
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 select-none animate-in fade-in duration-150">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/jpg"
        className="hidden"
        onChange={handleFileInputChange}
      />

      <div className="card-surface rounded-[var(--ui-radius-overlay)] w-full max-w-5xl xl:max-w-6xl h-[92vh] max-h-[880px] flex flex-col overflow-hidden shadow-2xl border border-border transition-all">
        {/* Fixed Header */}
        <header className="shrink-0 min-h-14 px-5 py-2 border-b border-border flex items-center justify-between gap-3 bg-[var(--ui-titlebar-surface)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-[var(--ui-radius-card)] border border-primary/20 bg-primary/10 text-primary">
              <BookOpen size={16} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="truncate text-base font-semibold text-foreground">Chỉnh Sửa Metadata &amp; Ảnh Bìa</h2>
                <span className="inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-primary/30 bg-primary/10 px-2 text-xs font-medium text-primary">
                  Đa Nền Tảng &amp; Wattpad
                </span>
                {saveStatus === "saving" ? (
                  <span className="inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border bg-muted/50 px-2 text-xs text-muted-foreground animate-pulse">
                    <Loader2 size={12} className="animate-spin text-primary" />
                    <span>Đang lưu...</span>
                  </span>
                ) : (
                  <span className="inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <Check size={12} />
                    <span>Tự động lưu</span>
                  </span>
                )}
              </div>
              <p className="truncate text-sm text-muted-foreground">
                Bổ sung thông tin sách xuất bản, truyện mạng/Wattpad &amp; tìm kiếm ảnh bìa đẹp
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleQuickAutoEnrich}
              disabled={isSearchingOnline}
              className="h-7 gap-1.5 rounded-[var(--ui-radius-button)] px-2.5 text-xs text-primary"
              title="Tự động tìm kiếm thông tin khớp nhất trên mạng và hiển thị so sánh"
            >
              {isSearchingOnline ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Sparkles size={13} />
              )}
              <span>{isSearchingOnline ? "Đang tìm kiếm..." : "⚡ Bổ Sung Nhanh"}</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="size-8 rounded-[var(--ui-radius-button)] text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </Button>
          </div>
        </header>

        {/* Modal Body: compact cover column + tabbed form area */}
        <div className="flex-1 flex flex-col sm:flex-row min-h-0 overflow-hidden">
          {/* Left Column: Cover Preview (hidden in AI Cover tab so the AI Studio gets the full width) */}
          {activeTab !== "ai-cover" && (
            <aside className="w-full sm:w-32 shrink-0 p-3 border-b sm:border-b-0 sm:border-r border-border bg-card flex flex-col gap-3 overflow-y-auto">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Ảnh bìa tác phẩm
              </span>

              {/* Cover Card Display */}
              <div className="flex aspect-[2/3] w-full items-center justify-center overflow-hidden rounded-[var(--ui-radius-card)] border border-border bg-secondary">
                {coverDataUrl ? (
                  <img
                    src={coverDataUrl}
                    alt="Book Cover"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-1 p-2 text-center text-muted-foreground">
                    <ImageIcon size={20} className="opacity-40" />
                    <span className="text-xs font-medium">Chưa có ảnh bìa</span>
                  </div>
                )}
              </div>

              {/* Shared help/status slot */}
              <div className="min-h-4 text-xs">
                {coverDataUrl ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <Check size={12} />
                    <span>Đã gắn ảnh bìa</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Tỉ lệ 2:3 chuẩn Ebook</span>
                )}
              </div>

              {/* Compact cover actions */}
              <div className="space-y-1.5 border-t border-border pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCoverSearchQuery(title);
                    setActiveTab("covers");
                    if (coverGallery.length === 0) handleSearchCovers();
                  }}
                  className="h-7 w-full gap-1.5 rounded-[var(--ui-radius-button)] px-2 text-xs"
                >
                  <Search size={13} />
                  <span>Đổi ảnh bìa</span>
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setActiveTab("ai-cover")}
                  className="h-7 w-full gap-1.5 rounded-[var(--ui-radius-button)] px-2 text-xs text-amber-600 dark:text-amber-400"
                >
                  <Wand2 size={13} />
                  <span>Tạo bìa AI</span>
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-7 w-full gap-1.5 rounded-[var(--ui-radius-button)] px-2 text-xs"
                >
                  <Upload size={13} />
                  <span>Tải ảnh lên</span>
                </Button>

                {coverDataUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setCoverDataUrl(null);
                      performSave({ coverDataUrl: null });
                      toast.success("Đã xóa và tự động lưu ảnh bìa!");
                    }}
                    className="h-7 w-full gap-1.5 rounded-[var(--ui-radius-button)] bg-rose-500/10 px-2 text-xs text-rose-700 hover:bg-rose-500/15 dark:text-rose-400"
                  >
                    <Trash2 size={13} />
                    <span>Xóa bìa</span>
                  </Button>
                )}
              </div>
            </aside>
          )}

          {/* Right Column: Tabbed Content */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-background overflow-hidden">
            {/* Clean Single-Line Tab Switcher */}
            <div className="shrink-0 min-h-11 px-5 py-1 border-b border-border flex items-center bg-card overflow-x-auto">
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab("metadata")}
                  className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--ui-radius-button)] border px-2.5 text-xs font-medium transition-colors ${
                    activeTab === "metadata"
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <FileText size={13} />
                  <span>Thông tin tác phẩm</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("ai-cover")}
                  className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--ui-radius-button)] border px-2.5 text-xs font-medium transition-colors ${
                    activeTab === "ai-cover"
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Wand2 size={13} className="text-amber-500" />
                  <span>✨ Tạo bìa AI</span>
                  <span className="inline-flex h-5 items-center whitespace-nowrap rounded-full border border-amber-500/25 bg-amber-500/10 px-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                    Mới
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("covers");
                    if (coverGallery.length === 0 && (coverSearchQuery || title)) {
                      handleSearchCovers();
                    }
                  }}
                  className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--ui-radius-button)] border px-2.5 text-xs font-medium transition-colors ${
                    activeTab === "covers"
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <ImageIcon size={13} />
                  <span>Kho ảnh bìa đẹp</span>
                  {coverGallery.length > 0 && (
                    <span className="inline-flex h-5 items-center whitespace-nowrap rounded-full border border-primary/30 bg-primary/10 px-1.5 text-xs font-medium text-primary">
                      {coverGallery.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("upload")}
                  className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--ui-radius-button)] border px-2.5 text-xs font-medium transition-colors ${
                    activeTab === "upload"
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Upload size={13} />
                  <span>Tải ảnh / URL</span>
                </button>
              </div>
            </div>

            {/* Tab Body */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 space-y-4 min-w-0">
              {/* TAB: AI COVER STUDIO */}
              {activeTab === "ai-cover" && (
                <AiCoverTab
                  bookTitle={title}
                  author={author}
                  genre={genre}
                  description={description}
                  activeGateway={activeGateway}
                  selectedModel={selectedModel || "deepseek-chat"}
                  onApplyCover={(dataUrl) => {
                    setCoverDataUrl(dataUrl);
                    performSave({ coverDataUrl: dataUrl });
                    toast.success("Đã chọn ảnh bìa AI và tự động lưu sách!");
                    setActiveTab("metadata");
                  }}
                />
              )}

              {/* TAB 1: METADATA FORM */}
              {activeTab === "metadata" && (
                <div className="space-y-4 w-full min-w-0">
                  {/* Dedicated Search & Enrichment Control Card */}
                  <div className="rounded-[var(--ui-radius-card)] border border-border bg-card p-3 shadow-xs space-y-2.5 min-w-0">
                    <div className="flex flex-col gap-2.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 shrink-0">
                          <Compass size={13} className="text-primary" />
                          <span>Nguồn tra cứu:</span>
                        </span>
                        <div className="flex items-center gap-0.5 rounded-[var(--ui-radius-button)] border border-border bg-secondary p-0.5 text-xs flex-wrap">
                          <button
                            type="button"
                            onClick={() => setSearchSourceMode("all")}
                            className={`h-7 whitespace-nowrap rounded-[var(--ui-radius-button)] border px-2.5 font-medium transition-colors ${
                              searchSourceMode === "all"
                                ? "border-border bg-card text-foreground shadow-xs"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            🌐 Đa Nguồn (Goodreads + Wattpad + Fable)
                          </button>
                          <button
                            type="button"
                            onClick={() => setSearchSourceMode("published")}
                            className={`h-7 whitespace-nowrap rounded-[var(--ui-radius-button)] border px-2.5 font-medium transition-colors ${
                              searchSourceMode === "published"
                                ? "border-border bg-card text-foreground shadow-xs"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            📚 Sách (Goodreads / Fable / Google)
                          </button>
                          <button
                            type="button"
                            onClick={() => setSearchSourceMode("wattpad")}
                            className={`h-7 whitespace-nowrap rounded-[var(--ui-radius-button)] border px-2.5 font-medium transition-colors ${
                              searchSourceMode === "wattpad"
                                ? "border-border bg-card text-foreground shadow-xs"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            📖 Wattpad &amp; Truyện Mạng
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap border-t border-border/50 pt-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleSearchOnline}
                          disabled={isSearchingOnline}
                          className="h-7 gap-1.5 rounded-[var(--ui-radius-button)] px-2.5 text-xs text-primary"
                        >
                          {isSearchingOnline ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Search size={13} />
                          )}
                          <span>{isSearchingOnline ? "Đang tra cứu..." : "Tra cứu trực tuyến"}</span>
                        </Button>

                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleAiEnrich}
                          disabled={isAiEnriching}
                          className="h-7 gap-1.5 rounded-[var(--ui-radius-button)] px-2.5 text-xs text-primary"
                          title={activeGateway ? `Dùng mô hình ${selectedModel}` : "Chưa kết nối AI Gateway"}
                        >
                          {isAiEnriching ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Wand2 size={13} />
                          )}
                          <span>{isAiEnriching ? "AI đang đọc..." : "AI Tóm tắt & Văn án"}</span>
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Two-column form grid (title & description span both columns) */}
                  <div className="grid gap-4 sm:grid-cols-2 min-w-0">
                    {/* Title */}
                    <div className="sm:col-span-2 min-w-0">
                      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground truncate">
                        <BookOpen size={14} className="text-primary shrink-0" />
                        <span>
                          Tựa đề / Tên truyện (Title) <span className="text-red-600">*</span>
                        </span>
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Nhập tên truyện hoặc tựa sách..."
                        className="mt-1.5 h-10 w-full min-w-0 rounded-[var(--ui-radius-card)] border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/25"
                      />
                      <div className="mt-1 min-h-4 text-xs">
                        {saveStatus === "unsaved" ? (
                          <span className="text-red-600">Tựa đề không được để trống</span>
                        ) : (
                          <span className="text-muted-foreground">
                            Bắt buộc, hiển thị làm tên sách trong thư viện
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Author */}
                    <div className="min-w-0">
                      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground truncate">
                        <Globe size={14} className="text-primary shrink-0" />
                        <span>Tác giả / Dịch giả / Editor (Author)</span>
                      </label>
                      <input
                        type="text"
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        placeholder="Tên tác giả gốc hoặc người dịch..."
                        className="mt-1.5 h-10 w-full min-w-0 rounded-[var(--ui-radius-card)] border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/25"
                      />
                      <div className="mt-1 min-h-4 text-xs">
                        <span className="text-muted-foreground">Để trống sẽ lưu là Khuyết Danh</span>
                      </div>
                    </div>

                    {/* Genre */}
                    <div className="min-w-0">
                      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground truncate">
                        <Tag size={14} className="text-muted-foreground shrink-0" />
                        <span>Thể loại / Tags (Genre)</span>
                      </label>
                      <input
                        type="text"
                        value={genre}
                        onChange={(e) => setGenre(e.target.value)}
                        placeholder="Ngôn tình, Tiên hiệp, Đam mỹ, Tiểu thuyết, Trinh thám..."
                        className="mt-1.5 h-10 w-full min-w-0 rounded-[var(--ui-radius-card)] border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/25"
                      />
                      <div className="mt-1 min-h-4 text-xs">
                        <span className="text-muted-foreground">Nhiều thể loại, cách nhau bằng dấu phẩy</span>
                      </div>
                    </div>

                    {/* Publisher */}
                    <div className="min-w-0">
                      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground truncate">
                        <Building2 size={14} className="text-muted-foreground shrink-0" />
                        <span>Nguồn truyện / Nhà xuất bản</span>
                      </label>
                      <input
                        type="text"
                        value={publisher}
                        onChange={(e) => setPublisher(e.target.value)}
                        placeholder="Goodreads, Wattpad, TruyenFull, TangThuVien, NXB Trẻ..."
                        className="mt-1.5 h-10 w-full min-w-0 rounded-[var(--ui-radius-card)] border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/25"
                      />
                      <div className="mt-1 min-h-4 text-xs" />
                    </div>

                    {/* Published year */}
                    <div className="min-w-0">
                      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground truncate">
                        <Calendar size={14} className="text-muted-foreground shrink-0" />
                        <span>Tình trạng / Năm phát hành</span>
                      </label>
                      <input
                        type="text"
                        value={publishedYear}
                        onChange={(e) => setPublishedYear(e.target.value)}
                        placeholder="Hoàn thành, Đang ra, hoặc 2024..."
                        className="mt-1.5 h-10 w-full min-w-0 rounded-[var(--ui-radius-card)] border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/25"
                      />
                      <div className="mt-1 min-h-4 text-xs" />
                    </div>

                    {/* Language */}
                    <div className="min-w-0">
                      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground truncate">
                        <Globe size={14} className="text-muted-foreground shrink-0" />
                        <span>Mã ngôn ngữ</span>
                      </label>
                      <input
                        type="text"
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        placeholder="vi, en, zh, ja..."
                        className="mt-1.5 h-10 w-full min-w-0 rounded-[var(--ui-radius-card)] border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/25 font-mono"
                      />
                      <div className="mt-1 min-h-4 text-xs" />
                    </div>

                    {/* ISBN */}
                    <div className="min-w-0">
                      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground truncate">
                        <Hash size={14} className="text-muted-foreground shrink-0" />
                        <span>Mã ISBN (tùy chọn)</span>
                      </label>
                      <input
                        type="text"
                        value={isbn}
                        onChange={(e) => setIsbn(e.target.value)}
                        placeholder="978-604-..."
                        className="mt-1.5 h-10 w-full min-w-0 rounded-[var(--ui-radius-card)] border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/25 font-mono"
                      />
                      <div className="mt-1 min-h-4 text-xs" />
                    </div>

                    {/* Description */}
                    <div className="sm:col-span-2 min-w-0">
                      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Layers size={14} className="text-primary shrink-0" />
                        <span>Văn án / Lời giới thiệu &amp; Tóm tắt nội dung</span>
                      </label>
                      <textarea
                        rows={6}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Nhập văn án tác phẩm hoặc tóm tắt nội dung sách, hoặc nhấn 'AI Tóm tắt & Văn án' để hệ thống tự động bóc tách từ chương đầu..."
                        className="mt-1.5 w-full min-w-0 rounded-[var(--ui-radius-card)] border border-border bg-card px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/25 resize-y"
                      />
                      <div className="mt-1 min-h-4 text-xs">
                        <span className="text-muted-foreground">{(description || "").length} ký tự</span>
                      </div>
                    </div>
                  </div>

                  {/* Search Results Drawer if user searched */}
                  {showSearchResults && (
                    <div className="rounded-[var(--ui-radius-card)] border border-primary/30 bg-primary/5 p-3 space-y-3 animate-in fade-in duration-150 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Search size={14} className="text-primary shrink-0" />
                          <h4 className="text-xs font-semibold text-foreground truncate">
                            Kết Quả Tra Cứu Trực Tuyến ({searchResults.length})
                          </h4>
                          <span className="inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-primary/30 bg-primary/10 px-2 text-xs font-medium text-primary">
                            {searchSourceMode === "wattpad"
                              ? "Wattpad"
                              : searchSourceMode === "published"
                              ? "Goodreads/Fable/Google"
                              : "Đa Nguồn"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowSearchResults(false)}
                          className="h-7 shrink-0 rounded-[var(--ui-radius-button)] px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          Đóng
                        </button>
                      </div>

                      {searchResults.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Không tìm thấy kết quả nào khớp với "{title}". Hãy thử đổi sang nguồn khác hoặc dùng AI.
                        </p>
                      ) : (
                        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                          {searchResults.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-start justify-between gap-3 rounded-[var(--ui-radius-card)] border border-border bg-card p-3 shadow-xs hover:border-primary transition-colors min-w-0"
                            >
                              <div className="flex items-start gap-3 min-w-0">
                                {item.coverUrl ? (
                                  <img
                                    src={item.coverUrl}
                                    alt=""
                                    className="h-16 w-12 shrink-0 rounded-[var(--ui-radius-card)] border border-border object-cover shadow-xs"
                                  />
                                ) : (
                                  <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-[var(--ui-radius-card)] bg-secondary text-muted-foreground">
                                    <BookOpen size={18} />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <h5 className="text-xs font-semibold text-foreground line-clamp-1">
                                      {item.title}
                                    </h5>
                                    <span
                                      className={`inline-flex h-5 items-center whitespace-nowrap rounded-full border px-1.5 text-xs font-medium ${
                                        item.source === "goodreads"
                                          ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                                          : item.source === "fable"
                                          ? "bg-indigo-500/10 text-indigo-500 border-indigo-500/30"
                                          : item.source === "wattpad"
                                          ? "bg-orange-500/10 text-orange-500 border-orange-500/30"
                                          : item.source === "google"
                                          ? "bg-blue-500/10 text-blue-500 border-blue-500/30"
                                          : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                                      }`}
                                    >
                                      {item.source === "goodreads"
                                        ? "Goodreads"
                                        : item.source === "fable"
                                        ? "Fable"
                                        : item.source === "wattpad"
                                        ? "Wattpad"
                                        : item.source === "google"
                                        ? "Google Books"
                                        : "Open Library"}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                                    Tác giả: <strong className="text-foreground">{normalizeAuthor(item.author)}</strong>
                                    {item.publisher ? ` • ${item.publisher}` : ""}
                                    {item.publishedYear ? ` • ${item.publishedYear}` : ""}
                                  </p>
                                  {item.description && (
                                    <p className="mt-1 text-xs text-muted-foreground italic line-clamp-2">
                                      "{item.description}"
                                    </p>
                                  )}
                                </div>
                              </div>

                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => openDiffConfirmation(item)}
                                className="h-7 shrink-0 gap-1 rounded-[var(--ui-radius-button)] px-2.5 text-xs text-primary"
                              >
                                <Check size={12} />
                                <span>Áp Dụng</span>
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: COVER GALLERY */}
              {activeTab === "covers" && (
                <div className="space-y-4">
                  {/* Cover search bar with source mode */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[var(--ui-radius-card)] border border-border bg-card p-3">
                    <div className="flex items-center gap-2 flex-1 max-w-md">
                      <input
                        type="text"
                        placeholder="Tìm ảnh bìa theo tên sách hoặc tác giả..."
                        value={coverSearchQuery}
                        onChange={(e) => setCoverSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearchCovers()}
                        className="h-10 w-full min-w-0 rounded-[var(--ui-radius-card)] border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/25"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleSearchCovers}
                        disabled={isSearchingCovers}
                        className="h-7 shrink-0 gap-1.5 rounded-[var(--ui-radius-button)] px-2.5 text-xs text-primary"
                      >
                        {isSearchingCovers ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Search size={13} />
                        )}
                        <span>{isSearchingCovers ? "Đang quét..." : "Tìm Bìa"}</span>
                      </Button>
                    </div>

                    <div className="flex items-center gap-0.5 rounded-[var(--ui-radius-button)] border border-border bg-secondary p-0.5 text-xs flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setCoverSourceMode("all");
                          handleSearchCovers();
                        }}
                        className={`h-7 whitespace-nowrap rounded-[var(--ui-radius-button)] border px-2.5 font-medium transition-colors ${
                          coverSourceMode === "all" ? "border-border bg-card text-foreground shadow-xs" : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        🌐 Tất Cả Nguồn
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCoverSourceMode("published");
                          handleSearchCovers();
                        }}
                        className={`h-7 whitespace-nowrap rounded-[var(--ui-radius-button)] border px-2.5 font-medium transition-colors ${
                          coverSourceMode === "published" ? "border-border bg-card text-foreground shadow-xs" : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        📚 Sách (Goodreads / Fable)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCoverSourceMode("wattpad");
                          handleSearchCovers();
                        }}
                        className={`h-7 whitespace-nowrap rounded-[var(--ui-radius-button)] border px-2.5 font-medium transition-colors ${
                          coverSourceMode === "wattpad" ? "border-border bg-card text-foreground shadow-xs" : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        📖 Wattpad (HD)
                      </button>
                    </div>
                  </div>

                  {/* Covers Grid */}
                  {coverGallery.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-[var(--ui-radius-card)] border border-dashed border-border p-12 text-center">
                      <ImageIcon size={32} className="text-muted-foreground opacity-40 mb-2" />
                      <p className="text-sm font-semibold text-foreground">Chưa có kết quả ảnh bìa</p>
                      <p className="mt-0.5 max-w-sm text-xs text-muted-foreground">
                        Nhấn "Tìm Bìa" để hệ thống tự động quét kho ảnh bìa chất lượng cao từ Wattpad, Google Books và Open Library.
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleSearchCovers}
                        className="mt-3 h-7 gap-1.5 rounded-[var(--ui-radius-button)] px-2.5 text-xs"
                      >
                        <Search size={12} />
                        <span>Quét ảnh bìa ngay</span>
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                      {coverGallery.map((cov, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleSelectCover(cov)}
                          className="group relative flex aspect-[2/3] cursor-pointer flex-col justify-end overflow-hidden rounded-[var(--ui-radius-card)] border border-border bg-secondary shadow-xs transition-all hover:border-primary hover:shadow-lg"
                        >
                          <img
                            src={cov.url}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent opacity-80 group-hover:opacity-95 transition-opacity" />

                          <div className="relative p-2 text-white">
                            <span className="inline-flex h-5 items-center whitespace-nowrap rounded-full border border-white/20 bg-black/60 px-1.5 text-xs font-medium text-white">
                              {cov.source} {cov.quality === "high" ? "• HD" : ""}
                            </span>
                            <p className="mt-1 text-xs font-medium text-white/90 line-clamp-1">
                              {cov.label}
                            </p>
                            <Button
                              type="button"
                              variant="secondary"
                              className="mt-1 h-7 w-full gap-1 rounded-[var(--ui-radius-button)] px-2 text-xs opacity-0 transition-opacity group-hover:opacity-100"
                            >
                              <Check size={12} />
                              <span>Chọn bìa này</span>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: CUSTOM UPLOAD / URL */}
              {activeTab === "upload" && (
                <div className="space-y-4 max-w-xl">
                  {/* File Upload Box */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 rounded-[var(--ui-radius-card)] border border-dashed border-border p-8 text-center cursor-pointer hover:border-primary hover:bg-accent/10 transition-colors select-none"
                  >
                    <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Upload size={18} />
                    </div>
                    <p className="text-sm font-semibold text-foreground">
                      Chọn file ảnh từ máy tính của bạn
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Hỗ trợ định dạng JPG, PNG, WebP (Khuyến nghị chuẩn tỉ lệ 2:3, tối thiểu 800x1200 px)
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      className="mt-1 h-7 gap-1.5 rounded-[var(--ui-radius-button)] px-2.5 text-xs text-primary"
                    >
                      Duyệt file trên máy
                    </Button>
                  </div>

                  {/* URL Paste Box */}
                  <div className="rounded-[var(--ui-radius-card)] border border-border bg-card p-3 space-y-2">
                    <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <ExternalLink size={14} className="text-primary shrink-0" />
                      <span>Hoặc dán trực tiếp đường dẫn URL ảnh</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="url"
                        placeholder="https://example.com/cover.jpg"
                        value={customImageUrl}
                        onChange={(e) => setCustomImageUrl(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleApplyCustomUrl()}
                        className="h-10 flex-1 min-w-0 rounded-[var(--ui-radius-card)] border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/25"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isFetchingCustomUrl || !customImageUrl.trim()}
                        onClick={handleApplyCustomUrl}
                        className="h-7 shrink-0 gap-1.5 rounded-[var(--ui-radius-button)] px-2.5 text-xs text-primary"
                      >
                        {isFetchingCustomUrl ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Upload size={13} />
                        )}
                        <span>{isFetchingCustomUrl ? "Đang tải..." : "Tải ảnh"}</span>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fixed Footer */}
        <footer className="shrink-0 min-h-14 px-5 py-1 border-t border-border flex items-center justify-between gap-3 bg-[var(--ui-titlebar-surface)]">
          <div className="flex items-center gap-3 text-xs text-muted-foreground min-w-0">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span>Trạng thái:</span>
              <span className="font-medium text-foreground">
                {currentBook ? `${currentBook.chapter_count} chương` : "Bản thảo"}
              </span>
            </div>
            <div className="h-3 w-px bg-border" />
            {saveStatus === "saving" ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                <Loader2 size={12} className="animate-spin text-primary" />
                <span>Đang tự động lưu thay đổi...</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                <Check size={12} />
                <span>Mọi thay đổi đã được tự động lưu</span>
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              className="h-9 rounded-[var(--ui-radius-button)] px-3 text-xs"
            >
              Đóng
            </Button>

            <Button
              type="button"
              onClick={handleSaveAll}
              className="h-9 gap-1.5 rounded-[var(--ui-radius-button)] px-4 text-xs"
            >
              <BookmarkCheck size={14} />
              <span>Hoàn Tất &amp; Lưu</span>
            </Button>
          </div>
        </footer>
      </div>

      {/* DIFF & CONFIRMATION MODAL POPUP */}
      {diffModalData && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="card-surface rounded-[var(--ui-radius-overlay)] w-full max-w-lg p-5 space-y-4 shadow-2xl border border-border">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles size={16} className="text-primary shrink-0" />
                <h3 className="text-sm font-semibold text-foreground">Xác Nhận Áp Dụng Metadata</h3>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setDiffModalData(null)}
                className="size-8 shrink-0 rounded-[var(--ui-radius-button)] text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              Chọn các trường bạn muốn cập nhật vào sách từ dữ liệu đối chiếu mới:
            </p>

            <div className="max-h-72 space-y-2 overflow-y-auto pr-1 text-xs">
              {diffModalData.incoming.title && (
                <label className="flex items-start gap-2.5 rounded-[var(--ui-radius-card)] border border-border bg-secondary p-2 cursor-pointer hover:border-primary transition-colors">
                  <input
                    type="checkbox"
                    checked={diffModalData.fieldsToApply.title}
                    onChange={(e) =>
                      setDiffModalData({
                        ...diffModalData,
                        fieldsToApply: { ...diffModalData.fieldsToApply, title: e.target.checked },
                      })
                    }
                    className="mt-0.5 rounded text-primary"
                  />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-foreground">Tựa đề / Tên truyện:</span>
                    <p className="mt-0.5 text-xs font-medium text-primary">{diffModalData.incoming.title}</p>
                    <span className="text-xs text-muted-foreground">Hiện tại: {title || "Chưa có"}</span>
                  </div>
                </label>
              )}

              {diffModalData.incoming.author && (
                <label className="flex items-start gap-2.5 rounded-[var(--ui-radius-card)] border border-border bg-secondary p-2 cursor-pointer hover:border-primary transition-colors">
                  <input
                    type="checkbox"
                    checked={diffModalData.fieldsToApply.author}
                    onChange={(e) =>
                      setDiffModalData({
                        ...diffModalData,
                        fieldsToApply: { ...diffModalData.fieldsToApply, author: e.target.checked },
                      })
                    }
                    className="mt-0.5 rounded text-primary"
                  />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-foreground">Tác giả:</span>
                    <p className="mt-0.5 text-xs font-medium text-primary">{normalizeAuthor(diffModalData.incoming.author)}</p>
                    <span className="text-xs text-muted-foreground">Hiện tại: {author || "Chưa có"}</span>
                  </div>
                </label>
              )}

              {diffModalData.incoming.publisher && (
                <label className="flex items-start gap-2.5 rounded-[var(--ui-radius-card)] border border-border bg-secondary p-2 cursor-pointer hover:border-primary transition-colors">
                  <input
                    type="checkbox"
                    checked={diffModalData.fieldsToApply.publisher}
                    onChange={(e) =>
                      setDiffModalData({
                        ...diffModalData,
                        fieldsToApply: { ...diffModalData.fieldsToApply, publisher: e.target.checked },
                      })
                    }
                    className="mt-0.5 rounded text-primary"
                  />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-foreground">Nguồn / Nhà xuất bản:</span>
                    <p className="mt-0.5 text-xs font-medium text-primary">{diffModalData.incoming.publisher}</p>
                    <span className="text-xs text-muted-foreground">Hiện tại: {publisher || "Chưa có"}</span>
                  </div>
                </label>
              )}

              {diffModalData.incoming.description && (
                <label className="flex items-start gap-2.5 rounded-[var(--ui-radius-card)] border border-border bg-secondary p-2 cursor-pointer hover:border-primary transition-colors">
                  <input
                    type="checkbox"
                    checked={diffModalData.fieldsToApply.description}
                    onChange={(e) =>
                      setDiffModalData({
                        ...diffModalData,
                        fieldsToApply: { ...diffModalData.fieldsToApply, description: e.target.checked },
                      })
                    }
                    className="mt-0.5 rounded text-primary"
                  />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-foreground">Văn án / Tóm tắt nội dung:</span>
                    <p className="mt-0.5 text-xs italic text-foreground line-clamp-3">
                      "{diffModalData.incoming.description}"
                    </p>
                  </div>
                </label>
              )}

              {diffModalData.incoming.coverUrl && (
                <label className="flex items-start gap-2.5 rounded-[var(--ui-radius-card)] border border-border bg-secondary p-2 cursor-pointer hover:border-primary transition-colors">
                  <input
                    type="checkbox"
                    checked={diffModalData.fieldsToApply.cover}
                    onChange={(e) =>
                      setDiffModalData({
                        ...diffModalData,
                        fieldsToApply: { ...diffModalData.fieldsToApply, cover: e.target.checked },
                      })
                    }
                    className="mt-0.5 rounded text-primary"
                  />
                  <div className="flex items-center gap-3">
                    <img
                      src={diffModalData.incoming.coverUrl}
                      alt=""
                      className="h-14 w-10 rounded-[var(--ui-radius-card)] border border-border object-cover"
                    />
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-foreground">Cập nhật ảnh bìa mới</span>
                      <p className="text-xs text-muted-foreground">Độ nét cao từ ấn bản tìm thấy</p>
                    </div>
                  </div>
                </label>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDiffModalData(null)}
                className="h-9 rounded-[var(--ui-radius-button)] px-3 text-xs"
              >
                Hủy bỏ
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={applyDiffFields}
                className="h-9 gap-1 rounded-[var(--ui-radius-button)] px-3 text-xs text-primary"
              >
                <Check size={12} />
                <span>Áp Dụng Các Mục Đã Chọn</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
