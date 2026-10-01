import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AiCoverService,
  COVER_STYLE_PRESETS,
  COVER_ENGINES,
  getEngineDimensions,
  buildCoverPrompt,
  enhancePromptWithAi,
} from "./aiCoverService";
import { BookMetadataService } from "../metadata/bookMetadataService";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("../metadata/bookMetadataService", () => ({
  BookMetadataService: {
    fetchCoverDataUrl: vi.fn(),
  },
}));

describe("AiCoverService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).window = {
      __TAURI_INTERNALS__: {},
    };
  });

  describe("Presets & Engine Catalogs", () => {
    it("should provide 10 distinct cover art style presets", () => {
      expect(COVER_STYLE_PRESETS).toHaveLength(10);
      const ids = COVER_STYLE_PRESETS.map((p) => p.id);
      expect(ids).toContain("oil-painting");
      expect(ids).toContain("xianxia-fantasy");
      expect(ids).toContain("cyberpunk-scifi");
      expect(ids).toContain("anime-lightnovel");
      expect(ids).toContain("ink-wash");
      expect(ids).toContain("mystery-noir");
      expect(ids).toContain("vintage-leather");
      expect(ids).toContain("watercolor");
      expect(ids).toContain("epic-fantasy");
      expect(ids).toContain("minimalist-vector");

      COVER_STYLE_PRESETS.forEach((preset) => {
        expect(preset.name).toBeTruthy();
        expect(preset.promptModifier).toBeTruthy();
        expect(preset.suggestedFont).toBeTruthy();
        expect(preset.defaultTextColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });

    it("should provide 4 distinct generation engines with Pollinations as free default", () => {
      expect(COVER_ENGINES).toHaveLength(4);
      const pollinations = COVER_ENGINES.find((e) => e.id === "pollinations");
      expect(pollinations).toBeDefined();
      expect(pollinations?.requiresKey).toBe(false);

      const sf = COVER_ENGINES.find((e) => e.id === "siliconflow");
      expect(sf?.requiresKey).toBe(true);

      const dalle = COVER_ENGINES.find((e) => e.id === "dall-e-3");
      expect(dalle?.requiresKey).toBe(true);
    });

    it("should return normalized 2:3 aspect ratio dimensions per provider", () => {
      expect(getEngineDimensions("pollinations")).toEqual({
        width: 768,
        height: 1152,
        sizeString: "768x1152",
      });
      expect(getEngineDimensions("siliconflow")).toEqual({
        width: 768,
        height: 1152,
        sizeString: "768x1152",
      });
      expect(getEngineDimensions("dall-e-3")).toEqual({
        width: 1024,
        height: 1792,
        sizeString: "1024x1792",
      });
      expect(getEngineDimensions("custom")).toEqual({
        width: 768,
        height: 1152,
        sizeString: "768x1152",
      });
    });
  });

  describe("buildCoverPrompt", () => {
    it("should build prompt combining title, genre, description and style modifier", () => {
      const prompt = buildCoverPrompt({
        title: "Hoàng Hôn Sau Khói Lửa",
        genre: "Tiểu thuyết chiến tranh",
        description: "Câu chuyện cảm động về tình người trong thời loạn lạc",
        styleId: "oil-painting",
      });

      expect(prompt).toContain("masterpiece oil painting");
      expect(prompt).toContain("Hoàng Hôn Sau Khói Lửa");
      expect(prompt).toContain("Tiểu thuyết chiến tranh");
      expect(prompt).toContain("vertical 2:3 aspect ratio");
      expect(prompt).toContain("no text");
    });

    it("should incorporate customIdea when specified", () => {
      const prompt = buildCoverPrompt({
        title: "Bí Mật Rừng Sâu",
        styleId: "mystery-noir",
        customIdea: "Một chiếc đèn bão cổ phát sáng giữa sương mù dày đặc",
      });

      expect(prompt).toContain("moody noir");
      expect(prompt).toContain("Một chiếc đèn bão cổ phát sáng giữa sương mù dày đặc");
      expect(prompt).toContain("no text");
    });

    it("should sanitize dirty characters in prompt", () => {
      const prompt = buildCoverPrompt({
        title: "[dtv-ebook.com] Sách Hay (Full)",
        genre: "Kỳ ảo <VIP>",
        styleId: "epic-fantasy",
      });

      expect(prompt).not.toContain("[");
      expect(prompt).not.toContain("]");
      expect(prompt).not.toContain("<");
      expect(prompt).not.toContain(">");
      expect(prompt).toContain("dtv-ebook.com Sách Hay Full");
    });
  });

  describe("enhancePromptWithAi", () => {
    it("should return enhanced prompt from completion response", async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockResolvedValueOnce(
        "A magnificent golden dragon soaring through swirling jade clouds, ancient pagoda silhouette, volumetric lighting, vertical composition"
      );

      const enhanced = await enhancePromptWithAi({
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: "sk-test",
        model: "deepseek-chat",
        bookTitle: "Huyền Huyễn Kỳ Thư",
        genre: "Tiên hiệp",
        styleName: "Tiên Hiệp & Huyền Huyễn",
        currentPrompt: "dragon in clouds",
      });

      expect(enhanced).toContain("magnificent golden dragon");
    });

    it("should fall back gracefully to currentPrompt if enhancement fails", async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockRejectedValueOnce(new Error("Network timeout"));

      const result = await enhancePromptWithAi({
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: "sk-test",
        model: "deepseek-chat",
        bookTitle: "Test Book",
        styleName: "Oil Painting",
        currentPrompt: "original prompt fallback",
      });

      expect(result).toBe("original prompt fallback");
    });
  });

  describe("generateCoverImage", () => {
    it("should generate cover with Pollinations without requiring API key", async () => {
      vi.mocked(BookMetadataService.fetchCoverDataUrl).mockResolvedValueOnce(
        "data:image/jpeg;base64,mockPollinationsBase64"
      );

      const res = await AiCoverService.generateCoverImage({
        engine: "pollinations",
        prompt: "A beautiful cover art",
        styleId: "oil-painting",
        model: "flux",
        seed: 4242,
      });

      expect(res.rawImageUrl).toContain("https://image.pollinations.ai/prompt/");
      expect(res.rawImageUrl).toContain("model=flux");
      expect(res.rawImageUrl).toContain("width=768");
      expect(res.rawImageUrl).toContain("height=1152");
      expect(res.rawImageUrl).toContain("seed=4242");
      expect(res.rawDataUrl).toBe("data:image/jpeg;base64,mockPollinationsBase64");
    });

    it("should throw error if SiliconFlow is called without an API key", async () => {
      await expect(
        AiCoverService.generateCoverImage({
          engine: "siliconflow",
          prompt: "test",
          styleId: "oil-painting",
          apiKey: "",
        })
      ).rejects.toThrow("Vui lòng nhập API Key của SiliconFlow");
    });

    it("should throw error if OpenAI DALL-E 3 is called without an API key", async () => {
      await expect(
        AiCoverService.generateCoverImage({
          engine: "dall-e-3",
          prompt: "test",
          styleId: "oil-painting",
          apiKey: "  ",
        })
      ).rejects.toThrow("Vui lòng nhập API Key OpenAI");
    });

    it("should handle OpenAI response with b64_json directly", async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockResolvedValueOnce(
        JSON.stringify({
          data: [{ b64_json: "dalleRawB64String" }],
        })
      );

      const res = await AiCoverService.generateCoverImage({
        engine: "dall-e-3",
        prompt: "Dall-e masterpiece",
        styleId: "minimalist-vector",
        apiKey: "sk-openai-test",
      });

      expect(res.rawDataUrl).toBe("data:image/png;base64,dalleRawB64String");
      expect(res.rawImageUrl).toBe("data:image/png;base64,dalleRawB64String");
      expect(BookMetadataService.fetchCoverDataUrl).not.toHaveBeenCalled();
    });

    it("should handle SiliconFlow response with image url", async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockResolvedValueOnce(
        JSON.stringify({
          images: [{ url: "https://cdn.siliconflow.cn/generated/img123.jpg" }],
        })
      );

      vi.mocked(BookMetadataService.fetchCoverDataUrl).mockResolvedValueOnce(
        "data:image/jpeg;base64,siliconFlowBase64"
      );

      const res = await AiCoverService.generateCoverImage({
        engine: "siliconflow",
        prompt: "FLUX masterpiece",
        styleId: "cyberpunk-scifi",
        apiKey: "sk-sf-test",
      });

      expect(res.rawImageUrl).toBe("https://cdn.siliconflow.cn/generated/img123.jpg");
      expect(res.rawDataUrl).toBe("data:image/jpeg;base64,siliconFlowBase64");
    });

    it("should throw error if SiliconFlow returns response without image URL", async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockResolvedValueOnce(
        JSON.stringify({
          error: { message: "Quota exceeded" },
        })
      );

      await expect(
        AiCoverService.generateCoverImage({
          engine: "siliconflow",
          prompt: "test",
          styleId: "oil-painting",
          apiKey: "sk-sf-test",
        })
      ).rejects.toThrow("Quota exceeded");
    });

    it("should throw error if OpenAI returns response without image URL or b64_json", async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockResolvedValueOnce(
        JSON.stringify({
          error: { message: "Invalid prompt" },
        })
      );

      await expect(
        AiCoverService.generateCoverImage({
          engine: "dall-e-3",
          prompt: "test",
          styleId: "oil-painting",
          apiKey: "sk-openai-test",
        })
      ).rejects.toThrow("Invalid prompt");
    });

    it("should handle custom engine endpoint with url format", async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockResolvedValueOnce(
        JSON.stringify({
          data: [{ url: "https://custom-ai.internal/out.png" }],
        })
      );

      vi.mocked(BookMetadataService.fetchCoverDataUrl).mockResolvedValueOnce(
        "data:image/png;base64,customBase64"
      );

      const res = await AiCoverService.generateCoverImage({
        engine: "custom",
        baseUrl: "https://my-custom-proxy.com/v1",
        prompt: "custom prompt",
        styleId: "vintage-leather",
      });

      expect(res.rawImageUrl).toBe("https://custom-ai.internal/out.png");
      expect(res.rawDataUrl).toBe("data:image/png;base64,customBase64");
    });

    it("should throw on invalid engine", async () => {
      await expect(
        AiCoverService.generateCoverImage({
          engine: "unsupported" as any,
          prompt: "test",
          styleId: "oil-painting",
        })
      ).rejects.toThrow("Động cơ tạo ảnh không hợp lệ");
    });
  });

  describe("renderTypographyOnCover", () => {
    it("should return rawDataUrl unchanged if typography is disabled", async () => {
      const raw = "data:image/jpeg;base64,rawImageData";
      const result = await AiCoverService.renderTypographyOnCover(raw, {
        enabled: false,
        title: "Test",
        author: "Author",
        fontFamily: "literata",
        position: "classic-top",
        textColor: "#FFFFFF",
        hasBackdropGradient: true,
        hasDropShadow: true,
      });

      expect(result).toBe(raw);
    });

    it("should abort before downloading when the signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        AiCoverService.generateCoverImage({
          engine: "pollinations",
          prompt: "anything",
          styleId: "oil-painting",
          signal: controller.signal,
        })
      ).rejects.toThrow(/hủy|abort/i);

      expect(BookMetadataService.fetchCoverDataUrl).not.toHaveBeenCalled();
    });

    it("should forward the abort signal and an extended timeout to the image download", async () => {
      vi.mocked(BookMetadataService.fetchCoverDataUrl).mockResolvedValueOnce(
        "data:image/jpeg;base64,ok"
      );
      const controller = new AbortController();

      await AiCoverService.generateCoverImage({
        engine: "pollinations",
        prompt: "anything",
        styleId: "oil-painting",
        signal: controller.signal,
      });

      // Without this the "Hủy" button in the cover studio is a no-op.
      expect(BookMetadataService.fetchCoverDataUrl).toHaveBeenCalledWith(
        expect.stringContaining("pollinations"),
        expect.objectContaining({ signal: controller.signal, timeoutSecs: 60 })
      );
    });
  });

  describe("Font availability", () => {
    // Families the app actually loads (index.html Google Fonts + @fontsource geist).
    // Canvas substitutes an unloaded family with its generic fallback WITHOUT
    // erroring, so an unloaded option looks like it works while rendering exactly
    // like its neighbours - this is the defect these tests exist to prevent.
    const LOADED_FAMILIES = ["Literata", "Lora", "Merriweather", "Inter", "Be Vietnam Pro", "Geist"];
    const ALL_FAMILIES = ["literata", "lora", "merriweather", "inter", "be-vietnam"] as const;

    const primaryFamilyOf = (stack: string) => stack.split(",")[0].replace(/['"]/g, "").trim();

    it("should only ever resolve to a font family the app actually loads", () => {
      for (const family of ALL_FAMILIES) {
        expect(LOADED_FAMILIES).toContain(primaryFamilyOf(AiCoverService.getFontFamilyCss(family)));
      }
    });

    it("should give every font option a visually distinct stack", () => {
      const stacks = ALL_FAMILIES.map((family) => AiCoverService.getFontFamilyCss(family));
      expect(new Set(stacks).size).toBe(ALL_FAMILIES.length);
    });

    it("should suggest a loaded font for every cover style preset", () => {
      expect(COVER_STYLE_PRESETS.length).toBeGreaterThan(0);
      for (const preset of COVER_STYLE_PRESETS) {
        const stack = AiCoverService.getFontFamilyCss(preset.suggestedFont);
        expect(LOADED_FAMILIES).toContain(primaryFamilyOf(stack));
      }
    });
  });
});
