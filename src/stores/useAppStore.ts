import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { STYLE_PRESETS, StylePreset } from "../presets/styles";
import { AiService } from "../services/aiService";
import { detectIsVietnameseBook } from "../utils/vietnameseHelper";
import { cleanChapterHtmlWatermarks } from "../utils/watermarkCleaner";
import { saveChaptersToDb, loadChaptersFromDb, deleteChaptersFromDb, saveCoverToDb, loadCoverFromDb, deleteCoverFromDb } from "../utils/chapterStorage";
import { generateEpubCss } from "../utils/cssGenerator";
import {
  MIN_NATIVE_STYLE_CONFIDENCE,
  NATIVE_PRESET_ID,
  buildNativePreset,
  deriveBookStyleSignature,
  emptySignature,
  type BookStyleSignature,
  type StylesheetSource,
} from "../utils/bookStyleAnalyzer";
import { injectWordWiseRuby, stripWordWiseRuby } from "../services/kindle/wordWiseService";
import { extractXRayHeuristic, generateXRayAppendixHtml, XRayBookData, ChapterTextSource } from "../services/kindle/xrayService";
import { TranslationService } from "../services/translation/translationService";
import { ChapterTranslator } from "../utils/chapterTranslator";
import { TranslationTone, TONE_DESCRIPTIONS } from "../services/prompts/bookTranslator";
import { LanguageDetector, LanguageDetectionResult } from "../utils/languageDetector";
import type { ActiveTab } from "../types/navigation";
import type { WorkflowJob } from "../types/workflow";
import {
  type BookProfile,
  type BookWorkflow,
  type IngestKind,
  WORKFLOW_TAB,
  bookIdentityKey,
  detectBookProfile,
  workflowLabel,
} from "../utils/bookTypeDetector";
import { EntityExtractor, ExtractedEntityCandidate } from "../services/translation/entityExtractor";
import { BookResearchService } from "../services/translation/bookResearchService";
import { AgentService, AgentChatMessage } from "../services/agent/agentService";
import { AgentToolDispatcher, ReadOnlyStoreContext, MutatingStoreContext } from "../services/agent/agentTools";

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

export interface ConfiguredProviderInfo {
  provider: string;
  name: string;
  is_active: boolean;
  test_status?: string;
}

export interface DetectedGateway {
  name: string;
  base_url: string;
  port: number;
  is_online: boolean;
  models: string[];
  gateway_type: string;
  latency_ms: number;
  api_key?: string;
  configured_providers?: ConfiguredProviderInfo[];
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
  language?: string;
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
  agentMessages?: AgentChatMessage[];

  // --- Ingest workflow state (optional: projects saved before this feature
  // simply lack these fields and are read back with `??` defaults) ---
  workflowId?: BookWorkflow | null;
  workflowSource?: "auto" | "manual" | null;
  workflowCompletedSteps?: string[];
  translatedChapters?: Record<string, number>;
  detectedLanguageCode?: string | null;
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
  translateTitles?: boolean;
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

export interface AutoTranslationConfigResult {
  detectedLanguage: LanguageDetectionResult | null;
  recommendedTone: TranslationTone;
  toneLabel: string;
  /** Every entity the scan produced (proper names + terminology), before dedupe. */
  entitiesExtractedCount: number;
  /** Proper names (person / place) newly pinned into the glossary. */
  properNamesCount: number;
  /** Terminology (term) newly pinned into the glossary. */
  termsCount: number;
  /** Names of the proper names that were pinned into the glossary. */
  addedProperNames: string[];
  /** Names of the terms that were pinned into the glossary. */
  addedTerms: string[];
  /** Human-readable label of the AI engine that will run the translation. */
  activeEngineLabel: string;
  researchBriefGenerated: boolean;
  researchBriefSnippet?: string;
  stepStatuses: {
    language: "success" | "fallback" | "failed";
    tone: "success" | "fallback";
    entities: "success" | "skipped" | "failed";
    research: "success" | "skipped" | "failed";
  };
}

export type IngestRouteReasonValue =
  | "auto"
  | "native-vietnamese"
  | "low-confidence"
  | "preference-off"
  | "manual-locked"
  | "auto-switch-disabled";

export interface IngestRouteResult {
  profile: BookProfile;
  tab: ActiveTab;
  switched: boolean;
  reason: IngestRouteReasonValue;
}

export interface RouteBookContext {
  kind?: IngestKind;
  isScannedPdf?: boolean;
  /** Re-use an already-computed profile instead of detecting a second time. */
  profile?: BookProfile | null;
  /** `false` keeps the current tab (used by `openProject`). */
  autoSwitch?: boolean;
}

export interface AppState {
  // Navigation
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

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

  // Book Ingest Workflow Router
  /** Classification of the book currently open, produced on every ingest. */
  bookProfile: BookProfile | null;
  /** Result of the most recent routing decision (used by the UI for toasts). */
  lastIngestRoute: IngestRouteResult | null;
  /** `manual` means the user picked a workflow and detection must not override it. */
  workflowSource: "auto" | "manual" | null;
  /** Ids of workflow steps already finished for the open book. */
  workflowCompletedSteps: string[];
  /** Book identity whose workflow banner the user dismissed. */
  dismissedWorkflowFor: string | null;
  /** Auto-switch tab on ingest. User preference, persisted in localStorage. */
  autoRouteOnIngest: boolean;
  /** href -> timestamp, so "chapters left to translate" is O(1) instead of scanning content. */
  translatedChapters: Record<string, number>;

  setAutoRouteOnIngest: (enabled: boolean) => void;
  routeAfterBookLoad: (meta: EpubMetadata, context?: RouteBookContext) => IngestRouteResult | null;
  /**
   * Re-applies a saved project's workflow state on top of the routing decision.
   * Routing and restoring are one operation by construction, because routing
   * resets per-book state and a later restore must never lose that race.
   */
  restoreProjectWorkflow: (project: EbookProject, profile?: BookProfile | null) => void;
  startRecommendedWorkflow: () => ActiveTab | null;
  markWorkflowStepComplete: (stepId: string) => void;
  dismissWorkflow: () => void;
  resetWorkflowState: () => void;
  recomputeProfileLanguage: () => void;
  /** Translation coverage — the single source for every "translated" counter/badge. */
  getTranslationCoverage: () => { translated: number; total: number; isLegacyFallback: boolean };
  getUntranslatedChapterCount: () => number;

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

  // "Theo sách hiện tại" — style suy ra từ CSS gốc của sách đang mở
  bookStyleSignature: BookStyleSignature | null;
  /** CSS gốc lấy từ EPUB, chỉ giữ trong phiên để nhúng vào trình đọc thử. */
  bookStyleCss: string | null;
  isAnalyzingBookStyle: boolean;
  /** Bật/tắt việc tự động áp dụng style gốc khi mở một sách mới. */
  autoStyleFromBook: boolean;
  setAutoStyleFromBook: (enabled: boolean) => void;
  analyzeBookStyle: (opts?: { apply?: boolean }) => Promise<BookStyleSignature | null>;

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
  autoSaveMetadataToFile: () => Promise<boolean>;
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
  isAutoConfiguringAll: boolean;
  autoConfigureAllTranslationSettings: () => Promise<AutoTranslationConfigResult | null>;
  // Unified Workflow Jobs
  workflowJobs: Record<string, WorkflowJob>;
  addWorkflowJob: (job: WorkflowJob) => void;
  updateWorkflowJob: (id: string, updates: Partial<WorkflowJob>) => void;
  removeWorkflowJob: (id: string) => void;
  clearCompletedWorkflowJobs: () => void;
  setChapterHtml: (chapterHref: string, html: string) => void;

  // AI Chat Agent State & Actions
  agentMessages: AgentChatMessage[];
  isAgentDrawerOpen: boolean;
  isAgentThinking: boolean;
  agentThinkingStatus: string | null;
  toggleAgentDrawer: () => void;
  setAgentDrawerOpen: (open: boolean) => void;
  sendAgentMessage: (content: string) => Promise<void>;
  confirmAgentAction: (messageId: string, approved: boolean) => Promise<void>;
  clearAgentChat: () => void;

