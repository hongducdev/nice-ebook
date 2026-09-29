import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { STYLE_PRESETS, StylePreset } from "../presets/styles";
import { AiService } from "../services/aiService";
import { detectIsVietnameseBook } from "../utils/vietnameseHelper";
import { cleanChapterHtmlWatermarks } from "../utils/watermarkCleaner";
import { saveChaptersToDb, loadChaptersFromDb, deleteChaptersFromDb } from "../utils/chapterStorage";
import { generateEpubCss } from "../utils/cssGenerator";
import { injectWordWiseRuby, stripWordWiseRuby } from "../services/kindle/wordWiseService";
import { extractXRayHeuristic, generateXRayAppendixHtml, XRayBookData, ChapterTextSource } from "../services/kindle/xrayService";
import { TranslationService } from "../services/translation/translationService";
import { TranslationTone } from "../services/prompts/bookTranslator";
import { LanguageDetector, LanguageDetectionResult } from "../utils/languageDetector";
import { EntityExtractor, ExtractedEntityCandidate } from "../services/translation/entityExtractor";
import { BookResearchService } from "../services/translation/bookResearchService";

export interface ChapterItem {
  id: string;
  href: string;
  title: string;
  preview_text: string;
}

export interface EpubMetadata {
  title: string;
  author: string;
  language: string;
  description: string | null;
  cover_data_url: string | null;
  chapter_count: number;
  file_size_bytes: number;
  chapters: ChapterItem[];
  sample_text: string;
  publisher?: string;
  published_year?: string;
  isbn?: string;
  genre?: string;
}

export interface PaletteInfo {
  name: string;
  bg_color: string;
  text_color: string;
  accent_color: string;
  border_color: string;
  font_family: string;
}

export interface TypographySettings {
  drop_caps: boolean;
  first_line_indent: string;
  line_height: number;
  scene_divider: string;
  palette: PaletteInfo;
}

export interface JevDecision {
  genre: string;
  genre_label: string;
  confidence: number;
  dialogue_ratio: number;
  recommended_preset: string;
  typography: TypographySettings;
  explanation: string;
  is_vietnamese?: boolean;
}

export interface DetectedGateway {
  name: string;
  base_url: string;
  port: number;
  is_online: boolean;
  models: string[];
  gateway_type: string;
  latency_ms: number;
}

export interface EbookProject {
  id: string;
  name: string;
  author?: string;
  publisher?: string;
  publishedYear?: string;
  isbn?: string;
  genre?: string;
  description?: string | null;
  filePath: string | null;
  coverDataUrl: string | null;
  chapterCount: number;
  fileSizeBytes: number;
  activePresetId: string;
  customCss: string;
  fontFamily: string;
  fontSize: number;
  textAlign: "justify" | "left";
  dropCaps: boolean;
  lineHeight: number;
  firstLineIndent: string;
  sceneDivider: string;
  modifiedChapters: Record<string, string>;
  chapterEnhanceReports: Record<string, ChapterEnhanceReport>;
  createdAt: number;
  lastOpenedAt: number;
}

export interface TerminalLogEntry {
  id: string;
  timestamp: number;
  type: "info" | "warning" | "success" | "detail";
  text: string;
}

export interface ChapterEnhanceReport {
  chapterHref: string;
  chapterTitle: string;
  canonicalH1?: string;
  cleanedTopIndices: number[];
  headingsCount: number;
  typosFixedCount: number;
  timestamp: number;
}

export interface EnhanceFeaturesConfig {
  standardizeH1?: boolean;
  cleanTopJunk?: boolean;
  addHeadings?: boolean;
  fixVietnameseTypos?: boolean;
}

export interface EnhanceExecutionOptions {
  skipAlreadyEnhanced?: boolean;
  forceReprocess?: boolean;
}

export interface TranslationConfig {
  sourceLang: string;
  targetLang: string;
  mode: "replace" | "bilingual";
  tone: TranslationTone;
  glossary: Record<string, string>;
  maxBlocksPerChunk: number;
  researchBrief?: string;
  useResearchBrief?: boolean;
}

export interface TranslationProgress {
  currentChapterIndex: number;
  totalChapters: number;
  currentChapterHref: string;
  currentChapterTitle: string;
  currentBlock: number;
  totalBlocks: number;
  percent: number;
}

export interface AppState {
  // Navigation
  activeTab: "books" | "presets" | "editor" | "reader" | "ai" | "settings" | "ai-editor" | "converter" | "kindle" | "translator";
  setActiveTab: (tab: "books" | "presets" | "editor" | "reader" | "ai" | "settings" | "ai-editor" | "converter" | "kindle" | "translator") => void;

  // Pending file for Ebook Converter
  pendingConverterFile: { name: string; bytes: Uint8Array; type: "pdf" | "txt" | "md" } | null;
  setPendingConverterFile: (file: { name: string; bytes: Uint8Array; type: "pdf" | "txt" | "md" } | null) => void;

  // Theme & Shell State
  theme: "dark" | "light" | "system";
  setTheme: (theme: "dark" | "light" | "system") => void;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Book State
  currentBook: EpubMetadata | null;
  currentFilePath: string | null;
  currentFileBytes: number[] | null;
  isLoadingBook: boolean;
  isDraggingFile: boolean;
  setIsDraggingFile: (isDragging: boolean) => void;
  isVietnameseBook: boolean;
  activeChapterIndex: number;
  setActiveChapterIndex: (idx: number) => void;

  // Jev Core State
  jevDecision: JevDecision | null;
  isAnalyzingJev: boolean;

  // AI Gateways State
  gateways: DetectedGateway[];
  isScanningGateways: boolean;
  activeGateway: DetectedGateway | null;
  selectedModel: string | null;
  isAiGenerating: boolean;
  aiEngineMode: "hybrid" | "jev-verdict" | "gateway";
  setAiEngineMode: (mode: "hybrid" | "jev-verdict" | "gateway") => void;
  fallbackModels: string[];
  setFallbackModels: (models: string[]) => void;
  isFallbackEnabled: boolean;
  setIsFallbackEnabled: (enabled: boolean) => void;
  modelTestResults: Record<string, { success: boolean; latencyMs: number; message: string }>;
  testModel: (modelName: string) => Promise<{ success: boolean; latencyMs: number; message: string }>;
  validateAndFilterFallbackModels: (candidates?: string[]) => Promise<string[]>;

  // Active Styling State
  activePresetId: string;
  activePreset: StylePreset;
  customCss: string;
  fontSize: number;
  textAlign: "justify" | "left";
  dropCaps: boolean;
  lineHeight: number;
  firstLineIndent: string;
  sceneDivider: string;
  fontFamily: string;
  setFontFamily: (font: string) => void;

  // Actions
  loadBookFromPath: (filePath: string) => Promise<boolean>;
  loadBookFromBytes: (bytes: number[]) => Promise<boolean>;
  updateBookMetadata: (updates: {
    title?: string;
    author?: string;
    language?: string;
    description?: string | null;
    cover_data_url?: string | null;
    publisher?: string;
    published_year?: string;
    isbn?: string;
    genre?: string;
  }) => void;
  runJevClassification: () => Promise<void>;
  scanGateways: () => Promise<void>;
  selectPreset: (presetId: string) => void;
  runAiDeepStyling: () => Promise<boolean>;
  updateTypography: (settings: {
    fontSize?: number;
    textAlign?: "justify" | "left";
    dropCaps?: boolean;
    lineHeight?: number;
    firstLineIndent?: string;
    sceneDivider?: string;
    customCss?: string;
    fontFamily?: string;
  }) => void;
  selectGateway: (gw: DetectedGateway | null) => void;
  setSelectedModel: (model: string | null) => void;

