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

      <div className="card-surface rounded-2xl w-full max-w-5xl xl:max-w-6xl h-[92vh] max-h-[880px] flex flex-col overflow-hidden shadow-2xl border border-[var(--border)] transition-all">
        {/* Top Header Bar */}
        <div className="h-14 px-6 border-b border-[var(--border)] flex items-center justify-between bg-[var(--ui-titlebar-surface)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center justify-center text-[var(--primary)]">
              <BookOpen size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm text-[var(--foreground)]">Chỉnh Sửa Metadata &amp; Ảnh Bìa</h2>
                <span className="app-badge app-badge--brand text-[10px]">Đa Nền Tảng &amp; Wattpad</span>
                {saveStatus === "saving" ? (
                  <span className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)] bg-[var(--muted)]/50 px-2 py-0.5 rounded-full border border-[var(--border)] animate-pulse">
                    <Loader2 size={11} className="animate-spin text-[var(--primary)]" />
                    <span>Đang lưu...</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">
                    <Check size={11} />
                    <span>Tự động lưu</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Bổ sung thông tin sách xuất bản, truyện mạng/Wattpad &amp; tìm kiếm ảnh bìa đẹp
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleQuickAutoEnrich}
              disabled={isSearchingOnline}
              className="lg-button lg-button--secondary text-xs h-8 px-3 gap-1.5 font-medium text-[var(--primary)] shadow-2xs"
              title="Tự động tìm kiếm thông tin khớp nhất trên mạng và hiển thị so sánh"
            >
              {isSearchingOnline ? (
                <Loader2 size={13} className="animate-spin text-[var(--primary)]" />
              ) : (
                <Sparkles size={13} />
              )}
              <span>{isSearchingOnline ? "Đang tìm kiếm..." : "⚡ Bổ Sung Nhanh"}</span>
            </button>

            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Body: Left Cover Panel + Right Main Tabbed Area */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Left Column: Cover Panel (Hidden in AI Cover tab so AI Studio has the full spacious width) */}
          {activeTab !== "ai-cover" && (
            <div className="w-full md:w-72 shrink-0 p-5 border-b md:border-b-0 md:border-r border-[var(--border)] bg-[var(--card)]/40 flex flex-col items-center justify-between gap-4 overflow-y-auto">
              <div className="w-full flex flex-col items-center">
                <span className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2.5 self-start">
                  Ảnh bìa tác phẩm
                </span>

                {/* Cover Card Display */}
                <div className="relative group w-44 aspect-[2/3] rounded-xl overflow-hidden border-2 border-[var(--border)] bg-[var(--secondary)] shadow-md flex items-center justify-center">
                  {coverDataUrl ? (
                    <img
                      src={coverDataUrl}
                      alt="Book Cover"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-4 text-center text-[var(--muted-foreground)]">
                      <ImageIcon size={32} className="opacity-40 mb-2" />
                      <span className="text-xs font-medium">Chưa có ảnh bìa</span>
                      <span className="text-[10px] opacity-70 mt-0.5">Nhấn "Tìm ảnh bìa" bên dưới</span>
                    </div>
                  )}

                  {/* Hover overlay actions */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCoverSearchQuery(title);
                        setActiveTab("covers");
                        if (coverGallery.length === 0) handleSearchCovers();
                      }}
                      className="lg-button lg-button--primary text-xs h-7 px-2.5 gap-1 w-full"
                    >
                      <Search size={12} />
                      <span>Đổi ảnh bìa</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("ai-cover")}
                      className="lg-button lg-button--secondary text-xs h-7 px-2.5 gap-1 w-full text-amber-500 font-medium hover:bg-amber-500/10"
                    >
                      <Wand2 size={12} />
                      <span>Tạo bìa AI</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="lg-button lg-button--secondary text-xs h-7 px-2.5 gap-1 w-full"
                    >
                      <Upload size={12} />
                      <span>Tải ảnh lên</span>
                    </button>

                    {coverDataUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setCoverDataUrl(null);
                          performSave({ coverDataUrl: null });
                          toast.success("Đã xóa và tự động lưu ảnh bìa!");
                        }}
                        className="lg-button lg-button--ghost text-xs h-7 px-2.5 gap-1 text-[var(--ui-failure)] w-full hover:bg-red-500/10"
                      >
                        <Trash2 size={12} />
                        <span>Xóa bìa</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Resolution / Status Badge */}
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
                  {coverDataUrl ? (
                    <span className="app-badge app-badge--success text-[10px] gap-1">
                      <Check size={10} />
                      <span>Đã gắn ảnh bìa</span>
                    </span>
                  ) : (
                    <span className="app-badge text-[10px] text-[var(--muted-foreground)]">
                      Tỉ lệ 2:3 chuẩn Ebook
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Cover Buttons */}
              <div className="w-full space-y-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setActiveTab("ai-cover")}
                  className="w-full lg-button lg-button--primary text-xs h-8 px-3 gap-2 font-medium bg-gradient-to-r from-amber-500/15 via-[var(--primary)]/15 to-purple-500/15 hover:from-amber-500/25 hover:to-purple-500/25 border border-amber-500/30 text-[var(--foreground)] shadow-xs"
                >
                  <Wand2 size={13} className="text-amber-500 shrink-0" />
                  <span>✨ Tạo bìa AI độc bản</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCoverSearchQuery(title);
                    setActiveTab("covers");
                    if (coverGallery.length === 0) handleSearchCovers();
                  }}
                  className="w-full lg-button lg-button--secondary text-xs h-8 px-3 gap-2 font-medium"
                >
                  <Search size={13} className="text-[var(--primary)]" />
                  <span>Kho ảnh bìa đẹp</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full lg-button lg-button--ghost text-xs h-8 px-3 gap-2"
                >
                  <Upload size={13} />
                  <span>Tải ảnh từ máy tính</span>
                </button>
              </div>
            </div>
          )}

          {/* Right Column: Tabbed Content */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-[var(--background)] overflow-hidden">
            {/* Clean Single-Line Tab Switcher */}
            <div className="h-12 px-5 border-b border-[var(--border)] flex items-center bg-[var(--card)]/50 shrink-0 min-w-0 overflow-x-auto">
              <div className="flex items-center gap-1 bg-[var(--secondary)] p-1 rounded-xl border border-[var(--border)] shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab("metadata")}
                  className={`flex items-center gap-2 px-3.5 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                    activeTab === "metadata"
                      ? "bg-[var(--card)] text-[var(--primary)] shadow-xs border border-[var(--border)]"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <FileText size={13} />
                  <span>Thông tin tác phẩm</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("ai-cover")}
                  className={`flex items-center gap-2 px-3.5 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                    activeTab === "ai-cover"
                      ? "bg-[var(--card)] text-[var(--primary)] shadow-xs border border-[var(--border)]"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <Wand2 size={13} className="text-amber-500" />
                  <span>✨ Tạo bìa AI</span>
                  <span className="app-badge bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] px-1 py-0">
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
                  className={`flex items-center gap-2 px-3.5 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                    activeTab === "covers"
                      ? "bg-[var(--card)] text-[var(--primary)] shadow-xs border border-[var(--border)]"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <ImageIcon size={13} />
                  <span>Kho ảnh bìa đẹp</span>
                  {coverGallery.length > 0 && (
                    <span className="app-badge bg-[var(--primary)]/10 text-[var(--primary)] text-[10px] px-1.5 py-0">
                      {coverGallery.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("upload")}
                  className={`flex items-center gap-2 px-3.5 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                    activeTab === "upload"
                      ? "bg-[var(--card)] text-[var(--primary)] shadow-xs border border-[var(--border)]"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
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
                  <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--card)]/60 shadow-xs space-y-3 min-w-0">
                    <div className="flex flex-col gap-2.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="text-xs font-bold text-[var(--foreground)] flex items-center gap-1.5 shrink-0">
                          <Compass size={13} className="text-[var(--primary)]" />
                          <span>Nguồn tra cứu:</span>
                        </span>
                        <div className="flex items-center gap-1 bg-[var(--secondary)] p-0.5 rounded-lg border border-[var(--border)] text-[11px] flex-wrap">
                          <button
                            type="button"
                            onClick={() => setSearchSourceMode("all")}
                            className={`px-2.5 py-1 rounded-md transition-all font-medium whitespace-nowrap ${
                              searchSourceMode === "all"
                                ? "bg-[var(--primary)] text-white shadow-2xs"
                                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            }`}
                          >
                            🌐 Đa Nguồn (Goodreads + Wattpad + Fable)
                          </button>
                          <button
                            type="button"
                            onClick={() => setSearchSourceMode("published")}
                            className={`px-2.5 py-1 rounded-md transition-all font-medium whitespace-nowrap ${
                              searchSourceMode === "published"
                                ? "bg-[var(--primary)] text-white shadow-2xs"
                                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            }`}
                          >
                            📚 Sách (Goodreads / Fable / Google)
                          </button>
                          <button
                            type="button"
                            onClick={() => setSearchSourceMode("wattpad")}
                            className={`px-2.5 py-1 rounded-md transition-all font-medium whitespace-nowrap ${
                              searchSourceMode === "wattpad"
                                ? "bg-[var(--primary)] text-white shadow-2xs"
                                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            }`}
                          >
                            📖 Wattpad &amp; Truyện Mạng
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-[var(--border)]/50">
                        <button
                          type="button"
                          onClick={handleSearchOnline}
                          disabled={isSearchingOnline}
                          className="lg-button lg-button--primary text-xs h-8 px-3.5 gap-1.5 font-medium shadow-2xs"
                        >
                          {isSearchingOnline ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Search size={13} />
                          )}
                          <span>{isSearchingOnline ? "Đang tra cứu..." : "Tra cứu trực tuyến"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleAiEnrich}
                          disabled={isAiEnriching}
                          className="lg-button lg-button--secondary text-xs h-8 px-3.5 gap-1.5 text-[var(--primary)] font-medium"
                          title={activeGateway ? `Dùng mô hình ${selectedModel}` : "Chưa kết nối AI Gateway"}
                        >
                          {isAiEnriching ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Wand2 size={13} />
                          )}
                          <span>{isAiEnriching ? "AI đang đọc..." : "AI Tóm tắt & Văn án"}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Title & Author row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                    <div className="space-y-1 min-w-0">
                      <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5 truncate">
                        <BookOpen size={13} className="text-[var(--primary)] shrink-0" />
                        <span>Tựa đề / Tên truyện (Title) *</span>
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Nhập tên truyện hoặc tựa sách..."
                        className="w-full min-w-0 text-xs px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-hidden focus:border-[var(--primary)]"
                      />
                    </div>

                    <div className="space-y-1 min-w-0">
                      <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5 truncate">
                        <Globe size={13} className="text-[var(--primary)] shrink-0" />
                        <span>Tác giả / Dịch giả / Editor (Author)</span>
                      </label>
                      <input
                        type="text"
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        placeholder="Tên tác giả gốc hoặc người dịch..."
                        className="w-full min-w-0 text-xs px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-hidden focus:border-[var(--primary)]"
                      />
                    </div>
                  </div>

                  {/* Genre & Source / Publisher */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                    <div className="space-y-1 min-w-0">
                      <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5 truncate">
                        <Tag size={13} className="text-[var(--muted-foreground)] shrink-0" />
                        <span>Thể loại / Tags (Genre)</span>
                      </label>
                      <input
                        type="text"
                        value={genre}
                        onChange={(e) => setGenre(e.target.value)}
                        placeholder="Ngôn tình, Tiên hiệp, Đam mỹ, Tiểu thuyết, Trinh thám..."
                        className="w-full min-w-0 text-xs px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-hidden focus:border-[var(--primary)]"
                      />
                    </div>

                    <div className="space-y-1 min-w-0">
                      <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5 truncate">
                        <Building2 size={13} className="text-[var(--muted-foreground)] shrink-0" />
                        <span>Nguồn truyện / Nhà xuất bản</span>
                      </label>
                      <input
                        type="text"
                        value={publisher}
                        onChange={(e) => setPublisher(e.target.value)}
                        placeholder="Goodreads, Wattpad, TruyenFull, TangThuVien, NXB Trẻ..."
                        className="w-full min-w-0 text-xs px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-hidden focus:border-[var(--primary)]"
                      />
                    </div>
                  </div>

                  {/* Status / Year, Language & ISBN */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 min-w-0">
                    <div className="space-y-1 min-w-0">
                      <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5 truncate">
                        <Calendar size={13} className="text-[var(--muted-foreground)] shrink-0" />
                        <span>Tình trạng / Năm phát hành</span>
                      </label>
                      <input
                        type="text"
                        value={publishedYear}
                        onChange={(e) => setPublishedYear(e.target.value)}
                        placeholder="Hoàn thành, Đang ra, hoặc 2024..."
                        className="w-full min-w-0 text-xs px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-hidden focus:border-[var(--primary)]"
                      />
                    </div>

                    <div className="space-y-1 min-w-0">
                      <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5 truncate">
                        <Globe size={13} className="text-[var(--muted-foreground)] shrink-0" />
                        <span>Mã ngôn ngữ</span>
                      </label>
                      <input
                        type="text"
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        placeholder="vi, en, zh, ja..."
                        className="w-full min-w-0 text-xs px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-hidden focus:border-[var(--primary)] font-mono"
                      />
                    </div>

                    <div className="space-y-1 min-w-0">
                      <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5 truncate">
                        <Hash size={13} className="text-[var(--muted-foreground)] shrink-0" />
                        <span>Mã ISBN (tùy chọn)</span>
                      </label>
                      <input
                        type="text"
                        value={isbn}
                        onChange={(e) => setIsbn(e.target.value)}
                        placeholder="978-604-..."
                        className="w-full min-w-0 text-xs px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-hidden focus:border-[var(--primary)] font-mono"
                      />
                    </div>
                  </div>

                  {/* Description / Synopsis / Van An */}
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                        <Layers size={13} className="text-[var(--primary)]" />
                        <span>Văn án / Lời giới thiệu &amp; Tóm tắt nội dung</span>
                      </label>
                      <span className="text-[10px] text-[var(--muted-foreground)]">
                        {(description || "").length} ký tự
                      </span>
                    </div>
                    <textarea
                      rows={6}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Nhập văn án tác phẩm hoặc tóm tắt nội dung sách, hoặc nhấn 'AI Tóm tắt & Văn án' để hệ thống tự động bóc tách từ chương đầu..."
                      className="w-full min-w-0 text-xs px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-hidden focus:border-[var(--primary)] leading-relaxed resize-y"
                    />
                  </div>

                  {/* Search Results Drawer if user searched */}
                  {showSearchResults && (
                    <div className="mt-4 p-4 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 space-y-3 animate-in fade-in duration-150 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Search size={14} className="text-[var(--primary)]" />
                          <h4 className="text-xs font-bold text-[var(--foreground)]">
                            Kết Quả Tra Cứu Trực Tuyến ({searchResults.length})
                          </h4>
                          <span className="app-badge app-badge--brand text-[10px]">
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
                          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        >
                          Đóng
                        </button>
                      </div>

                      {searchResults.length === 0 ? (
                        <p className="text-xs text-[var(--muted-foreground)]">
                          Không tìm thấy kết quả nào khớp với "{title}". Hãy thử đổi sang nguồn khác hoặc dùng AI.
                        </p>
                      ) : (
                        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                          {searchResults.map((item) => (
                            <div
                              key={item.id}
                              className="p-3 rounded-lg border border-[var(--border)] bg-[var(--card)] flex items-start justify-between gap-3 hover:border-[var(--primary)] transition-all shadow-2xs min-w-0"
                            >
                              <div className="flex items-start gap-3 min-w-0">
                                {item.coverUrl ? (
                                  <img
                                    src={item.coverUrl}
                                    alt=""
                                    className="w-12 h-16 object-cover rounded shrink-0 border border-[var(--border)] shadow-xs"
                                  />
                                ) : (
                                  <div className="w-12 h-16 bg-[var(--secondary)] rounded shrink-0 flex items-center justify-center text-[var(--muted-foreground)]">
                                    <BookOpen size={18} />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <h5 className="text-xs font-bold text-[var(--foreground)] line-clamp-1">
                                      {item.title}
                                    </h5>
                                    <span
                                      className={`app-badge text-[9px] px-1.5 py-0.5 ${
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
                                  <p className="text-[11px] text-[var(--muted-foreground)] line-clamp-1 mt-0.5">
                                    Tác giả: <strong className="text-[var(--foreground)]">{normalizeAuthor(item.author)}</strong>
                                    {item.publisher ? ` • ${item.publisher}` : ""}
                                    {item.publishedYear ? ` • ${item.publishedYear}` : ""}
                                  </p>
                                  {item.description && (
                                    <p className="text-[11px] text-[var(--muted-foreground)] line-clamp-2 mt-1 italic">
                                      "{item.description}"
                                    </p>
                                  )}
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => openDiffConfirmation(item)}
                                className="lg-button lg-button--primary text-xs h-7 px-3 gap-1 shrink-0"
                              >
                                <Check size={12} />
                                <span>Áp Dụng</span>
                              </button>
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
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-[var(--border)] bg-[var(--card)]/60">
                    <div className="flex items-center gap-2 flex-1 max-w-md">
                      <div className="relative flex-1">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
                        <input
                          type="text"
                          placeholder="Tìm ảnh bìa theo tên sách hoặc tác giả..."
                          value={coverSearchQuery}
                          onChange={(e) => setCoverSearchQuery(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSearchCovers()}
                          className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-hidden focus:border-[var(--primary)]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSearchCovers}
                        disabled={isSearchingCovers}
                        className="lg-button lg-button--primary text-xs h-8 px-3 gap-1.5 font-medium shrink-0"
                      >
                        {isSearchingCovers ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Search size={13} />
                        )}
                        <span>{isSearchingCovers ? "Đang quét..." : "Tìm Bìa"}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1 bg-[var(--secondary)] p-0.5 rounded-lg border border-[var(--border)] text-[11px] flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setCoverSourceMode("all");
                          handleSearchCovers();
                        }}
                        className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                          coverSourceMode === "all" ? "bg-[var(--primary)] text-white shadow-2xs" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
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
                        className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                          coverSourceMode === "published" ? "bg-[var(--primary)] text-white shadow-2xs" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
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
                        className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                          coverSourceMode === "wattpad" ? "bg-[var(--primary)] text-white shadow-2xs" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        }`}
                      >
                        📖 Wattpad (HD)
                      </button>
                    </div>
                  </div>

                  {/* Covers Grid */}
                  {coverGallery.length === 0 ? (
                    <div className="p-12 text-center border-2 border-dashed border-[var(--border)] rounded-xl flex flex-col items-center justify-center">
                      <ImageIcon size={32} className="text-[var(--muted-foreground)] opacity-40 mb-2" />
                      <p className="text-xs font-semibold text-[var(--foreground)]">Chưa có kết quả ảnh bìa</p>
                      <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5 max-w-sm">
                        Nhấn "Tìm Bìa" để hệ thống tự động quét kho ảnh bìa chất lượng cao từ Wattpad, Google Books và Open Library.
                      </p>
                      <button
                        type="button"
                        onClick={handleSearchCovers}
                        className="mt-3 lg-button lg-button--secondary text-xs h-7 px-3 gap-1.5"
                      >
                        <Search size={12} />
                        <span>Quét ảnh bìa ngay</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                      {coverGallery.map((cov, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleSelectCover(cov)}
                          className="group relative aspect-[2/3] rounded-xl overflow-hidden border-2 border-[var(--border)] hover:border-[var(--primary)] bg-[var(--secondary)] cursor-pointer transition-all shadow-xs hover:shadow-lg flex flex-col justify-end"
                        >
                          <img
                            src={cov.url}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent opacity-80 group-hover:opacity-95 transition-opacity" />

                          <div className="relative p-2 text-white">
                            <span className="app-badge bg-black/60 text-[9px] px-1.5 py-0.5 border-white/20">
                              {cov.source} {cov.quality === "high" ? "• HD" : ""}
                            </span>
                            <p className="text-[10px] text-white/90 line-clamp-1 mt-1 font-medium">
                              {cov.label}
                            </p>
                            <button
                              type="button"
                              className="mt-1 w-full lg-button lg-button--primary text-[10px] h-6 py-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Check size={11} />
                              <span>Chọn bìa này</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: CUSTOM UPLOAD / URL */}
              {activeTab === "upload" && (
                <div className="space-y-6 max-w-xl">
                  {/* File Upload Box */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="p-8 border-2 border-dashed border-[var(--border)] rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer hover:border-[var(--primary)] hover:bg-[var(--accent)]/10 transition-all select-none"
                  >
                    <div className="w-12 h-12 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center mb-2 shadow-xs">
                      <Upload size={20} />
                    </div>
                    <p className="text-xs font-bold text-[var(--foreground)]">
                      Chọn file ảnh từ máy tính của bạn
                    </p>
                    <p className="text-[11px] text-[var(--muted-foreground)] mt-1">
                      Hỗ trợ định dạng JPG, PNG, WebP (Khuyến nghị chuẩn tỉ lệ 2:3, tối thiểu 800x1200 px)
                    </p>
                    <button
                      type="button"
                      className="mt-3 lg-button lg-button--primary text-xs h-7 px-3"
                    >
                      Duyệt file trên máy
                    </button>
                  </div>

                  {/* URL Paste Box */}
                  <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-2">
                    <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                      <ExternalLink size={13} className="text-[var(--primary)]" />
                      <span>Hoặc dán trực tiếp đường dẫn URL ảnh</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="url"
                        placeholder="https://example.com/cover.jpg"
                        value={customImageUrl}
                        onChange={(e) => setCustomImageUrl(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleApplyCustomUrl()}
                        className="flex-1 text-xs px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-hidden focus:border-[var(--primary)]"
                      />
                      <button
                        type="button"
                        disabled={isFetchingCustomUrl || !customImageUrl.trim()}
                        onClick={handleApplyCustomUrl}
                        className="lg-button lg-button--secondary text-xs h-8 px-3 shrink-0 gap-1.5 font-medium"
                      >
                        {isFetchingCustomUrl ? (
                          <Loader2 size={13} className="animate-spin text-[var(--primary)]" />
                        ) : (
                          <Upload size={13} />
                        )}
                        <span>{isFetchingCustomUrl ? "Đang tải..." : "Tải ảnh"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Bottom Footer Actions */}
            <div className="h-14 px-6 border-t border-[var(--border)] flex items-center justify-between bg-[var(--ui-titlebar-surface)] shrink-0">
              <div className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span>Trạng thái:</span>
                  <span className="text-[var(--foreground)] font-medium">
                    {currentBook ? `${currentBook.chapter_count} chương` : "Bản thảo"}
                  </span>
                </div>
                <div className="h-3 w-px bg-[var(--border)]" />
                {saveStatus === "saving" ? (
                  <span className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                    <Loader2 size={12} className="animate-spin text-[var(--primary)]" />
                    <span>Đang tự động lưu thay đổi...</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    <Check size={12} />
                    <span>Mọi thay đổi đã được tự động lưu</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="lg-button lg-button--ghost text-xs h-8 px-3"
                >
                  Đóng
                </button>

                <button
                  type="button"
                  onClick={handleSaveAll}
                  className="lg-button lg-button--primary text-xs h-8 px-4 gap-1.5 font-medium shadow-xs"
                >
                  <BookmarkCheck size={14} />
                  <span>Hoàn Tất &amp; Lưu</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DIFF & CONFIRMATION MODAL POPUP */}
      {diffModalData && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="card-surface rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl border border-[var(--border)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-[var(--primary)]" />
                <h3 className="text-sm font-bold text-[var(--foreground)]">Xác Nhận Áp Dụng Metadata</h3>
              </div>
              <button
                type="button"
                onClick={() => setDiffModalData(null)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X size={15} />
              </button>
            </div>

            <p className="text-xs text-[var(--muted-foreground)]">
              Chọn các trường bạn muốn cập nhật vào sách từ dữ liệu đối chiếu mới:
            </p>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1 text-xs">
              {diffModalData.incoming.title && (
                <label className="flex items-start gap-2.5 p-2 rounded-lg border border-[var(--border)] bg-[var(--secondary)] cursor-pointer hover:border-[var(--primary)]">
                  <input
                    type="checkbox"
                    checked={diffModalData.fieldsToApply.title}
                    onChange={(e) =>
                      setDiffModalData({
                        ...diffModalData,
                        fieldsToApply: { ...diffModalData.fieldsToApply, title: e.target.checked },
                      })
                    }
                    className="mt-0.5 rounded text-[var(--primary)]"
                  />
                  <div>
                    <span className="font-semibold text-[var(--foreground)]">Tựa đề / Tên truyện:</span>
                    <p className="text-[var(--primary)] font-medium mt-0.5">{diffModalData.incoming.title}</p>
                    <span className="text-[10px] text-[var(--muted-foreground)]">Hiện tại: {title || "Chưa có"}</span>
                  </div>
                </label>
              )}

              {diffModalData.incoming.author && (
                <label className="flex items-start gap-2.5 p-2 rounded-lg border border-[var(--border)] bg-[var(--secondary)] cursor-pointer hover:border-[var(--primary)]">
                  <input
                    type="checkbox"
                    checked={diffModalData.fieldsToApply.author}
                    onChange={(e) =>
                      setDiffModalData({
                        ...diffModalData,
                        fieldsToApply: { ...diffModalData.fieldsToApply, author: e.target.checked },
                      })
                    }
                    className="mt-0.5 rounded text-[var(--primary)]"
                  />
                  <div>
                    <span className="font-semibold text-[var(--foreground)]">Tác giả:</span>
                    <p className="text-[var(--primary)] font-medium mt-0.5">{normalizeAuthor(diffModalData.incoming.author)}</p>
                    <span className="text-[10px] text-[var(--muted-foreground)]">Hiện tại: {author || "Chưa có"}</span>
                  </div>
                </label>
              )}

              {diffModalData.incoming.publisher && (
                <label className="flex items-start gap-2.5 p-2 rounded-lg border border-[var(--border)] bg-[var(--secondary)] cursor-pointer hover:border-[var(--primary)]">
                  <input
                    type="checkbox"
                    checked={diffModalData.fieldsToApply.publisher}
                    onChange={(e) =>
                      setDiffModalData({
                        ...diffModalData,
                        fieldsToApply: { ...diffModalData.fieldsToApply, publisher: e.target.checked },
                      })
                    }
                    className="mt-0.5 rounded text-[var(--primary)]"
                  />
                  <div>
                    <span className="font-semibold text-[var(--foreground)]">Nguồn / Nhà xuất bản:</span>
                    <p className="text-[var(--primary)] font-medium mt-0.5">{diffModalData.incoming.publisher}</p>
                    <span className="text-[10px] text-[var(--muted-foreground)]">Hiện tại: {publisher || "Chưa có"}</span>
                  </div>
                </label>
              )}

              {diffModalData.incoming.description && (
                <label className="flex items-start gap-2.5 p-2 rounded-lg border border-[var(--border)] bg-[var(--secondary)] cursor-pointer hover:border-[var(--primary)]">
                  <input
                    type="checkbox"
                    checked={diffModalData.fieldsToApply.description}
                    onChange={(e) =>
                      setDiffModalData({
                        ...diffModalData,
                        fieldsToApply: { ...diffModalData.fieldsToApply, description: e.target.checked },
                      })
                    }
                    className="mt-0.5 rounded text-[var(--primary)]"
                  />
                  <div>
                    <span className="font-semibold text-[var(--foreground)]">Văn án / Tóm tắt nội dung:</span>
                    <p className="text-[11px] text-[var(--foreground)] line-clamp-3 mt-0.5 italic">
                      "{diffModalData.incoming.description}"
                    </p>
                  </div>
                </label>
              )}

              {diffModalData.incoming.coverUrl && (
                <label className="flex items-start gap-2.5 p-2 rounded-lg border border-[var(--border)] bg-[var(--secondary)] cursor-pointer hover:border-[var(--primary)]">
                  <input
                    type="checkbox"
                    checked={diffModalData.fieldsToApply.cover}
                    onChange={(e) =>
                      setDiffModalData({
                        ...diffModalData,
                        fieldsToApply: { ...diffModalData.fieldsToApply, cover: e.target.checked },
                      })
                    }
                    className="mt-0.5 rounded text-[var(--primary)]"
                  />
                  <div className="flex items-center gap-3">
                    <img
                      src={diffModalData.incoming.coverUrl}
                      alt=""
                      className="w-10 h-14 object-cover rounded border border-[var(--border)]"
                    />
                    <div>
                      <span className="font-semibold text-[var(--foreground)]">Cập nhật ảnh bìa mới</span>
                      <p className="text-[10px] text-[var(--muted-foreground)]">Độ nét cao từ ấn bản tìm thấy</p>
                    </div>
                  </div>
                </label>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setDiffModalData(null)}
                className="lg-button lg-button--ghost text-xs h-7 px-3"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={applyDiffFields}
                className="lg-button lg-button--primary text-xs h-7 px-3 gap-1 font-medium"
              >
                <Check size={12} />
                <span>Áp Dụng Các Mục Đã Chọn</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
