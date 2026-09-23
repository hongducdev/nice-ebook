import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { STYLE_PRESETS, StylePreset } from "../presets/styles";
import { AiService } from "../services/aiService";

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

export interface AppState {
  // Navigation
  activeTab: "books" | "presets" | "editor" | "reader" | "ai" | "settings";
  setActiveTab: (tab: "books" | "presets" | "editor" | "reader" | "ai" | "settings") => void;

  // Book State
  currentBook: EpubMetadata | null;
  currentFilePath: string | null;
  isLoadingBook: boolean;
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

  // Actions
  loadBookFromPath: (filePath: string) => Promise<boolean>;
  loadBookFromBytes: (bytes: number[]) => Promise<boolean>;
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
  }) => void;
  selectGateway: (gw: DetectedGateway | null) => void;
  setSelectedModel: (model: string | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  activeTab: "books",
  setActiveTab: (tab) => set({ activeTab: tab }),

  currentBook: null,
  currentFilePath: null,
  isLoadingBook: false,
  activeChapterIndex: 0,
  setActiveChapterIndex: (idx) => set({ activeChapterIndex: idx }),

  jevDecision: null,
  isAnalyzingJev: false,

  gateways: [],
  isScanningGateways: false,
  activeGateway: null,
  selectedModel: null,
  isAiGenerating: false,

  activePresetId: "classic-hardcover",
  activePreset: STYLE_PRESETS.find((p) => p.id === "classic-hardcover") || STYLE_PRESETS[0],
  customCss: (STYLE_PRESETS.find((p) => p.id === "classic-hardcover") || STYLE_PRESETS[0]).cssTemplate,
  fontSize: 16,
  textAlign: "justify",
  dropCaps: true,
  lineHeight: 1.75,
  firstLineIndent: "2em",
  sceneDivider: "♦ ♦ ♦",

  loadBookFromPath: async (filePath: string) => {
    set({ isLoadingBook: true });
    try {
      const meta = await invoke<EpubMetadata>("read_epub", { path: filePath });
      set({
        currentBook: meta,
        currentFilePath: filePath,
        isLoadingBook: false,
        activeChapterIndex: 0,
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
    set({ isLoadingBook: true });
    try {
      const meta = await invoke<EpubMetadata>("read_epub_bytes", { bytes });
      set({
        currentBook: meta,
        currentFilePath: null,
        isLoadingBook: false,
        activeChapterIndex: 0,
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
    set({
      activePresetId: preset.id,
      activePreset: preset,
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
    set({
      activeGateway: gw,
      selectedModel: gw && gw.models.length > 0 ? gw.models[0] : null,
    });
  },

  setSelectedModel: (model) => {
    set({ selectedModel: model });
  },
}));