  // Global Export Modal State & Actions
  isExportOpen: boolean;
  setIsExportOpen: (open: boolean) => void;
}

const initialTheme = (typeof window !== "undefined" && (window.localStorage.getItem("lg-theme-mode") as "dark" | "light" | "system")) || "dark";
const initialSidebarCollapsed = typeof window !== "undefined" && window.localStorage.getItem("lg-sidebar-collapsed") === "true";
const AUTO_ROUTE_STORAGE_KEY = "lg-auto-route-ingest";
const initialAutoRouteOnIngest =
  typeof window === "undefined" || !window.localStorage
    ? true
    : window.localStorage.getItem(AUTO_ROUTE_STORAGE_KEY) !== "false";

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
  translateTitles: true,
};

/** Joins entity names for the terminal log, truncating very long scans. */
function summarizeEntityNames(names: string[], max = 30): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} … (+${names.length - max})`;
}

/**
 * State patch cho chế độ "Theo sách hiện tại".
 *
 * `customCss` luôn rỗng: lớp phủ thích ứng do `generateEpubCss` sinh ra từ
 * `bookStyleSignature`, không phải từ template của preset.
 */
function nativeStylePatch(
  signature: BookStyleSignature,
  fallback: StylePreset,
  isVietnamese: boolean
) {
  const preset = buildNativePreset(signature, fallback, isVietnamese);
  const font =
    isVietnamese && preset.vietnameseFontFamily ? preset.vietnameseFontFamily : preset.fontFamily;

  return {
    activePresetId: NATIVE_PRESET_ID,
    activePreset: preset,
    customCss: "",
    fontFamily: font,
    lineHeight: preset.lineHeight,
    firstLineIndent: preset.firstLineIndent,
    dropCaps: preset.dropCaps,
    sceneDivider: preset.sceneDivider,
  };
}

let metadataFileDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let isAutoSavingFile = false;
let hasPendingAutoSave = false;

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

  // --- Book Ingest Workflow Router -----------------------------------------
  bookProfile: null,
  lastIngestRoute: null,
  workflowSource: null,
  workflowCompletedSteps: [],
  dismissedWorkflowFor: null,
  autoRouteOnIngest: initialAutoRouteOnIngest,
  translatedChapters: {},

  setAutoRouteOnIngest: (enabled) => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(AUTO_ROUTE_STORAGE_KEY, String(enabled));
    }
    set({ autoRouteOnIngest: enabled });
    get().addTerminalLog({
      type: "info",
      text: enabled
        ? "🧭 [Quy trình] Đã bật tự động chuyển quy trình khi nạp sách."
        : "🧭 [Quy trình] Đã tắt tự động chuyển quy trình — chỉ hiện gợi ý.",
    });
  },

  routeAfterBookLoad: (meta, context = {}) => {
    const profile =
      context.profile ??
      detectBookProfile(meta, {
        kind: context.kind,
        isScannedPdf: context.isScannedPdf,
      });

    if (!profile) {
      set({ bookProfile: null, lastIngestRoute: null });
      return null;
    }

    const identity = profile.bookIdentity;
    const isSameBook = get().bookProfile?.bookIdentity === identity;

    // A manual choice is sticky: once the user picks a workflow for this book,
    // detection is no longer allowed to change tabs or reset progress.
    const workflowSource: "auto" | "manual" =
      isSameBook && get().workflowSource ? get().workflowSource! : "auto";
    const tab = WORKFLOW_TAB[profile.workflow];
    const autoSwitchRequested = context.autoSwitch !== false;

    let switched = false;
    let reason: IngestRouteReasonValue;

    if (!autoSwitchRequested) {
      reason = "auto-switch-disabled";
    } else if (workflowSource === "manual") {
      reason = "manual-locked";
    } else if (!get().autoRouteOnIngest) {
      reason = "preference-off";
    } else if (!profile.autoRoutable) {
      reason = "low-confidence";
    } else if (tab === "books") {
      reason = "native-vietnamese";
    } else {
      switched = true;
      reason = "auto";
      set({ activeTab: tab });
      if (tab === "translator") {
        // Cheap, offline pre-fill so the translator is usable immediately.
        // The expensive AI auto-configuration stays an explicit user action.
        get().autoDetectSourceLanguage();
        get().setTranslationConfig({ targetLang: "Tiếng Việt (Vietnamese)" });
      }
    }

    const route: IngestRouteResult = { profile, tab, switched, reason };

    set({
      bookProfile: profile,
      lastIngestRoute: route,
      workflowSource,
      workflowCompletedSteps: isSameBook ? get().workflowCompletedSteps : [],
      translatedChapters: isSameBook ? get().translatedChapters : {},
      dismissedWorkflowFor: get().dismissedWorkflowFor === identity ? identity : null,
    });

    get().addTerminalLog({
      type: switched ? "success" : "info",
      text: `🧭 [Quy trình] ${profile.languageFlag} ${profile.languageName} (${Math.round(
        profile.languageConfidence * 100
      )}%) → quy trình "${workflowLabel(profile)}"${switched ? ` — đã mở tab phù hợp` : ""}`,
    });

    return route;
  },

  restoreProjectWorkflow: (project, profile) => {
    const meta = get().currentBook;
    if (!meta) return;

    // Order is enforced here, not at the call site: routing first (it resets
    // per-book state), then the persisted progress is applied on top.
    get().routeAfterBookLoad(meta, { profile: profile ?? undefined, autoSwitch: false });

    set({
      workflowCompletedSteps: project.workflowCompletedSteps ?? [],
      workflowSource: project.workflowSource ?? "auto",
      translatedChapters: project.translatedChapters ?? {},
    });
  },

  startRecommendedWorkflow: () => {
    const profile = get().bookProfile;
    if (!profile) return null;

    const tab = WORKFLOW_TAB[profile.workflow];
    set({ workflowSource: "manual", dismissedWorkflowFor: null, activeTab: tab });
    if (tab === "translator") {
      get().autoDetectSourceLanguage();
    }
    get().addTerminalLog({
      type: "info",
      text: `🧭 [Quy trình] Bắt đầu thủ công: ${workflowLabel(profile)}`,
    });
    return tab;
  },

  markWorkflowStepComplete: (stepId) => {
    if (!stepId) return;
    const current = get().workflowCompletedSteps;
    if (current.includes(stepId)) return;
    set({ workflowCompletedSteps: [...current, stepId] });
    if (get().activeProjectId) {
      get().saveActiveProject();
    }
  },

  dismissWorkflow: () => {
    const { currentBook, bookProfile } = get();
    // Prefer the live book, but fall back to the profile so dismissing works even
    // when the caller only routed a profile (e.g. a project opened from the library).
    const identity = currentBook ? bookIdentityKey(currentBook) : bookProfile?.bookIdentity ?? null;
    if (!identity) return;
    set({ dismissedWorkflowFor: identity });
  },

  resetWorkflowState: () => {
    set({ workflowCompletedSteps: [], workflowSource: "auto", dismissedWorkflowFor: null });
    if (get().activeProjectId) {
      get().saveActiveProject();
    }
  },

  recomputeProfileLanguage: () => {
    const { currentBook, workflowSource, bookProfile } = get();
    if (!currentBook) return;

    const fresh = detectBookProfile(currentBook);
    if (!fresh) return;

    // Never let detection overwrite a manually chosen workflow; refresh only the
    // observed language facts so the banner stays truthful.
    if (workflowSource === "manual" && bookProfile && bookProfile.bookIdentity === fresh.bookIdentity) {
      set({
        bookProfile: {
          ...bookProfile,
          languageCode: fresh.languageCode,
          languageName: fresh.languageName,
          languageFlag: fresh.languageFlag,
          languageConfidence: fresh.languageConfidence,
          detectionSource: fresh.detectionSource,
          isVietnamese: fresh.isVietnamese,
        },
      });
      return;
    }

    set({ bookProfile: fresh });
  },

  getTranslationCoverage: () => {
    const { currentBook, translatedChapters, modifiedChapters } = get();
    if (!currentBook) return { translated: 0, total: 0, isLegacyFallback: false };

    // Prefer the actual chapter list: `chapter_count` from the Rust parser can
    // differ, and only the listed chapters can ever be translated.
    const total = currentBook.chapters.length || currentBook.chapter_count || 0;

    // A project translated before per-chapter tracking existed has an empty
    // `translatedChapters` map, so fall back to `modifiedChapters` — an
    // approximation, and the only signal those projects have.
    const isLegacyFallback =
      Object.keys(translatedChapters).length === 0 && Object.keys(modifiedChapters).length > 0;
    const source = isLegacyFallback ? modifiedChapters : translatedChapters;

    const translated = currentBook.chapters.filter((chapter) =>
      Boolean(source[chapter.href])
    ).length;
    return { translated, total, isLegacyFallback };
  },

  getUntranslatedChapterCount: () => {
    const { translated, total } = get().getTranslationCoverage();
    return Math.max(0, total - translated);
  },

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

  bookStyleSignature: null,
  bookStyleCss: null,
  isAnalyzingBookStyle: false,
  autoStyleFromBook: true,
  setAutoStyleFromBook: (enabled) => set({ autoStyleFromBook: enabled }),

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
      // The ingest router's classification is canonical; fall back to the legacy
      // boolean only when there is no usable evidence at all.
      const profile = detectBookProfile(meta);
      const isVi =
        !profile || profile.detectionSource === "unknown"
          ? detectIsVietnameseBook(meta)
          : profile.isVietnamese;
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
        // Chữ ký/ CSS gốc của sách trước không còn giá trị cho sách mới.
        bookStyleSignature: null,
        bookStyleCss: null,
      });

      // Route the user into the right workflow (may switch tabs it is told to).
      get().routeAfterBookLoad(meta, { profile, autoSwitch: true });

      // Sách mở lần đầu chưa có lựa chọn style riêng ⇒ tự style theo chính nó.
      // Luôn phân tích (chỉ đọc zip, rất rẻ) để trình đọc thử có nền CSS gốc;
      // chỉ ÁP DỤNG khi người dùng bật chế độ tự động.
      void get().analyzeBookStyle({ apply: get().autoStyleFromBook });

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
      const profile = detectBookProfile(meta);
      const isVi =
        !profile || profile.detectionSource === "unknown"
          ? detectIsVietnameseBook(meta)
          : profile.isVietnamese;
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
        // Chữ ký/ CSS gốc của sách trước không còn giá trị cho sách mới.
        bookStyleSignature: null,
        bookStyleCss: null,
      });

      // Route the user into the right workflow (may switch tabs it is told to).
      get().routeAfterBookLoad(meta, { profile, autoSwitch: true });

      // Sách mở lần đầu chưa có lựa chọn style riêng ⇒ tự style theo chính nó.
      // Luôn phân tích (chỉ đọc zip, rất rẻ) để trình đọc thử có nền CSS gốc;
      // chỉ ÁP DỤNG khi người dùng bật chế độ tự động.
      void get().analyzeBookStyle({ apply: get().autoStyleFromBook });

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

      // Apply recommended preset automatically — trừ khi người dùng đang ở chế độ
      // "theo sách hiện tại" (khi đó CSS gốc của sách mới là chuẩn, Jev chỉ đề xuất).
      const current = get();
      const isNativeAuto =
        current.autoStyleFromBook && current.activePresetId === NATIVE_PRESET_ID;
      if (decision.recommended_preset && !isNativeAuto) {
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
    // "Theo sách hiện tại": không thay thế CSS mà dựng lại lớp phủ thích ứng
    // từ chữ ký CSS gốc (phân tích lại nếu chưa có).
    if (presetId === NATIVE_PRESET_ID) {
      const existing = get().bookStyleSignature;
      if (existing) {
        set(nativeStylePatch(existing, STYLE_PRESETS[0], get().isVietnameseBook));
      } else {
        void get().analyzeBookStyle({ apply: true });
      }
      return;
    }

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

  analyzeBookStyle: async (opts) => {
    const { currentBook, currentFilePath, currentFileBytes, isVietnameseBook, modifiedChapters } = get();
    if (!currentBook) return null;

    set({ isAnalyzingBookStyle: true });
    try {
      const sheets = await invoke<StylesheetSource[]>("read_epub_styles", {
        path: currentFilePath ?? null,
        bytes: currentFileBytes ?? null,
      });

      // Một chương đầu là đủ để bắt các hook định dạng (drop-cap, scene-break...)
      // và CSS nhúng trong chương.
      let chapterHtml = "";
      const sampleHref = currentBook.chapters[0]?.href;
      if (sampleHref) {
        chapterHtml = modifiedChapters[sampleHref] || "";
        if (!chapterHtml) {
          try {
            chapterHtml = currentFilePath
              ? await invoke<string>("read_chapter", { path: currentFilePath, href: sampleHref })
              : currentFileBytes
                ? await invoke<string>("read_chapter_bytes", { bytes: currentFileBytes, href: sampleHref })
                : "";
          } catch (err) {
            console.warn("Không đọc được chương mẫu để phân tích định dạng:", err);
          }
        }
      }

      const signature = deriveBookStyleSignature({
        stylesheets: sheets,
        chapterHtml,
        isVietnamese: isVietnameseBook,
      });

      set({
        bookStyleSignature: signature,
        bookStyleCss: sheets.map((sheet) => sheet.content).join("\n\n"),
        isAnalyzingBookStyle: false,
      });

      const basePreset =
        get().activePreset?.id === NATIVE_PRESET_ID ? STYLE_PRESETS[0] : get().activePreset;
      const shouldApply =
        opts?.apply === true || get().activePresetId === NATIVE_PRESET_ID;

      if (shouldApply) {
        if (signature.confidence >= MIN_NATIVE_STYLE_CONFIDENCE) {
          set(nativeStylePatch(signature, basePreset, isVietnameseBook));
        } else if (get().activePresetId === NATIVE_PRESET_ID) {
          // Đang ở chế độ theo sách nhưng CSS gốc quá ít thông tin: giữ lớp phủ
          // tối thiểu (không màu) và để người dùng quyết định preset khác.
          set(nativeStylePatch(signature, basePreset, isVietnameseBook));
          console.warn(
            `Định dạng gốc của sách không đủ dữ liệu (confidence ${signature.confidence}) — giữ lớp phủ tối thiểu.`
          );
        }
      }

      return signature;
    } catch (err) {
      console.error("Failed to analyze book style:", err);
      set({ isAnalyzingBookStyle: false });
      return null;
    }
  },

  runAiDeepStyling: async () => {
    const { currentBook, activeGateway, selectedModel, jevDecision } = get();
    if (!currentBook || !currentBook.sample_text) {
      return false;
    }

    set({ isAiGenerating: true });
    try {
      const baseUrl = activeGateway ? activeGateway.base_url : "http://100.118.3.52:20128/v1";
      const apiKey = activeGateway?.api_key;
      const model = selectedModel || "claude-3-5-sonnet";

      const { result, source } = await AiService.generateStyling({
        baseUrl,
        apiKey,
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

      get().markWorkflowStepComplete("style");

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
    const baseUrl = activeGateway ? activeGateway.base_url : "http://100.118.3.52:20128/v1";
    const apiKey = activeGateway?.api_key;
    const gatewayType = activeGateway ? activeGateway.gateway_type : undefined;

    const result = await AiService.testModel({
      baseUrl,
      apiKey,
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
      // Bản dịch nằm trong modifiedChapters, nên khi xoá nội dung đ ghi đè thì
      // sổ theo dõi quy trình cũng phải xoá theo, nếu không số liệu sẽ sai.
      translatedChapters: {},
      workflowCompletedSteps: [],
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

    const baseUrl = activeGateway ? activeGateway.base_url : "http://100.118.3.52:20128/v1";
    const apiKey = activeGateway?.api_key;
    const model = selectedModel || "gemini-3.6-flash";

    try {
      const execution = await AiService.enhanceChapter({
        baseUrl,
        apiKey,
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
          // Ghi thẳng vào file EPUB: phải giữ nguyên hành vi "theo sách hiện tại".
          signature: get().bookStyleSignature,
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

    if (totalRemoved > 0) {
      get().markWorkflowStepComplete("cleanup");
      // The watermarks are gone, so the profile no longer has them.
      get().recomputeProfileLanguage();
    }

    return { affectedChapters, removedCount: totalRemoved, savedToFile };
  },

  // Projects Library Implementation
  projects: loadProjectsFromStorage(),
  activeProjectId: null,

  updateBookMetadata: (updates) => {
    const { currentBook, activeProjectId, projects, currentFilePath } = get();
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
          language: updates.language !== undefined ? updates.language : p.language,
          coverDataUrl: updates.cover_data_url !== undefined ? updates.cover_data_url : p.coverDataUrl,
          lastOpenedAt: Date.now(),
        };
      });
      if (updates.cover_data_url) {
        saveCoverToDb(activeProjectId, updates.cover_data_url);
      }
      saveProjectsToStorage(updatedProjects);
    }

    set({
      currentBook: updatedBook,
      isVietnameseBook: isVi,
      projects: updatedProjects,
    });

    // Refresh the detected language facts. This never changes the active tab:
    // editing metadata must not move the user out of their current workflow.
    get().recomputeProfileLanguage();

    // Auto-save to physical EPUB file if opened from disk
    if (currentFilePath) {
      if (metadataFileDebounceTimer) {
        clearTimeout(metadataFileDebounceTimer);
      }
      metadataFileDebounceTimer = setTimeout(() => {
        void get().autoSaveMetadataToFile();
      }, 500);
    }
  },

  autoSaveMetadataToFile: async () => {
    if (isAutoSavingFile) {
      hasPendingAutoSave = true;
      return true;
    }

    isAutoSavingFile = true;
    try {
      let savedAtLeastOnce = false;
      do {
        hasPendingAutoSave = false;
        const {
          currentBook,
          currentFilePath,
          isVietnameseBook,
          activePreset,
          fontSize,
          lineHeight,
          firstLineIndent,
          dropCaps,
          textAlign,
          sceneDivider,
          customCss,
          fontFamily,
          bookStyleSignature,
          modifiedChapters,
        } = get();

        if (!currentFilePath || !currentBook) break;

        const fullCss = generateEpubCss({
          preset: activePreset,
          fontSize,
          lineHeight,
          firstLineIndent,
          dropCaps,
          textAlign,
          sceneDivider,
          customOverrides: customCss,
          isVietnamese: isVietnameseBook,
          fontFamily,
          signature: bookStyleSignature,
        });

        await invoke<number>("export_epub", {
          inputPath: currentFilePath,
          inputBytes: null,
          outputPath: currentFilePath,
          customCss: fullCss,
          chapterOverrides: modifiedChapters,
          metadataOverrides: {
            title: currentBook.title,
            author: currentBook.author,
            language: currentBook.language,
            description: currentBook.description,
            cover_data_url: currentBook.cover_data_url,
          },
        });
        savedAtLeastOnce = true;
      } while (hasPendingAutoSave);

      return savedAtLeastOnce;
    } catch (err) {
      console.error("Could not auto-save metadata directly to file on disk:", err);
      return false;
    } finally {
      isAutoSavingFile = false;
    }
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
      author: meta.author,
      publisher: meta.publisher,
      publishedYear: meta.published_year,
      isbn: meta.isbn,
      genre: meta.genre,
      description: meta.description,
      language: meta.language,
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
    if (meta.cover_data_url) {
      saveCoverToDb(id, meta.cover_data_url);
    }
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
          author: project.author || "Dự án đã lưu",
          language: project.language || "vi",
          description: project.description ?? null,
          publisher: project.publisher,
          published_year: project.publishedYear,
          isbn: project.isbn,
          genre: project.genre,
          cover_data_url: project.coverDataUrl,
          chapter_count: project.chapterCount,
          file_size_bytes: project.fileSizeBytes,
          chapters: [],
          sample_text: "",
        };
      }
      // Apply saved project metadata overrides over raw read_epub
      if (project.name && project.name.trim()) meta.title = project.name;
      if (project.author && project.author.trim()) meta.author = project.author;
      if (project.publisher && project.publisher.trim()) meta.publisher = project.publisher;
      if (project.publishedYear && project.publishedYear.trim()) meta.published_year = project.publishedYear;
      if (project.isbn && project.isbn.trim()) meta.isbn = project.isbn;
      if (project.genre && project.genre.trim()) meta.genre = project.genre;
      if (project.description !== undefined && project.description !== null && project.description.trim()) meta.description = project.description;
      if (project.language && project.language.trim()) meta.language = project.language;
      // Hydrate cover from IndexedDB if project cover was stripped from localStorage
      const dbCover = await loadCoverFromDb(project.id);
      if (dbCover) {
        meta.cover_data_url = dbCover;
      } else if (project.coverDataUrl) {
        meta.cover_data_url = project.coverDataUrl;
      }

      const profile = detectBookProfile(meta);
      const isVi =
        !profile || profile.detectionSource === "unknown"
          ? detectIsVietnameseBook(meta)
          : profile.isVietnamese;
      const chosenPreset = STYLE_PRESETS.find((p) => p.id === project.activePresetId);
      // "Theo sách hiện tại": preset sẽ được dựng lại từ CSS gốc ngay sau khi mở.
      const isNativeStyle = project.activePresetId === NATIVE_PRESET_ID;
      const resolvedPreset =
        chosenPreset ??
        (isNativeStyle ? buildNativePreset(emptySignature(), STYLE_PRESETS[0], isVi) : STYLE_PRESETS[0]);

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
        activePresetId: project.activePresetId || resolvedPreset.id,
        activePreset: resolvedPreset,
        customCss: isNativeStyle ? "" : project.customCss || resolvedPreset.cssTemplate,
        fontFamily: project.fontFamily || (isVi && resolvedPreset.vietnameseFontFamily ? resolvedPreset.vietnameseFontFamily : resolvedPreset.fontFamily),
        fontSize: project.fontSize || 16,
        textAlign: project.textAlign || "justify",
        dropCaps: project.dropCaps ?? true,
        lineHeight: project.lineHeight || 1.75,
        firstLineIndent: project.firstLineIndent || "2em",
        sceneDivider: project.sceneDivider || "♦ ♦ ♦",
        modifiedChapters: activeModified,
        chapterEnhanceReports: project.chapterEnhanceReports || {},
        agentMessages: project.agentMessages || [],
        isLoadingBook: false,
        activeChapterIndex: 0,
        activeTab: "books",
      });

      saveProjectsToStorage(updatedProjects);

      // Classify the book and restore its saved workflow progress, but never
      // hijack the tab: the user explicitly chose this project from the library.
      get().restoreProjectWorkflow(project, profile);

      // Luôn phân tích lại CSS gốc (file có thể đã đổi) để trình đọc thử có nền đúng.
      // Chỉ ÁP DỤNG khi style đã lưu của dự án chính là "theo sách hiện tại" —
      // lựa chọn preset thủ công của người dùng luôn được tôn trọng.
      void get().analyzeBookStyle({ apply: isNativeStyle });

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
    deleteCoverFromDb(projectId);
    const updated = get().projects.filter((p) => p.id !== projectId);
    set({ projects: updated });
    saveProjectsToStorage(updated);
  },

  saveActiveProject: () => {
    const { activeProjectId, projects, currentBook, modifiedChapters, chapterEnhanceReports, activePresetId, customCss, fontFamily, fontSize, textAlign, dropCaps, lineHeight, firstLineIndent, sceneDivider, bookProfile, workflowSource, workflowCompletedSteps, translatedChapters } = get();
    if (!activeProjectId) return;

    saveChaptersToDb(activeProjectId, modifiedChapters);
    if (currentBook?.cover_data_url) {
      saveCoverToDb(activeProjectId, currentBook.cover_data_url);
    }

    const updated = projects.map((p) => {
      if (p.id !== activeProjectId) return p;
      return {
        ...p,
        name: currentBook?.title ?? p.name,
        author: currentBook?.author ?? p.author,
        publisher: currentBook?.publisher ?? p.publisher,
        publishedYear: currentBook?.published_year ?? p.publishedYear,
        isbn: currentBook?.isbn ?? p.isbn,
        genre: currentBook?.genre ?? p.genre,
        description: currentBook?.description ?? p.description,
        language: currentBook?.language ?? p.language,
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
        agentMessages: get().agentMessages,
        workflowId: bookProfile?.workflow ?? p.workflowId ?? null,
        workflowSource: workflowSource ?? p.workflowSource ?? null,
        workflowCompletedSteps,
        translatedChapters,
        detectedLanguageCode: bookProfile?.languageCode ?? p.detectedLanguageCode ?? null,
        lastOpenedAt: Date.now(),
      };
    });

    set({ projects: updated });
    saveProjectsToStorage(updated);
  },

  closeActiveProject: () => {
    if (metadataFileDebounceTimer) {
      clearTimeout(metadataFileDebounceTimer);
      metadataFileDebounceTimer = null;
    }
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
      agentMessages: [],
      isAgentDrawerOpen: false,
      isAgentThinking: false,
      activeChapterIndex: 0,
      bookProfile: null,
      lastIngestRoute: null,
      workflowSource: null,
      workflowCompletedSteps: [],
      dismissedWorkflowFor: null,
      translatedChapters: {},
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
    const apiKey = activeGateway?.api_key;
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
        apiKey,
        model,
        fallbackModels,
        maxBlocksPerChunk: translationConfig.maxBlocksPerChunk,
        translateChapterTitle: translationConfig.translateTitles !== false,
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

      // Cheap O(1) bookkeeping so "chapters left to translate" never has to
      // re-read chapter content.
      const updatedTranslated = {
        ...get().translatedChapters,
        [chapter.href]: Date.now(),
      };

      // Translate chapter title & book title if enabled
      let updatedBook = { ...currentBook };
      if (translationConfig.translateTitles !== false) {
        const newChapterTitle = res.translatedChapterTitle || chapter.title;
        if (newChapterTitle && newChapterTitle !== chapter.title) {
          const updatedChapters = [...currentBook.chapters];
          updatedChapters[chapterIndex] = {
            ...chapter,
            title: newChapterTitle,
          };
          updatedBook.chapters = updatedChapters;
          get().addTerminalLog({
            type: "info",
            text: `📑 [Tiêu đề chương] Đã dịch: "${chapter.title}" ➔ "${newChapterTitle}"`,
          });
        }

        // Translate book title if not already in target language
        if (currentBook.title && !get().isVietnameseBook) {
          try {
            const translatedBookTitle = await TranslationService.translateTitle({
              title: currentBook.title,
              sourceLang: translationConfig.sourceLang,
              targetLang: translationConfig.targetLang,
              tone: translationConfig.tone,
              baseUrl,
              apiKey,
              model,
            });
            if (translatedBookTitle && translatedBookTitle !== currentBook.title) {
              updatedBook.title = translatedBookTitle;
              updatedBook.language = "vi";
              get().addTerminalLog({
                type: "success",
                text: `📖 [Tên truyện] Đã dịch tên tác phẩm: "${currentBook.title}" ➔ "${translatedBookTitle}"`,
              });
            }
          } catch (titleErr) {
            console.warn("Could not translate book title:", titleErr);
          }
        }
      }

      set({
        currentBook: updatedBook,
        modifiedChapters: updatedModified,
        translatedChapters: updatedTranslated,
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
    const { currentBook, modifiedChapters, translationConfig, activeGateway, selectedModel } = get();
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

    // Translate book title first if enabled and not already translated
    if (translationConfig.translateTitles !== false && currentBook.title && !get().isVietnameseBook) {
      const baseUrl = activeGateway ? activeGateway.base_url : "http://localhost:11434";
      const apiKey = activeGateway?.api_key;
      const model = selectedModel || activeGateway?.models?.[0] || "gpt-4o";
      try {
        const translatedBookTitle = await TranslationService.translateTitle({
          title: currentBook.title,
          sourceLang: translationConfig.sourceLang,
          targetLang: translationConfig.targetLang,
          tone: translationConfig.tone,
          baseUrl,
          apiKey,
          model,
        });
        if (translatedBookTitle && translatedBookTitle !== currentBook.title) {
          set({
            currentBook: {
              ...get().currentBook!,
              title: translatedBookTitle,
              language: "vi",
            },
          });
          get().addTerminalLog({
            type: "success",
            text: `📖 [Tên truyện] Đã dịch tên tác phẩm: "${currentBook.title}" ➔ "${translatedBookTitle}"`,
          });
        }
      } catch (titleErr) {
        console.warn("Could not translate book title in batch:", titleErr);
      }
    }

    const failedChapters: Array<{ index: number; title: string; href: string }> = [];

    for (let pIdx = 0; pIdx < pending.length; pIdx++) {
      if (translationAbortController?.signal.aborted) {
        break;
      }
      const chIdx = pending[pIdx];
      const liveBook = get().currentBook || currentBook;
      const ch = liveBook.chapters[chIdx];
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

      let ok = await get().translateSingleChapter(chIdx);
      // Auto-retry once on transient failure (timeout/rate-limit) before skipping
      if (!ok && !translationAbortController?.signal.aborted) {
        get().addTerminalLog({
          type: "warning",
          text: `⚠️ Chương ${chIdx + 1}: "${ch.title}" gặp sự cố, tự động thử dịch lại lần 2...`,
        });
        ok = await get().translateSingleChapter(chIdx);
      }

      if (!ok) {
        if (translationAbortController?.signal.aborted) {
          break;
        }
        failedChapters.push({ index: chIdx, title: ch.title, href: ch.href });
        get().addTerminalLog({
          type: "warning",
          text: `❌ Bỏ qua chương ${chIdx + 1}: "${ch.title}" sau 2 lượt thử không thành công.`,
        });
      }
    }

    if (failedChapters.length > 0 && !translationAbortController?.signal.aborted) {
      get().addTerminalLog({
        type: "warning",
        text: `⚠️ [Kết thúc lượt dịch]: Có ${failedChapters.length}/${pending.length} chương chưa dịch được:\n` +
          failedChapters.map((f) => `  • Chương ${f.index + 1}: "${f.title}"`).join("\n") +
          `\n👉 Bạn hãy chọn phạm vi "Chưa dịch" để thử dịch lại các chương trên.`,
      });
    }

    // Only mark the workflow step done when the WHOLE book is translated.
    const aborted = translationAbortController?.signal.aborted === true;
    const coverage = get().getTranslationCoverage();
    if (!aborted && coverage.total > 0 && coverage.translated >= coverage.total && failedChapters.length === 0) {
      get().markWorkflowStepComplete("translate");
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
    const { modifiedChapters, translatedChapters, activeProjectId } = get();
    const updated = { ...modifiedChapters };
    delete updated[chapterHref];
    const updatedTranslated = { ...translatedChapters };
    delete updatedTranslated[chapterHref];
    set({ modifiedChapters: updated, translatedChapters: updatedTranslated });
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
    const { currentBook, bookProfile } = get();
    if (!currentBook) return null;

    // The ingest router already classified this book from a richer sample
    // (body text first, titles only as a weak tail). Reuse that verdict instead
    // of running a second, potentially disagreeing detection.
    if (bookProfile && bookProfile.bookIdentity === bookIdentityKey(currentBook)) {
      const reused: LanguageDetectionResult = {
        languageCode: bookProfile.languageCode,
        languageName: bookProfile.languageName,
        confidence: bookProfile.languageConfidence,
        source: bookProfile.detectionSource === "unknown" ? "metadata" : bookProfile.detectionSource,
        details: "Tái sử dụng kết quả nhận diện từ quy trình nạp sách",
      };
      get().setTranslationConfig({ sourceLang: reused.languageName });
      return reused;
    }

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
    if (!currentBook || currentBook.chapters.length === 0) return [];

    set({ isExtractingEntities: true });
    get().addTerminalLog({
      type: "info",
      text: "⚡ Bắt đầu quét tự động thực thể, tên riêng & thuật ngữ trong các chương mở đầu...",
    });

    try {
      // Smart Chapter Selection: filter out empty cover/titlepage/toc/nav/copyright files
      // to extract entities strictly from chapters that contain actual literary narrative.
      const chapterSources: ChapterTextSource[] = [];
      const boilerplateRegex = /(?:cover|titlepage|nav|toc|copyright|dedication|license|mục\s*lục|bìa)/i;

      // First pass: locate chapters with narrative body text (>= 250 plain text characters)
      for (const ch of currentBook.chapters) {
        if (chapterSources.length >= 4) break;
        if (boilerplateRegex.test(ch.href) || boilerplateRegex.test(ch.title)) {
          continue;
        }

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
          const plain = ChapterTranslator.stripHtmlToPlainText(html);
          if (plain.length >= 250) {
            chapterSources.push({ href: ch.href, title: ch.title, html });
          }
        }
      }

      // Fallback pass: if book has short chapters or unconventional names, read the first 3 readable chapters
      if (chapterSources.length === 0) {
        for (const ch of currentBook.chapters.slice(0, 3)) {
          let html = "";
          try {
            if (currentFilePath) {
              html = await invoke<string>("read_chapter", { path: currentFilePath, href: ch.href });
            } else if (currentFileBytes) {
              html = await invoke<string>("read_chapter_bytes", { bytes: currentFileBytes, href: ch.href });
            }
          } catch {
            // ignore
          }
          if (html) {
            chapterSources.push({ href: ch.href, title: ch.title, html });
          }
        }
      }

      const baseUrl = activeGateway ? activeGateway.base_url : "http://localhost:11434";
      const apiKey = activeGateway?.api_key;
      const model = selectedModel || activeGateway?.models?.[0] || "gpt-4o";

      // Step 1: Heuristic extraction (fast regex scanning)
      const rawCandidates = EntityExtractor.extractCandidates(
        chapterSources,
        translationConfig.glossary,
        30
      );

      // Step 2: Direct AI extraction from combined narrative sample for high semantic accuracy
      let directAiCandidates: ExtractedEntityCandidate[] = [];
      const sampleText = chapterSources
        .map((c) => ChapterTranslator.stripHtmlToPlainText(c.html))
        .join("\n\n")
        .slice(0, 3500);

      if (sampleText.length > 100) {
        get().addTerminalLog({
          type: "detail",
          text: `Đang gửi mẫu văn bản (${sampleText.length} ký tự) tới AI để nhận diện thực thể & dịch danh xưng chuẩn...`,
        });
        directAiCandidates = await EntityExtractor.extractDirectWithAi(sampleText, {
          bookTitle: currentBook.title,
          author: currentBook.author,
          sourceLang: translationConfig.sourceLang,
          targetLang: translationConfig.targetLang,
          baseUrl,
          apiKey,
          model,
          maxCandidates: 25,
        });
      }

      // Step 3: Propose translations for any remaining heuristic candidates that weren't covered by Direct AI
      const candidateMap = new Map<string, ExtractedEntityCandidate>();

      // Put heuristic candidates first
      for (const hc of rawCandidates) {
        candidateMap.set(hc.name.toLowerCase().trim(), hc);
      }

      // Merge direct AI candidates (which already have proposed translations)
      for (const ac of directAiCandidates) {
        const key = ac.name.toLowerCase().trim();
        const existingGlossaryTrans = translationConfig.glossary?.[ac.name];
        candidateMap.set(key, {
          ...ac,
          suggestedTranslation: existingGlossaryTrans || ac.suggestedTranslation,
          isExistingInGlossary: Boolean(existingGlossaryTrans),
        });
      }

      const mergedList = Array.from(candidateMap.values());

      // If any candidate still needs a proposed translation, run batch proposal
      const needsAiProposal = mergedList.filter(
        (c) => !c.isExistingInGlossary && (!c.suggestedTranslation || c.suggestedTranslation === c.name)
      );

      let finalCandidates = mergedList;
      if (needsAiProposal.length > 0) {
        const proposed = await EntityExtractor.proposeTranslationsWithAi(needsAiProposal, {
          bookTitle: currentBook.title,
          author: currentBook.author,
          sourceLang: translationConfig.sourceLang,
          targetLang: translationConfig.targetLang,
          baseUrl,
          apiKey,
          model,
        });
        const propMap = new Map(proposed.map((p) => [p.name.toLowerCase().trim(), p.suggestedTranslation]));
        finalCandidates = mergedList.map((c) => {
          const aiTrans = propMap.get(c.name.toLowerCase().trim());
          if (aiTrans) {
            return { ...c, suggestedTranslation: aiTrans };
          }
          return c;
        });
      }

      set({
        extractedCandidates: finalCandidates,
        isExtractingEntities: false,
      });

      get().addTerminalLog({
        type: "success",
        text: `✅ Hoàn tất trích xuất ${finalCandidates.length} thuật ngữ & tên riêng cho sách!`,
      });

      return finalCandidates;
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
      const apiKey = activeGateway?.api_key;
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
        apiKey,
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

  isAutoConfiguringAll: false,

  autoConfigureAllTranslationSettings: async () => {
    const { currentBook, activeProjectId } = get();
    if (!currentBook) return null;

    set({ isAutoConfiguringAll: true });
    get().addTerminalLog({
      type: "info",
      text: "⚡ [Tự động thiết lập] Bắt đầu tự động cấu hình toàn bộ cài đặt dịch thuật cho sách...",
    });

    // 0. Report which translation engine (gateway + model) will actually run.
    const { activeGateway, selectedModel } = get();
    const resolvedModel = selectedModel || activeGateway?.models?.[0] || "";
    const activeEngineLabel = resolvedModel
      ? `${resolvedModel} @ ${activeGateway?.name || activeGateway?.gateway_type || "gateway"}`
      : "Mặc định (Ollama/local)";
    get().addTerminalLog({
      type: resolvedModel ? "info" : "warning",
      text: resolvedModel
        ? `🤖 [Bộ dịch thuật] Engine sẽ dùng: ${activeEngineLabel}${activeGateway?.base_url ? ` (${activeGateway.base_url})` : ""}`
        : "⚠️ [Bộ dịch thuật] Chưa chọn mô hình AI — bản dịch sẽ dùng endpoint mặc định (localhost:11434 / gpt-4o).",
    });

    const stepStatuses: AutoTranslationConfigResult["stepStatuses"] = {
      language: "failed",
      tone: "fallback",
      entities: "skipped",
      research: "skipped",
    };

    // 1. Language detection
    let detectedLang: LanguageDetectionResult | null = null;
    try {
      detectedLang = get().autoDetectSourceLanguage();
      if (detectedLang) {
        stepStatuses.language = detectedLang.source === "metadata" ? "fallback" : "success";
        const isVi =
          detectedLang.languageCode === "vi" ||
          detectedLang.languageName.toLowerCase().includes("việt");
        get().setTranslationConfig({
          sourceLang: detectedLang.languageName,
          targetLang: isVi ? "Tiếng Anh (English)" : "Tiếng Việt (Vietnamese)",
        });
      }
    } catch (langErr) {
      console.warn("Language detection failed in auto-configure:", langErr);
    }

    // 2. Genre & Tone recommendation via Jev Core / keywords
    let recommendedTone: TranslationTone = "literary";
    try {
      let genre = get().jevDecision?.genre || "";
      if (!genre && currentBook.sample_text) {
        try {
          const decision = await invoke<JevDecision>("classify_text_jev", {
            text: currentBook.sample_text,
          });
          set({ jevDecision: decision });
          genre = decision.genre;
        } catch {
          // ignore
        }
      }

      const sample = (currentBook.sample_text || "").toLowerCase();
      if (
        genre === "wuxia" ||
        /tu tiên|kiếm hiệp|huyền huyễn|tông môn|đan dược|phi kiếm|修仙|宗门|武侠/i.test(sample)
      ) {
        recommendedTone = "wuxia";
        stepStatuses.tone = "success";
      } else if (
        genre === "light_novel" ||
        /light novel|anime|học đường|chuyển sinh|isekai/i.test(sample)
      ) {
        recommendedTone = "light_novel";
        stepStatuses.tone = "success";
      } else if (
        genre === "scifi" ||
        /khoa học|công nghệ|lập trình|algorithm|software|architecture|kinh tế/i.test(sample)
      ) {
        recommendedTone = "academic";
        stepStatuses.tone = "success";
      } else {
        recommendedTone = "literary";
        stepStatuses.tone = "success";
      }

      get().setTranslationConfig({ tone: recommendedTone });
    } catch (toneErr) {
      console.warn("Tone recommendation failed, falling back to literary:", toneErr);
    }

    // 3. Contextual Research Brief
    let researchBrief = "";
    try {
      researchBrief = await get().generateBookResearchBrief();
      if (researchBrief) {
        stepStatuses.research = "success";
      } else {
        stepStatuses.research = "failed";
      }
    } catch (briefErr) {
      console.warn("Research brief generation failed:", briefErr);
      stepStatuses.research = "failed";
    }

    // 4. Auto Entity & Terminology extraction
    // Seed EVERY newly detected entity — both proper names (person/place) and
    // terminology (term). No frequency threshold: rare-but-important names must
    // stay consistent across the whole book too, or the translator will drift.
    // Existing user glossary entries are never touched (isExistingInGlossary).
    let entitiesCount = 0;
    let properNamesCount = 0;
    let termsCount = 0;
    const addedProperNames: string[] = [];
    const addedTerms: string[] = [];
    try {
      const candidates = await get().extractBookEntities();
      entitiesCount = candidates.length;

      if (candidates.length > 0) {
        const alreadyInGlossary = candidates.filter((c) => c.isExistingInGlossary).length;
        let identityMappedNames = 0;
        let skippedUnproposedTerms = 0;
        let skippedUnknownCategory = 0;

        const seed = candidates
          .filter((c) => !c.isExistingInGlossary)
          .flatMap((c) => {
            const isProperName = c.category === "person" || c.category === "place";
            const isTerm = c.category === "term";
            const proposed = (c.suggestedTranslation || "").trim();
            const hasRealTranslation = proposed.length > 0 && proposed !== c.name;

            // Identity-pinning (source => source) is only safe for an explicit
            // person/place name, where it means "keep the original spelling".
            // For a term — or for a category the AI invented through its loose
            // `category` cast — pinning the source word would order the model to
            // emit it verbatim inside Vietnamese text. Skip those instead.
            if (!hasRealTranslation && !isProperName) {
              if (isTerm) skippedUnproposedTerms += 1;
              else skippedUnknownCategory += 1;
              return [];
            }
            if (!hasRealTranslation) identityMappedNames += 1;

            if (isProperName) {
              properNamesCount += 1;
              addedProperNames.push(c.name);
            } else {
              termsCount += 1;
              addedTerms.push(c.name);
            }
            return [{ name: c.name, translation: hasRealTranslation ? proposed : c.name }];
          });

        if (seed.length > 0) {
          get().applyApprovedEntitiesToGlossary(seed);
        }

        if (addedProperNames.length > 0) {
          get().addTerminalLog({
            type: "detail",
            text: `👤 Tên riêng đã khóa (${addedProperNames.length}): ${summarizeEntityNames(addedProperNames)}`,
          });
        }
        if (addedTerms.length > 0) {
          get().addTerminalLog({
            type: "detail",
            text: `📚 Thuật ngữ đã khóa (${addedTerms.length}): ${summarizeEntityNames(addedTerms)}`,
          });
        }
        if (identityMappedNames > 0) {
          get().addTerminalLog({
            type: "detail",
            text: `🪪 ${identityMappedNames} tên riêng chưa có đề xuất dịch — giữ nguyên bản gốc để không lệch tên.`,
          });
        }
        if (skippedUnproposedTerms > 0) {
          get().addTerminalLog({
            type: "detail",
            text: `⏭️ Bỏ qua ${skippedUnproposedTerms} thuật ngữ chưa có đề xuất dịch (tránh khóa nguyên văn).`,
          });
        }
        if (skippedUnknownCategory > 0) {
          get().addTerminalLog({
            type: "detail",
            text: `⏭️ Bỏ qua ${skippedUnknownCategory} thực thể thuộc loại không xác định chưa có đề xuất dịch (để AI tự dịch tự nhiên).`,
          });
        }
        if (seed.length === 0) {
          get().addTerminalLog({
            type: "detail",
            text: `ℹ️ Không có tên riêng/thuật ngữ mới — ${candidates.length} thực thể phát hiện đã có sẵn trong Glossary.`,
          });
        }
        get().addTerminalLog({
          type: "detail",
          text: `🧾 Glossary: quét ${candidates.length} thực thể • đã có sẵn ${alreadyInGlossary} • thêm mới ${seed.length} • bỏ qua ${skippedUnproposedTerms + skippedUnknownCategory + identityMappedNames}`,
        });

        stepStatuses.entities = "success";
      } else {
        get().addTerminalLog({
          type: "detail",
          text: "ℹ️ Không tìm thấy tên riêng/thuật ngữ nào trong các chương mở đầu.",
        });
      }
    } catch (entErr) {
      console.warn("Entity extraction failed:", entErr);
      stepStatuses.entities = "failed";
    }

    // 5. Automatically enable translating titles
    get().setTranslationConfig({ translateTitles: true });

    if (activeProjectId) {
      get().saveActiveProject();
    }

    set({ isAutoConfiguringAll: false });

    const toneLabel = TONE_DESCRIPTIONS[recommendedTone]?.name || "Văn học & Tiểu thuyết";
    get().addTerminalLog({
      type: "detail",
      text: `🧩 [Tổng hợp Glossary] Tổng thực thể quét được: ${entitiesCount} • Tên riêng mới: ${properNamesCount} • Thuật ngữ mới: ${termsCount} • Tổng mục Glossary hiện tại: ${Object.keys(get().translationConfig.glossary || {}).length}`,
    });

    get().addTerminalLog({
      type: "success",
      text: `🎉 [Hoàn tất tự động thiết lập] Ngôn ngữ: ${detectedLang?.languageName || "Tiếng Anh"} ➔ ${get().translationConfig.targetLang} | Văn phong: ${toneLabel} | Tên riêng: ${properNamesCount} | Thuật ngữ: ${termsCount} | Engine: ${activeEngineLabel} | Bối cảnh: ${researchBrief ? "Đã lập" : "Bỏ qua"}`,
    });

    return {
      detectedLanguage: detectedLang,
      recommendedTone,
      toneLabel,
      entitiesExtractedCount: entitiesCount,
      properNamesCount,
      termsCount,
      addedProperNames,
      addedTerms,
      activeEngineLabel,
      researchBriefGenerated: Boolean(researchBrief),
      researchBriefSnippet: researchBrief ? researchBrief.slice(0, 150) + "..." : undefined,
      stepStatuses,
    };
  },

  // Unified Workflow Jobs Implementation
  workflowJobs: {},
  addWorkflowJob: (job) => {
    set((state) => ({
      workflowJobs: {
        ...state.workflowJobs,
        [job.id]: job,
      },
    }));
  },
  updateWorkflowJob: (id, updates) => {
    set((state) => {
      const existing = state.workflowJobs[id];
      if (!existing) return state;
      return {
        workflowJobs: {
          ...state.workflowJobs,
          [id]: {
            ...existing,
            ...updates,
            updatedAt: Date.now(),
          },
        },
      };
    });
  },
  removeWorkflowJob: (id) => {
    set((state) => {
      const updated = { ...state.workflowJobs };
      delete updated[id];
      return { workflowJobs: updated };
    });
  },
  clearCompletedWorkflowJobs: () => {
    set((state) => {
      const remaining: Record<string, WorkflowJob> = {};
      for (const [id, job] of Object.entries(state.workflowJobs)) {
        if (job.status === "running") {
          remaining[id] = job;
        }
      }
      return { workflowJobs: remaining };
    });
  },
  setChapterHtml: (chapterHref, html) => {
    const { modifiedChapters, activeProjectId } = get();
    const updated = {
      ...modifiedChapters,
      [chapterHref]: html,
    };
    set({ modifiedChapters: updated });
    if (activeProjectId) {
      saveChaptersToDb(activeProjectId, updated);
      get().saveActiveProject();
    }
  },
  // AI Chat Agent Implementation
  agentMessages: [],
  isAgentDrawerOpen: false,
  isAgentThinking: false,
  agentThinkingStatus: null,
  isExportOpen: false,
  setIsExportOpen: (open) => set({ isExportOpen: open }),

  toggleAgentDrawer: () => set({ isAgentDrawerOpen: !get().isAgentDrawerOpen }),
  setAgentDrawerOpen: (open) => set({ isAgentDrawerOpen: open }),

  sendAgentMessage: async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    const userMsg: AgentChatMessage = {
      id: `msg_user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };

    const currentHistory = [...get().agentMessages, userMsg];
    set({
      agentMessages: currentHistory,
      isAgentThinking: true,
      agentThinkingStatus: "Trợ lý đang suy nghĩ và kiểm tra dự án...",
    });

    const {
      currentBook,
      activePresetId,
      fontSize,
      lineHeight,
      dropCaps,
      fontFamily,
      textAlign,
      xrayData,
      activeChapterIndex,
      activeTab,
      modifiedChapters,
      translationConfig,
      activeGateway,
      selectedModel,
    } = get();

    const readOnlyCtx: ReadOnlyStoreContext = {
      currentBook,
      activePresetId,
      fontSize,
      lineHeight,
      dropCaps,
      fontFamily,
      textAlign,
      xrayData,
      activeChapterIndex,
      activeTab,
      modifiedChapters,
      translationConfig,
      workflowJobs: get().workflowJobs,
      openExportModal: () => set({ isExportOpen: true }),
      readChapterText: (chIdx: number) => {
        const { currentBook: book, modifiedChapters: mods, currentFilePath: fp, currentFileBytes: fb } = get();
        if (!book || !book.chapters[chIdx]) return Promise.resolve("");
        const ch = book.chapters[chIdx];
        if (mods[ch.href]) return Promise.resolve(mods[ch.href]);
        if (fp) return invoke<string>("read_chapter", { path: fp, href: ch.href });
        if (fb) return invoke<string>("read_chapter_bytes", { bytes: fb, href: ch.href });
        return Promise.resolve("");
      },
      setActiveTab: (tab) => get().setActiveTab(tab),
      setActiveChapterIndex: (idx) => get().setActiveChapterIndex(idx),
    };

    // If no online gateway is active, check offline fallback first
    const hasOnlineGateway = Boolean(activeGateway && activeGateway.is_online);
    if (!hasOnlineGateway) {
      const offlineMsg = AgentService.tryOfflineFallback(trimmed, readOnlyCtx);
      if (offlineMsg) {
        set({
          agentMessages: [...currentHistory, offlineMsg],
          isAgentThinking: false,
        });
        return;
      }

      // If user typed a custom query and no online gateway is active
      set({
        agentMessages: [
          ...currentHistory,
          {
            id: `msg_off_${Date.now()}`,
            role: "assistant",
            content: `💡 Trợ lý hiện đang hoạt động ở chế độ **Lõi Offline (Cục bộ)**.

Để trò chuyện tự do bằng AI hoặc hỏi đáp nội dung sâu, bạn vui lòng:
1. Mở tab **Cổng AI & Mô hình** và kết nối AI Gateway (Ollama, 9Router, Cockpit).
2. Hoặc bấm vào các **Gợi ý thao tác nhanh** có sẵn bên dưới để trợ lý thực thi trực tiếp trên dự án sách.`,
            timestamp: Date.now(),
          },
        ],
        isAgentThinking: false,
      });
      return;
    }

    const baseUrl = activeGateway?.base_url || "http://localhost:11434";
    const apiKey = activeGateway?.api_key;
    const model = selectedModel || activeGateway?.models?.[0] || "gpt-4o";

    try {
      const updatedMessages = await AgentService.runAgentTurn(currentHistory, readOnlyCtx, {
        baseUrl,
        apiKey,
        model,
        onProgress: (status) => set({ agentThinkingStatus: status }),
      });

      set({
        agentMessages: updatedMessages,
        isAgentThinking: false,
        agentThinkingStatus: null,
      });

      if (get().activeProjectId) {
        get().saveActiveProject();
      }
    } catch (err: unknown) {
      // Check offline fallback before reporting error
      const offlineFallback = AgentService.tryOfflineFallback(trimmed, readOnlyCtx);
      if (offlineFallback) {
        set({
          agentMessages: [...currentHistory, offlineFallback],
          isAgentThinking: false,
          agentThinkingStatus: null,
        });
        if (get().activeProjectId) {
          get().saveActiveProject();
        }
        return;
      }

      const errMsg = err instanceof Error ? err.message : String(err);
      set({
        agentMessages: [
          ...currentHistory,
          {
            id: `msg_err_${Date.now()}`,
            role: "assistant",
            content: `⚠️ Có lỗi xảy ra khi trò chuyện với AI: ${errMsg}`,
            timestamp: Date.now(),
          },
        ],
        isAgentThinking: false,
        agentThinkingStatus: null,
      });
    }
  },

  confirmAgentAction: async (messageId: string, approved: boolean) => {
    const { agentMessages, updateBookMetadata, selectPreset, updateTypography, setTranslationConfig, activeProjectId } = get();
    const msgIdx = agentMessages.findIndex((m) => m.id === messageId);
    if (msgIdx === -1) return;

    const targetMsg = agentMessages[msgIdx];
    if (!targetMsg.actionProposal || targetMsg.actionStatus !== "pending") return;

    const proposal = targetMsg.actionProposal;

    if (!approved) {
      // User rejected proposal
      const updatedList = [...agentMessages];
      updatedList[msgIdx] = {
        ...targetMsg,
        actionStatus: "rejected",
      };
      updatedList.push({
        id: `msg_rej_${Date.now()}`,
        role: "assistant",
        content: `Đã bỏ qua đề xuất "${proposal.title}". Không có thay đổi nào được thực hiện.`,
        timestamp: Date.now(),
      });
      set({ agentMessages: updatedList });
      return;
    }

    // User approved proposal
    const mutatingCtx: MutatingStoreContext = {
      updateBookMetadata,
      selectPreset,
      updateTypography,
      setTranslationConfig,
      setChapterHtml: get().setChapterHtml,
      translateSingleChapter: get().translateSingleChapter,
      enhanceSingleChapter: get().enhanceSingleChapter,
      runXRayExtraction: get().runXRayExtraction,
      embedXRayAppendixToBook: get().embedXRayAppendixToBook,
      cleanWatermarksInBook: get().cleanWatermarksInBook,
      openExportModal: () => set({ isExportOpen: true }),
      setActiveTab: (t) => get().setActiveTab(t),
      currentBook: get().currentBook,
      readChapterText: (chIdx: number) => {
        const { currentBook: book, modifiedChapters: mods, currentFilePath: fp, currentFileBytes: fb } = get();
        if (!book || !book.chapters[chIdx]) return Promise.resolve("");
        const ch = book.chapters[chIdx];
        if (mods[ch.href]) return Promise.resolve(mods[ch.href]);
        if (fp) return invoke<string>("read_chapter", { path: fp, href: ch.href });
        if (fb) return invoke<string>("read_chapter_bytes", { bytes: fb, href: ch.href });
        return Promise.resolve("");
      },
    };
    try {
      const resultText = await AgentToolDispatcher.executeApprovedAction(proposal, mutatingCtx);

      const updatedList = [...agentMessages];
      updatedList[msgIdx] = {
        ...targetMsg,
        actionStatus: "executed",
      };
      updatedList.push({
        id: `msg_exec_${Date.now()}`,
        role: "assistant",
        content: `✅ **Thực thi thành công**: ${resultText}`,
        timestamp: Date.now(),
      });

      set({ agentMessages: updatedList });

      if (activeProjectId) {
        get().saveActiveProject();
      }
      if (get().currentFilePath) {
        void get().autoSaveMetadataToFile();
      }
    } catch (execErr: unknown) {
      const msg = execErr instanceof Error ? execErr.message : String(execErr);
      const updatedList = [...agentMessages];
      updatedList[msgIdx] = {
        ...targetMsg,
        actionStatus: "rejected",
      };
      updatedList.push({
        id: `msg_exec_err_${Date.now()}`,
        role: "assistant",
        content: `❌ Lỗi khi thực thi đề xuất: ${msg}`,
        timestamp: Date.now(),
      });
      set({ agentMessages: updatedList });
    }
  },

  clearAgentChat: () => {
    set({ agentMessages: [] });
  },
}));
