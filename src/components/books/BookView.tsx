import { 
  BookOpen, 
  User, 
  Globe, 
  HardDrive, 
  Sparkles, 
  ChevronRight, 
  Palette,
  FileText,
  Percent
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import { BookDropzone } from "./BookDropzone";

export function BookView() {
  const { 
    currentBook, 
    jevDecision, 
    isAnalyzingJev, 
    runJevClassification, 
    setActiveTab,
    activeChapterIndex,
    setActiveChapterIndex
  } = useAppStore();

  if (!currentBook) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <BookDropzone />
      </div>
    );
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto select-none max-w-5xl mx-auto w-full">
      {/* Top Banner: Book Meta Card */}
      <div className="p-6 rounded-2xl bg-[#141418] border border-[#27272a] shadow-xl flex gap-6 items-start">
        {/* Cover Image */}
        <div className="w-32 h-44 rounded-xl overflow-hidden bg-[#1f1f24] border border-[#2e2e36] flex-shrink-0 shadow-lg flex items-center justify-center">
          {currentBook.cover_data_url ? (
            <img 
              src={currentBook.cover_data_url} 
              alt={currentBook.title}
              className="w-full h-full object-cover" 
            />
          ) : (
            <BookOpen className="w-10 h-10 text-[#52525b]" />
          )}
        </div>

        {/* Book Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-zinc-100 tracking-tight mb-1 truncate">
                {currentBook.title}
              </h2>
              <div className="flex items-center gap-4 text-xs text-[#a1a1aa] mb-4">
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-zinc-500" />
                  <span>{currentBook.author}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="uppercase font-mono">{currentBook.language}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-zinc-500" />
                  <span>{formatFileSize(currentBook.file_size_bytes)}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-zinc-500" />
                  <span>{currentBook.chapter_count} chương</span>
                </span>
              </div>
            </div>

            <button
              onClick={() => setActiveTab("presets")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all flex-shrink-0"
            >
              <Palette className="w-4 h-4" />
              <span>Chọn Phong Cách</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {currentBook.description && (
            <p className="text-xs text-[#82828e] line-clamp-3 leading-relaxed bg-[#101013] p-3 rounded-lg border border-[#222228] mb-3">
              {currentBook.description}
            </p>
          )}

          {/* Jev Core Status Card */}
          {jevDecision ? (
            <div className="mt-2 p-3.5 rounded-xl bg-gradient-to-r from-purple-950/30 via-indigo-950/20 to-transparent border border-purple-500/25 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-100">
                      Jev Nhận Diện: {jevDecision.genre_label}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono font-medium">
                      {(jevDecision.confidence * 100).toFixed(0)}% Tin cậy
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono flex items-center gap-1">
                      <Percent className="w-2.5 h-2.5" />
                      <span>Thoại {(jevDecision.dialogue_ratio * 100).toFixed(0)}%</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-[#a1a1aa] mt-0.5">{jevDecision.explanation}</p>
                </div>
              </div>

              <button
                onClick={runJevClassification}
                disabled={isAnalyzingJev}
                className="text-[11px] font-medium text-purple-400 hover:text-purple-300 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 transition-colors"
              >
                {isAnalyzingJev ? "Đang tính toán..." : "Phân tích lại"}
              </button>
            </div>
          ) : (
            <div className="mt-2 p-3 rounded-xl bg-[#18181c] border border-[#27272a] flex items-center justify-between">
              <span className="text-xs text-[#71717a]">Chưa chạy nhận diện phong cách Jev Core</span>
              <button
                onClick={runJevClassification}
                disabled={isAnalyzingJev}
                className="text-xs font-medium text-indigo-400 hover:underline"
              >
                Kích hoạt phân tích ngay
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Chapters Overview List */}
      <div className="mt-6 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-200">Danh Sách Chương ({currentBook.chapters.length})</h3>
          <span className="text-xs text-[#71717a]">Bấm để đọc thử trích đoạn</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
          {currentBook.chapters.map((ch, idx) => {
            const isSelected = activeChapterIndex === idx;
            return (
              <div
                key={ch.id}
                onClick={() => setActiveChapterIndex(idx)}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? "bg-indigo-950/20 border-indigo-500/50 shadow-sm shadow-indigo-500/10"
                    : "bg-[#141418] hover:bg-[#18181e] border-[#27272a]/70"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-medium truncate ${isSelected ? "text-indigo-300 font-semibold" : "text-zinc-200"}`}>
                    {ch.title}
                  </span>
                  <span className="text-[10px] font-mono text-[#52525b]">#{idx + 1}</span>
                </div>
                <p className="text-[11px] text-[#71717a] line-clamp-2 leading-relaxed">
                  {ch.preview_text || "Không có văn bản xem trước..."}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