  // AI Chapter Enhancement
  modifiedChapters: Record<string, string>;
  chapterEnhanceReports: Record<string, ChapterEnhanceReport>;
  isBatchEnhancing: boolean;
  enhanceProgress: { current: number; total: number; currentChapterHref: string } | null;
  terminalLogs: TerminalLogEntry[];
  addTerminalLog: (log: { type: "info" | "warning" | "success" | "detail"; text: string }) => void;
  clearTerminalLogs: () => void;
  resetChapterOverrides: () => void;
  enhanceSingleChapter: (chapterIndex: number, features?: EnhanceFeaturesConfig, options?: EnhanceExecutionOptions) => Promise<boolean>;
  batchEnhanceChapters: (chapterIndices?: number[], features?: EnhanceFeaturesConfig, options?: EnhanceExecutionOptions) => Promise<boolean>;
  stopBatchEnhance: () => void;
  cleanWatermarksInBook: (customKeywords?: string[]) => Promise<{ affectedChapters: number; removedCount: number; savedToFile?: boolean }>;

  // Projects Library State & Actions
  projects: EbookProject[];
  activeProjectId: string | null;
  createProject: (meta: EpubMetadata, source: { filePath?: string | null }) => string;
  openProject: (projectId: string) => Promise<boolean>;
  deleteProject: (projectId: string) => void;
  saveActiveProject: () => void;
  closeActiveProject: () => void;

  // Kindle Companion State & Actions
  wordWiseSettings: {
    maxDifficulty: 1 | 2 | 3 | 4 | 5;
    language: "vi" | "en";
    maxOccurrencesPerWord: number;
  };
  setWordWiseSettings: (settings: Partial<AppState["wordWiseSettings"]>) => void;
  xrayData: XRayBookData | null;
  setXRayData: (data: XRayBookData | null) => void;
  isAnalyzingXRay: boolean;
  runXRayExtraction: () => Promise<XRayBookData | null>;
  applyWordWiseToBook: () => Promise<number>;
  removeWordWiseFromBook: () => Promise<number>;
  embedXRayAppendixToBook: () => Promise<boolean>;

  // Book Translation State & Actions
  translationConfig: TranslationConfig;
  setTranslationConfig: (config: Partial<TranslationConfig>) => void;
  translationProgress: TranslationProgress | null;
  isTranslating: boolean;
  translateSingleChapter: (chapterIndex: number) => Promise<boolean>;
  batchTranslateChapters: (chapterIndices?: number[], skipAlreadyTranslated?: boolean) => Promise<boolean>;
  stopTranslation: () => void;
  resetChapterTranslation: (chapterHref: string) => void;
  autoDetectSourceLanguage: () => LanguageDetectionResult | null;
  isExtractingEntities: boolean;
  extractedCandidates: ExtractedEntityCandidate[];
  extractBookEntities: () => Promise<ExtractedEntityCandidate[]>;
  applyApprovedEntitiesToGlossary: (approved: Array<{ name: string; translation: string }>) => void;
  isGeneratingResearchBrief: boolean;
  generateBookResearchBrief: () => Promise<string>;
}

const initialTheme = (typeof window !== "undefined" && (window.localStorage.getItem("lg-theme-mode") as "dark" | "light" | "system")) || "dark";
const initialSidebarCollapsed = typeof window !== "undefined" && window.localStorage.getItem("lg-sidebar-collapsed") === "true";

const PROJECTS_STORAGE_KEY = "nice-ebook-projects-v1";

function loadProjectsFromStorage(): EbookProject[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn("Could not load projects from localStorage:", err);
    return [];
  }
}

function saveProjectsToStorage(projects: EbookProject[]) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const safeList = projects.map((p) => ({
      ...p,
      // Cap coverDataUrl to 100KB to avoid localStorage QuotaExceededError
      coverDataUrl: p.coverDataUrl && p.coverDataUrl.length > 100_000 ? null : p.coverDataUrl,
    }));
    window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(safeList));
  } catch (err) {
    console.warn("Storage quota warning when saving projects list, stripping covers:", err);
    try {
      // Strip all covers and retry to ensure critical metadata & edits are saved
      const stripped = projects.map((p) => ({ ...p, coverDataUrl: null }));
      window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(stripped));
    } catch (stripErr) {
      console.warn("Failed to persist project registry even without covers:", stripErr);
    }
  }
}

function applyThemeMode(theme: "dark" | "light" | "system") {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const isDark =
    theme === "dark" ||
    (theme === "system" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (isDark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

// Initial theme execution
applyThemeMode(initialTheme);

let translationAbortController: AbortController | null = null;

const defaultTranslationConfig: TranslationConfig = {
  sourceLang: "Tiếng Anh (English)",
  targetLang: "Tiếng Việt (Vietnamese)",
  mode: "replace",
  tone: "literary",
  glossary: {},
  maxBlocksPerChunk: 12,
  researchBrief: "",
  useResearchBrief: true,
};

export const useAppStore = create<AppState>((set, get) => ({
  activeTab: "books",
  setActiveTab: (tab) => set({ activeTab: tab }),

  pendingConverterFile: null,
  setPendingConverterFile: (file) => set({ pendingConverterFile: file }),

  theme: initialTheme,
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("lg-theme-mode", theme);
    }
    applyThemeMode(theme);
    set({ theme });
  },

  isSidebarCollapsed: initialSidebarCollapsed,
  toggleSidebar: () => {
    const next = !get().isSidebarCollapsed;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("lg-sidebar-collapsed", String(next));
    }
    set({ isSidebarCollapsed: next });
  },
  setSidebarCollapsed: (collapsed) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("lg-sidebar-collapsed", String(collapsed));
    }
    set({ isSidebarCollapsed: collapsed });
  },

  currentBook: null,
  currentFilePath: null,
  currentFileBytes: null,
  isLoadingBook: false,
  isDraggingFile: false,
  setIsDraggingFile: (isDragging) => set({ isDraggingFile: isDragging }),
  isVietnameseBook: false,
  activeChapterIndex: 0,
  setActiveChapterIndex: (idx) => set({ activeChapterIndex: idx }),

  jevDecision: null,
  isAnalyzingJev: false,

  gateways: [],
  isScanningGateways: false,
  activeGateway: null,
  selectedModel: null,
  isAiGenerating: false,
  aiEngineMode: "hybrid",
  setAiEngineMode: (mode) => set({ aiEngineMode: mode }),
  fallbackModels: ["gemini-2.0-flash", "claude-3-5-haiku", "opencode/mimo-v2.6-flash-free", "jev-verdict-2.0"],
  setFallbackModels: (models) => set({ fallbackModels: models }),
  isFallbackEnabled: true,
  setIsFallbackEnabled: (enabled) => set({ isFallbackEnabled: enabled }),
  modelTestResults: {},

  activePresetId: "classic-hardcover",
  activePreset: STYLE_PRESETS.find((p) => p.id === "classic-hardcover") || STYLE_PRESETS[0],
  customCss: (STYLE_PRESETS.find((p) => p.id === "classic-hardcover") || STYLE_PRESETS[0]).cssTemplate,
  fontSize: 16,
  textAlign: "justify",
  dropCaps: true,
  lineHeight: 1.75,
  firstLineIndent: "2em",
  sceneDivider: "♦ ♦ ♦",
  fontFamily: (STYLE_PRESETS.find((p) => p.id === "classic-hardcover") || STYLE_PRESETS[0]).vietnameseFontFamily || (STYLE_PRESETS.find((p) => p.id === "classic-hardcover") || STYLE_PRESETS[0]).fontFamily,
  setFontFamily: (font) => set({ fontFamily: font }),

  // Kindle Companion Initial State
  wordWiseSettings: {
    maxDifficulty: 3,
    language: "vi",
    maxOccurrencesPerWord: 3,
  },
  setWordWiseSettings: (settings) =>
    set((state) => ({
      wordWiseSettings: { ...state.wordWiseSettings, ...settings },
    })),
  xrayData: null,
  setXRayData: (data) => set({ xrayData: data }),
  isAnalyzingXRay: false,

  loadBookFromPath: async (filePath: string) => {
    get().stopBatchEnhance();
    
    // Check if a project with this file path already exists in library
    const existing = get().projects.find((p) => p.filePath === filePath);
    if (existing) {
      return await get().openProject(existing.id);
    }

    set({ isLoadingBook: true });
    try {
      const meta = await invoke<EpubMetadata>("read_epub", { path: filePath });
      const isVi = detectIsVietnameseBook(meta);
      const chosenFont = isVi
        ? get().activePreset.vietnameseFontFamily || get().activePreset.fontFamily
        : get().activePreset.fontFamily;

      const newProjectId = get().createProject(meta, { filePath });

      set({
        currentBook: meta,
        currentFilePath: filePath,
        currentFileBytes: null,
        isVietnameseBook: isVi,
        fontFamily: chosenFont,
        isLoadingBook: false,
        activeChapterIndex: 0,
        modifiedChapters: {},
        chapterEnhanceReports: {},
        activeProjectId: newProjectId,
      });

      // Auto trigger Jev Core on loaded book sample text
      if (meta.sample_text && meta.sample_text.length > 50) {
        get().runJevClassification();
      }
      return true;
    } catch (err) {
      console.error("Failed to load EPUB:", err);
      set({ isLoadingBook: false });
      return false;
    }
  },

  loadBookFromBytes: async (bytes: number[]) => {
    get().stopBatchEnhance();
    set({ isLoadingBook: true });
    try {
      const meta = await invoke<EpubMetadata>("read_epub_bytes", { bytes });
      const isVi = detectIsVietnameseBook(meta);
      const chosenFont = isVi
        ? get().activePreset.vietnameseFontFamily || get().activePreset.fontFamily
        : get().activePreset.fontFamily;

      const newProjectId = get().createProject(meta, { filePath: null });

      set({
        currentBook: meta,
        currentFilePath: null,
        currentFileBytes: bytes,
        isVietnameseBook: isVi,
        fontFamily: chosenFont,
        isLoadingBook: false,
        activeChapterIndex: 0,
        modifiedChapters: {},
        chapterEnhanceReports: {},
        activeProjectId: newProjectId,
      });

      // Auto trigger Jev Core on loaded book
      if (meta.sample_text && meta.sample_text.length > 50) {
        get().runJevClassification();
      }
      return true;
    } catch (err) {
      console.error("Failed to load EPUB bytes:", err);
      set({ isLoadingBook: false });
      return false;
    }
  },

  runJevClassification: async () => {
    const book = get().currentBook;
    if (!book || !book.sample_text) return;

    set({ isAnalyzingJev: true });
    try {
      const decision = await invoke<JevDecision>("classify_text_jev", {
        text: book.sample_text,
      });

      set({
        jevDecision: decision,
        isAnalyzingJev: false,
      });

      // Apply recommended preset automatically
      if (decision.recommended_preset) {
        get().selectPreset(decision.recommended_preset);
      }
    } catch (err) {
      console.error("Jev Core error:", err);
      set({ isAnalyzingJev: false });
    }
  },

  scanGateways: async () => {
    set({ isScanningGateways: true });
    try {
      const list = await invoke<DetectedGateway[]>("scan_ai_gateways");
      const onlineList = list.filter((g) => g.is_online);
      set({
        gateways: list,
        isScanningGateways: false,
        activeGateway: onlineList.length > 0 ? onlineList[0] : null,
        selectedModel: onlineList.length > 0 && onlineList[0].models.length > 0 ? onlineList[0].models[0] : null,
      });
    } catch (err) {
      console.error("Failed to scan gateways:", err);
      set({ isScanningGateways: false });
    }
  },

  selectPreset: (presetId: string) => {
    const preset = STYLE_PRESETS.find((p) => p.id === presetId) || STYLE_PRESETS[0];
    const isVi = get().isVietnameseBook;
    const font = isVi && preset.vietnameseFontFamily ? preset.vietnameseFontFamily : preset.fontFamily;
    set({
      activePresetId: preset.id,
      activePreset: preset,
      fontFamily: font,
      customCss: preset.cssTemplate,
      lineHeight: preset.lineHeight,
      firstLineIndent: preset.firstLineIndent,
      dropCaps: preset.dropCaps,
      sceneDivider: preset.sceneDivider,
    });
  },

  runAiDeepStyling: async () => {
    const { currentBook, activeGateway, selectedModel, jevDecision } = get();
    if (!currentBook || !currentBook.sample_text) {
      return false;
    }

    set({ isAiGenerating: true });
    try {
      const baseUrl = activeGateway ? activeGateway.base_url : "http://127.0.0.1:20128/v1";
      const model = selectedModel || "claude-3-5-sonnet";

      const { result, source } = await AiService.generateStyling({
        baseUrl,
        model,
        title: currentBook.title,
        author: currentBook.author,
        sampleText: currentBook.sample_text,
        jevGenreHint: jevDecision?.genre_label,
      });

      // Construct dynamic custom preset from AI output
      const dynamicPreset: StylePreset = {
        id: "ai-generated-custom",
        name: result.theme_name,
        genre: "ai-custom",
        genreLabel: "AI Độc Bản",
        description: result.genre_analysis,
        fontFamily: result.typography.font_family,
        lineHeight: result.typography.line_height,
        firstLineIndent: result.typography.first_line_indent,
        dropCaps: result.typography.drop_caps,
        sceneDivider: result.typography.scene_divider,
        colors: {
          bg: result.colors.bg,
          text: result.colors.text,
          accent: result.colors.accent,
          border: result.colors.border,
          cardBg: result.colors.cardBg || "#1c1c22",
        },
        cssTemplate: result.custom_css || "",
      };

      set({
        activePresetId: "ai-generated-custom",
        activePreset: dynamicPreset,
        customCss: result.custom_css,
        fontFamily: result.typography.font_family,
        lineHeight: result.typography.line_height,
        firstLineIndent: result.typography.first_line_indent,
        dropCaps: result.typography.drop_caps,
        sceneDivider: result.typography.scene_divider,
        isAiGenerating: false,
      });

      return source === "gateway";
    } catch (err) {
      console.error("Failed to run AI deep styling:", err);
      set({ isAiGenerating: false });
      return false;
    }
  },

  updateTypography: (settings) => {
    set((state) => ({
      ...state,
      ...settings,
    }));
  },

  selectGateway: (gw) => {
    if (!gw) {
      set({
        activeGateway: null,
        selectedModel: "jev-verdict-2.0",
        fallbackModels: ["jev-verdict-2.0"],
      });
      return;
    }

    const primaryModel = gw.models.length > 0 ? gw.models[0] : null;

    // Dynamically derive fallback models from this gateway's models, excluding primaryModel
    const candidates = gw.models.filter((m) => m !== primaryModel).slice(0, 3);

    // Filter out any models previously tested and known to have failed
    const testedResults = get().modelTestResults;
    const cleanFallbacks = candidates.filter((m) => {
      const test = testedResults[m];
      return !test || test.success; // keep if untested or tested successfully
    });

    if (!cleanFallbacks.includes("jev-verdict-2.0")) {
      cleanFallbacks.push("jev-verdict-2.0");
    }

    set({
      activeGateway: gw,
      selectedModel: primaryModel,
      fallbackModels: cleanFallbacks,
    });
  },

  setSelectedModel: (model) => {
    const { activeGateway, fallbackModels, modelTestResults } = get();
    if (!model) {
      set({ selectedModel: null });
      return;
    }

    // Ensure newly selected primary model is not in fallback list
    let nextFallbacks = fallbackModels.filter((m) => m !== model);

    // If activeGateway has other models and nextFallbacks has only jev-verdict, suggest alternative gateway models
    if (activeGateway && activeGateway.models.length > 1) {
      for (const m of activeGateway.models) {
        if (m !== model && !nextFallbacks.includes(m) && (!modelTestResults[m] || modelTestResults[m].success)) {
          nextFallbacks.unshift(m);
          break;
        }
      }
    }
    if (!nextFallbacks.includes("jev-verdict-2.0")) {
      nextFallbacks.push("jev-verdict-2.0");
    }

    set({ selectedModel: model, fallbackModels: nextFallbacks });
  },

  testModel: async (modelName: string) => {
    const { activeGateway } = get();
    const baseUrl = activeGateway ? activeGateway.base_url : "http://127.0.0.1:20128/v1";
    const gatewayType = activeGateway ? activeGateway.gateway_type : undefined;

    const result = await AiService.testModel({
      baseUrl,
      model: modelName,
      gatewayType,
    });

    set((state) => ({
      modelTestResults: {
        ...state.modelTestResults,
        [modelName]: result,
      },
    }));

    // If a model failed and is in fallbackModels, automatically remove it
    if (!result.success) {
      const currentFallbacks = get().fallbackModels;
      if (currentFallbacks.includes(modelName)) {
        const filtered = currentFallbacks.filter((m) => m !== modelName);
        if (!filtered.includes("jev-verdict-2.0")) {
          filtered.push("jev-verdict-2.0");
        }
        set({ fallbackModels: filtered });
      }
    }

    return result;
  },

  validateAndFilterFallbackModels: async (candidates) => {
    const targetCandidates = candidates && candidates.length > 0 ? candidates : get().fallbackModels;
    const verifiedModels: string[] = [];

    for (const m of targetCandidates) {
      if (m === "jev-verdict-2.0" || m.startsWith("jev-verdict")) {
        if (!verifiedModels.includes("jev-verdict-2.0")) {
          verifiedModels.push("jev-verdict-2.0");
        }
        continue;
      }

      const res = await get().testModel(m);
      if (res.success) {
        verifiedModels.push(m);
      }
    }

    if (!verifiedModels.includes("jev-verdict-2.0")) {
      verifiedModels.push("jev-verdict-2.0");
    }

    set({ fallbackModels: verifiedModels });
    return verifiedModels;
  },

  // AI Chapter Enhancement Implementation
  modifiedChapters: {},
  chapterEnhanceReports: {},
  isBatchEnhancing: false,
  enhanceProgress: null,
  terminalLogs: [],

  addTerminalLog: (log) => {
    const entry: TerminalLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      type: log.type,
      text: log.text,
    };
    set((state) => ({
      // Keep up to 500 latest entries to prevent memory leak and DOM bloat
      terminalLogs: [...state.terminalLogs.slice(-499), entry],
    }));
  },

  clearTerminalLogs: () => {
    set({ terminalLogs: [] });
  },

  resetChapterOverrides: () => {
    get().stopBatchEnhance();
    set({
      modifiedChapters: {},
      chapterEnhanceReports: {},
      enhanceProgress: null,
      isBatchEnhancing: false,
    });
  },

  enhanceSingleChapter: async (chapterIndex, features, options) => {
    const { currentBook, currentFilePath, currentFileBytes, activeGateway, selectedModel, modifiedChapters, activeProjectId } = get();
    if (!currentBook || !currentBook.chapters[chapterIndex]) {
      return false;
    }

    const chapter = currentBook.chapters[chapterIndex];
    const isAlreadyModified = Boolean(modifiedChapters[chapter.href]);

    // Check if already completed and user did not explicitly request re-processing
    if (isAlreadyModified && !options?.forceReprocess) {
      get().addTerminalLog({
        type: "info",
        text: `⏭️ [Đã làm] Chương [${chapterIndex + 1}] "${chapter.title}" (${chapter.href}) đã được biên tập trước đó trong dự án. Bỏ qua để không phải làm lại.`,
      });
      return true;
    }

    // Always fetch fresh original HTML from source when reprocessing or first time
    let chapterHtml: string | null = null;
    try {
      if (currentFilePath) {
        chapterHtml = await invoke<string>("read_chapter", {
          path: currentFilePath,
          href: chapter.href,
        });
      } else if (currentFileBytes) {
        chapterHtml = await invoke<string>("read_chapter_bytes", {
          bytes: currentFileBytes,
          href: chapter.href,
        });
      }
    } catch (err) {
      console.warn("Could not read original chapter bytes/path, falling back to modified:", err);
    }

    if (!chapterHtml) {
      chapterHtml = modifiedChapters[chapter.href] || "";
    }

    if (!chapterHtml) {
      get().addTerminalLog({
        type: "warning",
        text: `❌ Không thể đọc nội dung chương: ${chapter.href}`,
      });
      return false;
    }

    const baseUrl = activeGateway ? activeGateway.base_url : "http://127.0.0.1:20128/v1";
    const model = selectedModel || "gemini-3.6-flash";

    try {
      const execution = await AiService.enhanceChapter({
        baseUrl,
        model,
        chapterTitle: chapter.title,
        chapterHtml,
        bookTitle: currentBook.title,
        author: currentBook.author,
        engineMode: get().aiEngineMode,
        fallbackModels: get().fallbackModels,
        isFallbackEnabled: get().isFallbackEnabled,
        features,
        onLog: (l) => get().addTerminalLog(l),
      });

      const report: ChapterEnhanceReport = {
        chapterHref: chapter.href,
        chapterTitle: chapter.title,
        canonicalH1: execution.plan.h1_title,
        cleanedTopIndices: execution.result.cleanedTopIndices,
        headingsCount: execution.result.insertedHeadings.length,
        typosFixedCount: execution.result.appliedCorrections.filter((c) => c.status === "applied").length,
        timestamp: Date.now(),
      };

      set((state) => ({
        modifiedChapters: {
          ...state.modifiedChapters,
          [chapter.href]: execution.updatedHtml,
        },
        chapterEnhanceReports: {
          ...state.chapterEnhanceReports,
          [chapter.href]: report,
        },
      }));

      // Automatically auto-save active project progress
      if (activeProjectId) {
        get().saveActiveProject();
      }

      return true;
    } catch (err) {
      get().addTerminalLog({
        type: "warning",
        text: `❌ Lỗi khi xử lý chương ${chapter.href}: ${err}`,
      });
      return false;
    }
  },

  batchEnhanceChapters: async (chapterIndices, features, options) => {
    const { currentBook, modifiedChapters } = get();
    if (!currentBook || currentBook.chapters.length === 0) return false;

    let cancelRequested = false;
    // Set stop callback
    (get() as any)._cancelBatch = () => {
      cancelRequested = true;
    };

    const targetIndices = chapterIndices && chapterIndices.length > 0
      ? chapterIndices
      : currentBook.chapters.map((_, idx) => idx);

    const skipAlreadyDone = options?.skipAlreadyEnhanced ?? true;

    // Filter or inspect already completed parts in the project
    const alreadyDoneIndices: number[] = [];
    const pendingIndices: number[] = [];

    for (const idx of targetIndices) {
      const ch = currentBook.chapters[idx];
      if (ch && modifiedChapters[ch.href] && skipAlreadyDone) {
        alreadyDoneIndices.push(idx);
      } else {
        pendingIndices.push(idx);
      }
    }

    if (skipAlreadyDone && alreadyDoneIndices.length > 0) {
      get().addTerminalLog({
        type: "info",
        text: `🔍 [Kiểm tra dự án] Đã phát hiện ${alreadyDoneIndices.length}/${targetIndices.length} chương đã hoàn thành trước đó. Sẽ tự động bỏ qua để không phải làm lại.`,
      });
    }

    if (pendingIndices.length === 0) {
      get().addTerminalLog({
        type: "success",
        text: `✅ Tất cả ${targetIndices.length} chương trong phạm vi này đều đã được biên tập xong trong dự án! Không cần làm lại.`,
      });
      return true;
    }

    set({ isBatchEnhancing: true });

    for (let i = 0; i < pendingIndices.length; i++) {
      if (cancelRequested) {
        get().addTerminalLog({
          type: "warning",
          text: `⏹️ Đã dừng tiến trình xử lý theo yêu cầu người dùng.`,
        });
        break;
      }

      const idx = pendingIndices[i];
      const ch = currentBook.chapters[idx];
      if (!ch) continue;

      set({
        enhanceProgress: {
          current: i + 1,
          total: pendingIndices.length,
          currentChapterHref: ch.href,
        },
      });

      get().addTerminalLog({
        type: "info",
        text: `⌛ [${i + 1}/${pendingIndices.length}] Đang xử lý: ${ch.href}...`,
      });

      await get().enhanceSingleChapter(idx, features, { forceReprocess: !skipAlreadyDone });
    }

    set({
      isBatchEnhancing: false,
      enhanceProgress: null,
    });
    return !cancelRequested;
  },

  stopBatchEnhance: () => {
    if (typeof (get() as any)._cancelBatch === "function") {
      (get() as any)._cancelBatch();
    }
    set({ isBatchEnhancing: false });
  },

  cleanWatermarksInBook: async (customKeywords?: string[]) => {
    const { currentBook, currentFilePath, currentFileBytes, modifiedChapters, activeProjectId } = get();
    if (!currentBook || currentBook.chapters.length === 0) {
      return { affectedChapters: 0, removedCount: 0, savedToFile: false };
    }

    const updatedModified = { ...modifiedChapters };
    let affectedChapters = 0;
    let totalRemoved = 0;

    for (const ch of currentBook.chapters) {
      let chapterHtml = updatedModified[ch.href];
      if (!chapterHtml) {
        try {
          if (currentFilePath) {
            chapterHtml = await invoke<string>("read_chapter", {
              path: currentFilePath,
              href: ch.href,
            });
          } else if (currentFileBytes) {
            chapterHtml = await invoke<string>("read_chapter_bytes", {
              bytes: currentFileBytes,
              href: ch.href,
            });
          }
        } catch (err) {
          console.warn(`Could not read chapter ${ch.href}:`, err);
        }
      }

      if (chapterHtml) {
        const res = cleanChapterHtmlWatermarks(chapterHtml, { customKeywords });
        if (res.removedBlocksCount > 0 || res.inlineFixesCount > 0) {
          updatedModified[ch.href] = res.cleanedHtml;
          affectedChapters++;
          totalRemoved += res.removedBlocksCount + res.inlineFixesCount;
        }
      }
    }

    const updatedChapters = currentBook.chapters.map((ch) => {
      const html = updatedModified[ch.href];
      let cleanTitle = ch.title;
      // Clean watermark tokens from title
      cleanTitle = cleanTitle.replace(/\[\s*(?:dtv-ebook(?:\.com)?|sachvui(?:\.com)?|tve-4u(?:\.org)?|truyenfull(?:\.vn)?)\s*\]/gi, "");
      cleanTitle = cleanTitle.replace(/dtv-ebook(?:\.com)?/gi, "").trim();

      if (html) {
        const plain = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        return {
          ...ch,
          title: cleanTitle || ch.title,
          preview_text: plain.slice(0, 200),
        };
      }
      return {
        ...ch,
        title: cleanTitle || ch.title,
      };
    });

    const updatedBook = {
      ...currentBook,
      chapters: updatedChapters,
    };

    set({
      modifiedChapters: updatedModified,
      currentBook: updatedBook,
    });

    let savedToFile = false;

    // 1. Auto-save in-place to physical EPUB file if opened from disk
    if (currentFilePath) {
      try {
        const fullCss = generateEpubCss({
          preset: get().activePreset,
          fontSize: get().fontSize,
          lineHeight: get().lineHeight,
          firstLineIndent: get().firstLineIndent,
          dropCaps: get().dropCaps,
          textAlign: get().textAlign,
          sceneDivider: get().sceneDivider,
          customOverrides: get().customCss,
          isVietnamese: get().isVietnameseBook,
          fontFamily: get().fontFamily,
        });

        await invoke<number>("export_epub", {
          inputPath: currentFilePath,
          inputBytes: null,
          outputPath: currentFilePath,
          customCss: fullCss,
          chapterOverrides: updatedModified,
          metadataOverrides: {
            title: currentBook.title,
            author: currentBook.author,
            language: currentBook.language,
            description: currentBook.description,
            cover_data_url: currentBook.cover_data_url,
          },
        });
        savedToFile = true;
      } catch (err) {
        console.warn("Could not auto-save directly to file on disk:", err);
      }
    }

    // 2. Auto-save to project registry and IndexedDB
    if (activeProjectId) {
      get().saveActiveProject();
      saveChaptersToDb(activeProjectId, updatedModified);
    }

    return { affectedChapters, removedCount: totalRemoved, savedToFile };
  },

  // Projects Library Implementation
  projects: loadProjectsFromStorage(),
  activeProjectId: null,

  updateBookMetadata: (updates) => {
    const { currentBook, activeProjectId, projects } = get();
    if (!currentBook) return;

    const updatedBook: EpubMetadata = {
      ...currentBook,
      ...updates,
      title: updates.title !== undefined ? updates.title : currentBook.title,
      author: updates.author !== undefined ? updates.author : currentBook.author,
      language: updates.language !== undefined ? updates.language : currentBook.language,
      description: updates.description !== undefined ? updates.description : currentBook.description,
      cover_data_url: updates.cover_data_url !== undefined ? updates.cover_data_url : currentBook.cover_data_url,
      publisher: updates.publisher !== undefined ? updates.publisher : currentBook.publisher,
      published_year: updates.published_year !== undefined ? updates.published_year : currentBook.published_year,
      isbn: updates.isbn !== undefined ? updates.isbn : currentBook.isbn,
      genre: updates.genre !== undefined ? updates.genre : currentBook.genre,
    };

    const isVi = detectIsVietnameseBook(updatedBook);

    let updatedProjects = projects;
    if (activeProjectId) {
      updatedProjects = projects.map((p) => {
        if (p.id !== activeProjectId) return p;
        return {
          ...p,
          name: updates.title !== undefined && updates.title.trim() ? updates.title : p.name,
          author: updates.author !== undefined ? updates.author : p.author,
          publisher: updates.publisher !== undefined ? updates.publisher : p.publisher,
          publishedYear: updates.published_year !== undefined ? updates.published_year : p.publishedYear,
          isbn: updates.isbn !== undefined ? updates.isbn : p.isbn,
          genre: updates.genre !== undefined ? updates.genre : p.genre,
          description: updates.description !== undefined ? updates.description : p.description,
          coverDataUrl: updates.cover_data_url !== undefined ? updates.cover_data_url : p.coverDataUrl,
          lastOpenedAt: Date.now(),
        };
      });
      saveProjectsToStorage(updatedProjects);
    }

    set({
      currentBook: updatedBook,
      isVietnameseBook: isVi,
      projects: updatedProjects,
    });
  },

  // Kindle Companion Actions Implementation
  runXRayExtraction: async () => {
    const { currentBook, currentFilePath, currentFileBytes, modifiedChapters } = get();
    if (!currentBook || currentBook.chapters.length === 0) return null;

    set({ isAnalyzingXRay: true });
    try {
      const chapterSources: ChapterTextSource[] = [];
      // Read chapters
      for (const ch of currentBook.chapters) {
        let html = modifiedChapters[ch.href];
        if (!html) {
          try {
            if (currentFilePath) {
              html = await invoke<string>("read_chapter", { path: currentFilePath, href: ch.href });
            } else if (currentFileBytes) {
              html = await invoke<string>("read_chapter_bytes", { bytes: currentFileBytes, href: ch.href });
            }
          } catch (e) {
            console.warn(`Could not read ${ch.href}:`, e);
          }
        }
        if (html) {
          chapterSources.push({ href: ch.href, title: ch.title, html });
        }
      }

      const { people, terms } = extractXRayHeuristic(chapterSources);
      const totalOccurrences = people.reduce((acc, p) => acc + p.occurrencesCount, 0) +
        terms.reduce((acc, t) => acc + t.occurrencesCount, 0);

      const generatedAsin = currentBook.isbn?.replace(/[^A-Za-z0-9]/g, "") ||
        `B0${Math.abs(currentBook.title.split("").reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0)).toString(36).toUpperCase().padStart(8, "0")}`.slice(0, 10);

      const bookData: XRayBookData = {
        bookTitle: currentBook.title,
        asin: generatedAsin,
        people,
        terms,
        totalOccurrences,
      };

      set({ xrayData: bookData, isAnalyzingXRay: false });
      return bookData;
    } catch (err) {
      console.error("X-Ray extraction failed:", err);
      set({ isAnalyzingXRay: false });
      return null;
    }
  },

  applyWordWiseToBook: async () => {
    const { currentBook, currentFilePath, currentFileBytes, modifiedChapters, wordWiseSettings, activeProjectId } = get();
    if (!currentBook || currentBook.chapters.length === 0) return 0;

    const updatedModified = { ...modifiedChapters };
    let totalAnnotated = 0;

    for (const ch of currentBook.chapters) {
      let html = updatedModified[ch.href];
      if (!html) {
        try {
          if (currentFilePath) {
            html = await invoke<string>("read_chapter", { path: currentFilePath, href: ch.href });
          } else if (currentFileBytes) {
            html = await invoke<string>("read_chapter_bytes", { bytes: currentFileBytes, href: ch.href });
          }
        } catch (e) {
          console.warn(`Could not read ${ch.href}:`, e);
        }
      }

      if (html) {
        const result = injectWordWiseRuby(html, wordWiseSettings);
        if (result.annotatedCount > 0) {
          updatedModified[ch.href] = result.html;
          totalAnnotated += result.annotatedCount;
        }
      }
    }

    set({ modifiedChapters: updatedModified });
    if (activeProjectId) {
      saveChaptersToDb(activeProjectId, updatedModified);
      get().saveActiveProject();
    }
    return totalAnnotated;
  },

  removeWordWiseFromBook: async () => {
    const { currentBook, modifiedChapters, activeProjectId } = get();
    if (!currentBook) return 0;

    const updatedModified = { ...modifiedChapters };
    let strippedCount = 0;

    for (const ch of currentBook.chapters) {
      const html = updatedModified[ch.href];
      if (html && html.includes("kindle-wordwise")) {
        updatedModified[ch.href] = stripWordWiseRuby(html);
        strippedCount++;
      }
    }

    set({ modifiedChapters: updatedModified });
    if (activeProjectId) {
      saveChaptersToDb(activeProjectId, updatedModified);
      get().saveActiveProject();
    }
    return strippedCount;
  },

  embedXRayAppendixToBook: async () => {
    const { currentBook, modifiedChapters, xrayData, activeProjectId } = get();
    if (!currentBook) return false;

    let activeXRay = xrayData;
    if (!activeXRay) {
      activeXRay = await get().runXRayExtraction();
    }
    if (!activeXRay) return false;

    const appendixHref = "xray_appendix.xhtml";
    const appendixHtml = generateXRayAppendixHtml(activeXRay);

    const updatedModified = {
      ...modifiedChapters,
      [appendixHref]: appendixHtml,
    };

    // If not already in chapters list, add to chapters
    let updatedChapters = [...currentBook.chapters];
    const existingIdx = updatedChapters.findIndex((c) => c.href === appendixHref);
    const appendixItem: ChapterItem = {
      id: "xray-appendix",
      href: appendixHref,
      title: "Dramatis Personae & World Guide (X-Ray)",
      preview_text: `Bách khoa toàn thư nhân vật và thuật ngữ cho cuốn sách ${currentBook.title}.`,
    };

    if (existingIdx >= 0) {
      updatedChapters[existingIdx] = appendixItem;
    } else {
      updatedChapters.push(appendixItem);
    }

    const updatedBook = {
      ...currentBook,
      chapters: updatedChapters,
      chapter_count: updatedChapters.length,
    };

    set({
      currentBook: updatedBook,
      modifiedChapters: updatedModified,
    });

    if (activeProjectId) {
      saveChaptersToDb(activeProjectId, updatedModified);
      get().saveActiveProject();
    }
    return true;
  },

  createProject: (meta, source) => {
    const existing = get().projects.find((p) => p.filePath && p.filePath === source.filePath);
    if (existing) {
      return existing.id;
    }

    const id = `prj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newProject: EbookProject = {
      id,
      name: meta.title || "Sách Chưa Đặt Tên",
      filePath: source.filePath || null,
      coverDataUrl: meta.cover_data_url || null,
      chapterCount: meta.chapter_count || 0,
      fileSizeBytes: meta.file_size_bytes || 0,
      activePresetId: get().activePresetId,
      customCss: get().customCss,
      fontFamily: get().fontFamily,
      fontSize: get().fontSize,
      textAlign: get().textAlign,
      dropCaps: get().dropCaps,
      lineHeight: get().lineHeight,
      firstLineIndent: get().firstLineIndent,
      sceneDivider: get().sceneDivider,
      modifiedChapters: {},
      chapterEnhanceReports: {},
      createdAt: Date.now(),
      lastOpenedAt: Date.now(),
    };

    const updated = [newProject, ...get().projects];
    set({ projects: updated, activeProjectId: id });
    saveProjectsToStorage(updated);
    return id;
  },

  openProject: async (projectId: string) => {
    const project = get().projects.find((p) => p.id === projectId);
    if (!project) return false;

    get().stopBatchEnhance();
    set({ isLoadingBook: true });

    try {
      let meta: EpubMetadata;
      if (project.filePath) {
        meta = await invoke<EpubMetadata>("read_epub", { path: project.filePath });
      } else {
        // Fallback for projects without stored filePath
        meta = {
          title: project.name,
          author: "Dự án đã lưu",
          language: "vi",
          description: null,
          cover_data_url: project.coverDataUrl,
          chapter_count: project.chapterCount,
          file_size_bytes: project.fileSizeBytes,
          chapters: [],
          sample_text: "",
        };
      }

      const isVi = detectIsVietnameseBook(meta);
      const chosenPreset = STYLE_PRESETS.find((p) => p.id === project.activePresetId) || STYLE_PRESETS[0];

      // Load chapters from IndexedDB if available
      const dbChapters = await loadChaptersFromDb(project.id);
      const activeModified = dbChapters || project.modifiedChapters || {};

      // Merge modified/cleaned chapters into meta.chapters so watermarks are not resurrected
      if (Object.keys(activeModified).length > 0) {
        meta.chapters = meta.chapters.map((ch) => {
          const modHtml = activeModified[ch.href];
          let cleanTitle = ch.title;
          cleanTitle = cleanTitle.replace(/\[\s*(?:dtv-ebook(?:\.com)?|sachvui(?:\.com)?|tve-4u(?:\.org)?|truyenfull(?:\.vn)?)\s*\]/gi, "");
          cleanTitle = cleanTitle.replace(/dtv-ebook(?:\.com)?/gi, "").trim();

          if (modHtml) {
            const plain = modHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
            return {
              ...ch,
              title: cleanTitle || ch.title,
              preview_text: plain.slice(0, 200),
            };
          }
          return {
            ...ch,
            title: cleanTitle || ch.title,
          };
        });
      }

      // Update lastOpenedAt
      const updatedProjects = get().projects.map((p) =>
        p.id === projectId ? { ...p, lastOpenedAt: Date.now() } : p
      );

      set({
        projects: updatedProjects,
        activeProjectId: project.id,
        currentBook: meta,
        currentFilePath: project.filePath,
        currentFileBytes: null,
        isVietnameseBook: isVi,
        activePresetId: project.activePresetId || chosenPreset.id,
        activePreset: chosenPreset,
        customCss: project.customCss || chosenPreset.cssTemplate,
        fontFamily: project.fontFamily || (isVi && chosenPreset.vietnameseFontFamily ? chosenPreset.vietnameseFontFamily : chosenPreset.fontFamily),
        fontSize: project.fontSize || 16,
        textAlign: project.textAlign || "justify",
        dropCaps: project.dropCaps ?? true,
        lineHeight: project.lineHeight || 1.75,
        firstLineIndent: project.firstLineIndent || "2em",
        sceneDivider: project.sceneDivider || "♦ ♦ ♦",
        modifiedChapters: activeModified,
        chapterEnhanceReports: project.chapterEnhanceReports || {},
        isLoadingBook: false,
        activeChapterIndex: 0,
        activeTab: "books",
      });

      saveProjectsToStorage(updatedProjects);
      return true;
    } catch (err) {
      console.error("Failed to open project:", err);
      set({ isLoadingBook: false });
      return false;
    }
  },

  deleteProject: (projectId: string) => {
    if (get().activeProjectId === projectId) {
      get().closeActiveProject();
    }
    deleteChaptersFromDb(projectId);
    const updated = get().projects.filter((p) => p.id !== projectId);
    set({ projects: updated });
    saveProjectsToStorage(updated);
  },

  saveActiveProject: () => {
    const { activeProjectId, projects, modifiedChapters, chapterEnhanceReports, activePresetId, customCss, fontFamily, fontSize, textAlign, dropCaps, lineHeight, firstLineIndent, sceneDivider } = get();
    if (!activeProjectId) return;

    saveChaptersToDb(activeProjectId, modifiedChapters);

    const updated = projects.map((p) => {
      if (p.id !== activeProjectId) return p;
      return {
        ...p,
        activePresetId,
        customCss,
        fontFamily,
        fontSize,
        textAlign,
        dropCaps,
        lineHeight,
        firstLineIndent,
        sceneDivider,
        modifiedChapters,
        chapterEnhanceReports,
        lastOpenedAt: Date.now(),
      };
    });

    set({ projects: updated });
    saveProjectsToStorage(updated);
  },

  closeActiveProject: () => {
    get().saveActiveProject();
    get().stopBatchEnhance();
    get().stopTranslation();
    set({
      activeProjectId: null,
      currentBook: null,
      currentFilePath: null,
      currentFileBytes: null,
      modifiedChapters: {},
      chapterEnhanceReports: {},
      enhanceProgress: null,
      isBatchEnhancing: false,
      translationProgress: null,
      isTranslating: false,
      activeChapterIndex: 0,
    });
  },

  // Book Translation Implementation
  translationConfig: defaultTranslationConfig,
  setTranslationConfig: (config) =>
    set({ translationConfig: { ...get().translationConfig, ...config } }),
  translationProgress: null,
  isTranslating: false,

  translateSingleChapter: async (chapterIndex: number) => {
    const {
      currentBook,
      currentFilePath,
      currentFileBytes,
      activeGateway,
      selectedModel,
      fallbackModels,
      translationConfig,
      activeProjectId,
      modifiedChapters,
    } = get();

    if (!currentBook) return false;
    const chapter = currentBook.chapters[chapterIndex];
    if (!chapter) return false;

    const baseUrl = activeGateway ? activeGateway.base_url : "http://localhost:11434";
    const model = selectedModel || activeGateway?.models?.[0] || "gpt-4o";

    let rawHtml = "";
    try {
      if (modifiedChapters[chapter.href]) {
        rawHtml = modifiedChapters[chapter.href];
      } else if (currentFilePath) {
        rawHtml = await invoke<string>("read_chapter", {
          path: currentFilePath,
          href: chapter.href,
        });
      } else if (currentFileBytes) {
        rawHtml = await invoke<string>("read_chapter_bytes", {
          bytes: currentFileBytes,
          href: chapter.href,
        });
      }
    } catch (err) {
      console.error("Could not read chapter:", err);
      get().addTerminalLog({
        type: "warning",
        text: `❌ Không thể đọc chương "${chapter.title}" (${chapter.href}): ${err}`,
      });
      return false;
    }

    if (!rawHtml) return false;

    translationAbortController = new AbortController();
    set({ isTranslating: true });

    get().addTerminalLog({
      type: "info",
      text: `🌐 [Dịch AI] Bắt đầu dịch chương ${chapterIndex + 1}: "${chapter.title}" (${translationConfig.sourceLang} ➔ ${translationConfig.targetLang})...`,
    });

    try {
      const res = await TranslationService.translateChapter({
        chapterHtml: rawHtml,
        chapterTitle: chapter.title,
        bookTitle: currentBook.title,
        sourceLang: translationConfig.sourceLang,
        targetLang: translationConfig.targetLang,
        tone: translationConfig.tone,
        mode: translationConfig.mode,
        glossary: translationConfig.glossary,
        researchBrief: translationConfig.useResearchBrief ? translationConfig.researchBrief : undefined,
        baseUrl,
        model,
        fallbackModels,
        maxBlocksPerChunk: translationConfig.maxBlocksPerChunk,
        abortSignal: translationAbortController.signal,
        onProgress: (p) => {
          set({
            translationProgress: {
              currentChapterIndex: chapterIndex + 1,
              totalChapters: 1,
              currentChapterHref: chapter.href,
              currentChapterTitle: chapter.title,
              currentBlock: p.currentBlock,
              totalBlocks: p.totalBlocks,
              percent: p.percent,
            },
          });
        },
        onLog: (log) => get().addTerminalLog(log),
      });

      const updatedModified = {
        ...get().modifiedChapters,
        [chapter.href]: res.translatedHtml,
      };

      set({
        modifiedChapters: updatedModified,
        isTranslating: false,
        translationProgress: null,
      });

      if (activeProjectId) {
        saveChaptersToDb(activeProjectId, updatedModified);
        get().saveActiveProject();
      }

      get().addTerminalLog({
        type: "success",
        text: `✨ Đã lưu bản dịch chương "${chapter.title}" (${res.translatedBlocksCount} đoạn) vào dự án!`,
      });
      return true;
    } catch (err: unknown) {
      set({ isTranslating: false, translationProgress: null });
      if (err instanceof DOMException && err.name === "AbortError") {
        get().addTerminalLog({
          type: "warning",
          text: `⏹️ Đã dừng dịch chương "${chapter.title}".`,
        });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        get().addTerminalLog({
          type: "warning",
          text: `❌ Lỗi khi dịch chương "${chapter.title}": ${msg}`,
        });
      }
      return false;
    } finally {
      translationAbortController = null;
    }
  },

  batchTranslateChapters: async (chapterIndices?: number[], skipAlreadyTranslated = false) => {
    const { currentBook, modifiedChapters } = get();
    if (!currentBook || currentBook.chapters.length === 0) return false;

    const targets = chapterIndices && chapterIndices.length > 0
      ? chapterIndices
      : currentBook.chapters.map((_, i) => i);

    const pending = skipAlreadyTranslated
      ? targets.filter((i) => !modifiedChapters[currentBook.chapters[i]?.href])
      : targets;

    if (pending.length === 0) {
      get().addTerminalLog({
        type: "info",
        text: "✅ Tất cả các chương đã chọn đều đã có bản dịch trong dự án!",
      });
      return true;
    }

    set({ isTranslating: true });
    translationAbortController = new AbortController();

    get().addTerminalLog({
      type: "info",
      text: `🚀 Bắt đầu dịch hàng loạt ${pending.length} chương...`,
    });

    for (let pIdx = 0; pIdx < pending.length; pIdx++) {
      if (translationAbortController?.signal.aborted) {
        break;
      }
      const chIdx = pending[pIdx];
      const ch = currentBook.chapters[chIdx];
      if (!ch) continue;

      set({
        translationProgress: {
          currentChapterIndex: pIdx + 1,
          totalChapters: pending.length,
          currentChapterHref: ch.href,
          currentChapterTitle: ch.title,
          currentBlock: 0,
          totalBlocks: 0,
          percent: Math.round((pIdx / pending.length) * 100),
        },
      });

      const ok = await get().translateSingleChapter(chIdx);
      if (!ok && translationAbortController?.signal.aborted) {
        break;
      }
    }

    set({ isTranslating: false, translationProgress: null });
    translationAbortController = null;
    return true;
  },

  stopTranslation: () => {
    if (translationAbortController) {
      translationAbortController.abort();
      translationAbortController = null;
    }
    set({ isTranslating: false, translationProgress: null });
    get().addTerminalLog({
      type: "warning",
      text: "⏹️ Tiến trình dịch sách đã được tạm dừng/hủy bỏ.",
    });
  },

  resetChapterTranslation: (chapterHref: string) => {
    const { modifiedChapters, activeProjectId } = get();
    const updated = { ...modifiedChapters };
    delete updated[chapterHref];
    set({ modifiedChapters: updated });
    if (activeProjectId) {
      saveChaptersToDb(activeProjectId, updated);
      get().saveActiveProject();
    }
    get().addTerminalLog({
      type: "info",
      text: `Đã khôi phục chương ${chapterHref} về bản gốc.`,
    });
  },

  autoDetectSourceLanguage: () => {
    const { currentBook } = get();
    if (!currentBook) return null;

    let sample = currentBook.sample_text || "";
    if (sample.length < 50 && currentBook.chapters.length > 0) {
      sample = currentBook.chapters
        .slice(0, 3)
        .map((c) => `${c.title} ${c.preview_text}`)
        .join(" ");
    }

    const detected = LanguageDetector.detectLanguage(sample, currentBook.language);
    get().setTranslationConfig({ sourceLang: detected.languageName });
    get().addTerminalLog({
      type: "info",
      text: `🔍 [Nhận diện ngôn ngữ] ${detected.languageName} (Độ tin cậy: ${(detected.confidence * 100).toFixed(0)}%, nguồn: ${detected.source}) - ${detected.details || ""}`,
    });
    return detected;
  },

  isExtractingEntities: false,
  extractedCandidates: [],

  extractBookEntities: async () => {
    const { currentBook, currentFilePath, currentFileBytes, activeGateway, selectedModel, translationConfig } = get();
    if (!currentBook) return [];

    set({ isExtractingEntities: true });
    get().addTerminalLog({
      type: "info",
      text: `🔎 Bắt đầu quét tự động thực thể, tên riêng & thuật ngữ trong các chương mở đầu...`,
    });

    try {
      // Gather chapter sources from first 5 chapters
      const chapterSources: ChapterTextSource[] = [];
      const sampleChapters = currentBook.chapters.slice(0, 5);

      for (const ch of sampleChapters) {
        let html = "";
        try {
          if (currentFilePath) {
            html = await invoke<string>("read_chapter", { path: currentFilePath, href: ch.href });
          } else if (currentFileBytes) {
            html = await invoke<string>("read_chapter_bytes", { bytes: currentFileBytes, href: ch.href });
          }
        } catch (readErr) {
          console.warn("Could not read chapter for entity extraction:", readErr);
        }
        if (html) {
          chapterSources.push({ href: ch.href, title: ch.title, html });
        }
      }

      // Step 1: Heuristic extraction
      const rawCandidates = EntityExtractor.extractCandidates(
        chapterSources,
        translationConfig.glossary,
        25
      );

      get().addTerminalLog({
        type: "detail",
        text: `Đã tìm thấy ${rawCandidates.length} thực thể và thuật ngữ tiềm năng. Đang gửi AI đề xuất bản dịch...`,
      });

      // Step 2: AI Proposal
      const baseUrl = activeGateway ? activeGateway.base_url : "http://localhost:11434";
      const model = selectedModel || activeGateway?.models?.[0] || "gpt-4o";

      const enriched = await EntityExtractor.proposeTranslationsWithAi(rawCandidates, {
        bookTitle: currentBook.title,
        author: currentBook.author,
        sourceLang: translationConfig.sourceLang,
        targetLang: translationConfig.targetLang,
        baseUrl,
        model,
      });

      set({
        extractedCandidates: enriched,
        isExtractingEntities: false,
      });

      get().addTerminalLog({
        type: "success",
        text: `✅ Hoàn tất trích xuất ${enriched.length} thuật ngữ & tên riêng cho sách!`,
      });

      return enriched;
    } catch (err: unknown) {
      set({ isExtractingEntities: false });
      const msg = err instanceof Error ? err.message : String(err);
      get().addTerminalLog({
        type: "warning",
        text: `⚠️ Lỗi khi trích xuất thuật ngữ: ${msg}`,
      });
      return [];
    }
  },

  applyApprovedEntitiesToGlossary: (approved) => {
    const { translationConfig, activeProjectId } = get();
    const updatedGlossary = EntityExtractor.mergeApprovedEntitiesIntoGlossary(
      translationConfig.glossary,
      approved
    );
    set({
      translationConfig: {
        ...translationConfig,
        glossary: updatedGlossary,
      },
    });
    if (activeProjectId) {
      get().saveActiveProject();
    }
    get().addTerminalLog({
      type: "success",
      text: `🎉 Đã cập nhật ${approved.length} thuật ngữ vào bộ từ điển Glossary của sách!`,
    });
  },

  isGeneratingResearchBrief: false,

  generateBookResearchBrief: async () => {
    const { currentBook, activeGateway, selectedModel, translationConfig, activeProjectId } = get();
    if (!currentBook) return "";

    set({ isGeneratingResearchBrief: true });
    get().addTerminalLog({
      type: "info",
      text: `🧠 Bắt đầu nghiên cứu bối cảnh & lập quy tắc xưng hô cho "${currentBook.title}"...`,
    });

    try {
      const baseUrl = activeGateway ? activeGateway.base_url : "http://localhost:11434";
      const model = selectedModel || activeGateway?.models?.[0] || "gpt-4o";

      const brief = await BookResearchService.generateResearchBrief({
        bookTitle: currentBook.title,
        author: currentBook.author,
        genre: currentBook.genre,
        sourceLang: translationConfig.sourceLang,
        targetLang: translationConfig.targetLang,
        tone: translationConfig.tone,
        sampleText: currentBook.sample_text,
        baseUrl,
        model,
      });

      set({
        translationConfig: {
          ...translationConfig,
          researchBrief: brief,
          useResearchBrief: true,
        },
        isGeneratingResearchBrief: false,
      });

      if (activeProjectId) {
        get().saveActiveProject();
      }

      get().addTerminalLog({
        type: "success",
        text: `📖 Đã hoàn tất lập Hồ sơ nghiên cứu bối cảnh tác phẩm (${brief.length} ký tự)!`,
      });

      return brief;
    } catch (err: unknown) {
      set({ isGeneratingResearchBrief: false });
      const msg = err instanceof Error ? err.message : String(err);
      get().addTerminalLog({
        type: "warning",
        text: `⚠️ Không thể lập hồ sơ nghiên cứu: ${msg}`,
      });
      return "";
    }
  },
}));
