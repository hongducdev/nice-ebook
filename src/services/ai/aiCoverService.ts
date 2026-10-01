import { invoke } from "@tauri-apps/api/core";
import { BookMetadataService } from "../metadata/bookMetadataService";

export type CoverArtStyleId =
  | "oil-painting"
  | "xianxia-fantasy"
  | "cyberpunk-scifi"
  | "anime-lightnovel"
  | "ink-wash"
  | "mystery-noir"
  | "vintage-leather"
  | "watercolor"
  | "epic-fantasy"
  | "minimalist-vector";

/**
 * Typography faces offered by the cover studio.
 *
 * These are deliberately restricted to families this app actually loads
 * (`index.html` pulls Literata / Lora / Merriweather / Be Vietnam Pro / Inter via
 * Google Fonts). Canvas silently substitutes an unavailable family with its
 * generic fallback, so offering an unloaded font would make several options
 * render identically while appearing to work.
 */
export type CoverFontFamily = "literata" | "lora" | "merriweather" | "inter" | "be-vietnam";

export interface CoverStylePreset {
  id: CoverArtStyleId;
  name: string;
  category: string;
  description: string;
  icon: string;
  promptModifier: string;
  negativeModifier?: string;
  suggestedFont: CoverFontFamily;
  defaultTextColor: string;
}

export type CoverEngineId = "pollinations" | "siliconflow" | "dall-e-3" | "custom";

export interface CoverEngineInfo {
  id: CoverEngineId;
  name: string;
  description: string;
  badge: string;
  requiresKey: boolean;
  defaultModel: string;
  availableModels: string[];
}

export interface CoverTypographyOptions {
  enabled: boolean;
  title: string;
  author: string;
  subtitle?: string;
  fontFamily: CoverFontFamily;
  position: "classic-top" | "centered" | "modern-bottom";
  textColor: string; // hex color e.g. #F5D77F
  hasBackdropGradient: boolean; // dark subtle gradient band for contrast
  hasDropShadow: boolean;
  scale?: number; // 0.8 to 1.3
}

export interface GeneratedCoverItem {
  id: string;
  engine: CoverEngineId;
  styleId: CoverArtStyleId;
  rawImageUrl: string;
  rawDataUrl: string; // Safe Base64 Data URL, never taints canvas
  finalDataUrl: string; // Composite with or without typography
  prompt: string;
  createdAt: number;
  typography: CoverTypographyOptions;
}

export interface GenerateCoverRequest {
  engine: CoverEngineId;
  prompt: string;
  styleId: CoverArtStyleId;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  seed?: number;
  signal?: AbortSignal;
}

export const COVER_ENGINES: CoverEngineInfo[] = [
  {
    id: "pollinations",
    name: "Pollinations AI (Khuyên dùng)",
    description: "Miễn phí 100% • Không cần API Key • Tạo ảnh tức thì với FLUX & Turbo",
    badge: "Miễn Phí",
    requiresKey: false,
    defaultModel: "flux",
    availableModels: ["flux", "turbo"],
  },
  {
    id: "siliconflow",
    name: "SiliconFlow (FLUX.1)",
    description: "Mô hình FLUX.1 & SD 3.5 qua SiliconCloud tốc độ cao, giá rẻ",
    badge: "SiliconCloud",
    requiresKey: true,
    defaultModel: "black-forest-labs/FLUX.1-schnell",
    availableModels: [
      "black-forest-labs/FLUX.1-schnell",
      "black-forest-labs/FLUX.1-dev",
      "stabilityai/stable-diffusion-3-5-large",
    ],
  },
  {
    id: "dall-e-3",
    name: "OpenAI DALL-E 3",
    description: "Chất lượng hình ảnh đỉnh cao, bố cục nghệ thuật tinh tế từ OpenAI",
    badge: "OpenAI",
    requiresKey: true,
    defaultModel: "dall-e-3",
    availableModels: ["dall-e-3", "dall-e-2"],
  },
  {
    id: "custom",
    name: "Custom OpenAI-Compatible",
    description: "Tùy chỉnh Endpoint /v1/images/generations của bên thứ 3 hoặc Local",
    badge: "Tùy biến",
    requiresKey: false,
    defaultModel: "flux",
    availableModels: ["flux", "sdxl", "default"],
  },
];

export const COVER_STYLE_PRESETS: CoverStylePreset[] = [
  {
    id: "oil-painting",
    name: "Sơn Dầu Cổ Điển",
    category: "Văn học & Kinh điển",
    description: "Bút pháp sơn dầu dày dặn, ánh sáng Rembrandt, kiệt tác bảo tàng",
    icon: "🎨",
    promptModifier:
      "masterpiece oil painting, rich impasto brushwork, dramatic chiaroscuro lighting, warm museum tones, fine art canvas texture, classical novel book cover art",
    suggestedFont: "literata",
    defaultTextColor: "#F5D77F", // Golden warm
  },
  {
    id: "xianxia-fantasy",
    name: "Tiên Hiệp & Huyền Huyễn",
    category: "Truyện mạng & Cổ phong Á Đông",
    description: "Non nước kỳ ảo, mây lành bồng bềnh, rồng thần viễn cổ, phong thái phương Đông",
    icon: "🐉",
    promptModifier:
      "ethereal oriental fantasy, floating celestial mountains, mystical glowing mist, majestic dragon silhouette, flowing celestial silk, breathtaking wuxia atmosphere, vibrant magical aura",
    suggestedFont: "lora",
    defaultTextColor: "#FFFFFF",
  },
  {
    id: "cyberpunk-scifi",
    name: "Cyberpunk & Viễn Tưởng",
    category: "Khoa học & Tương lai",
    description: "Ánh sáng neon viễn tưởng, thành phố tương lai, công nghệ cao, ánh sáng điện ảnh",
    icon: "🚀",
    promptModifier:
      "cinematic sci-fi book cover, futuristic cyberpunk megalopolis, glowing neon holographic lights, rain reflections, volumetric atmospheric haze, octane render, 8k concept art",
    suggestedFont: "inter",
    defaultTextColor: "#00F2FE", // Cyan neon
  },
  {
    id: "anime-lightnovel",
    name: "Anime & Light Novel",
    category: "Nhật Bản & Manga",
    description: "Phong cách Makoto Shinkai rực rỡ, bầu trời bao la, mây dạ quang, nét vẽ tinh tế",
    icon: "🌸",
    promptModifier:
      "gorgeous anime illustration, Makoto Shinkai aesthetic, luminous clouds, radiant sunset sky, vibrant colors, emotional and poetic anime light novel cover art",
    suggestedFont: "be-vietnam",
    defaultTextColor: "#FFFFFF",
  },
  {
    id: "ink-wash",
    name: "Thủy Mặc Cổ Phong",
    category: "Phương Đông & Kiếm hiệp",
    description: "Nét mực đen truyền thống trên giấy xuyến, thiền định hoang sơ, mây núi nhạt nhòa",
    icon: "📜",
    promptModifier:
      "traditional Chinese ink wash painting, sumi-e style, Shan Shui mountains, misty waterfall, minimalist zen composition, elegant calligraphic ink gradients on Xuan paper",
    suggestedFont: "literata",
    defaultTextColor: "#F5D77F",
  },
  {
    id: "mystery-noir",
    name: "Trinh Thám & Noir",
    category: "Bí ẩn & Giật gân",
    description: "Đổ bóng sâu thẳm, đường phố mưa đêm dưới ánh đèn vàng, bóng hình bí ẩn",
    icon: "🕵️",
    promptModifier:
      "moody noir detective novel cover, dramatic high-contrast lighting, deep hard shadows, lone trenchcoat silhouette in misty cobblestone alley, 1940s vintage mystery atmosphere",
    suggestedFont: "inter",
    defaultTextColor: "#FFFFFF",
  },
  {
    id: "vintage-leather",
    name: "Bìa Da Mạ Vàng Cổ",
    category: "Sưu tầm & Cổ thư",
    description: "Bìa sách da cổ màu nâu sẫm, họa tiết vàng kim dập nổi hoàng gia, hoa văn quý tộc",
    icon: "📖",
    promptModifier:
      "antique vintage leather book cover, ornate gold foil embossing, regal filigree borders, weathered dark brown cracked leather texture, ancient grimoire aesthetic",
    suggestedFont: "literata",
    defaultTextColor: "#F5D77F",
  },
  {
    id: "watercolor",
    name: "Màu Nước Thơ Mộng",
    category: "Lãng mạn & Tản văn",
    description: "Vệt màu nước pastel loang nhẹ nhàng, cánh hoa bay lãng mạn, cảm xúc êm đềm",
    icon: "💖",
    promptModifier:
      "delicate pastel watercolor painting, soft blooming pigment edges, romantic floral petals fluttering in gentle breeze, poetic nostalgic mood, clean book cover composition",
    suggestedFont: "be-vietnam",
    defaultTextColor: "#1A1A1A",
  },
  {
    id: "epic-fantasy",
    name: "Kỳ Ảo Tây Phương",
    category: "Fantasy & Sử thi",
    description: "Lâu đài cổ tích, rừng thần thoại, cổ ngữ phát sáng, ánh sáng huyền bí",
    icon: "🪄",
    promptModifier:
      "epic fantasy book cover, ancient enchanted castle amidst mystical glowing forest, arcane runes, dramatic cloudy skies, Tolkien inspired, sweeping cinematic composition",
    suggestedFont: "literata",
    defaultTextColor: "#F5D77F",
  },
  {
    id: "minimalist-vector",
    name: "Đồ Họa Tối Giản",
    category: "Hiện đại & Kỹ năng",
    description: "Nghệ thuật đường nét vector tinh tế, không gian âm, bố cục Thụy Sĩ sang trọng",
    icon: "✒️",
    promptModifier:
      "modern minimalist book cover art, clever negative space silhouette, bold geometric shapes, Swiss graphic design aesthetic, clean striking symbolic illustration",
    suggestedFont: "inter",
    defaultTextColor: "#FFFFFF",
  },
];

/**
 * Returns normalized width & height suitable for the provider's API.
 * Ebook standard aspect ratio is 2:3.
 */
export function getEngineDimensions(
  engine: CoverEngineId,
  _model?: string
): { width: number; height: number; sizeString: string } {
  switch (engine) {
    case "pollinations":
      return { width: 768, height: 1152, sizeString: "768x1152" };
    case "siliconflow":
      return { width: 768, height: 1152, sizeString: "768x1152" };
    case "dall-e-3":
      // DALL-E 3 supports 1024x1792 (portrait) or 1024x1024 (square)
      return { width: 1024, height: 1792, sizeString: "1024x1792" };
    case "custom":
    default:
      return { width: 768, height: 1152, sizeString: "768x1152" };
  }
}

/**
 * Cleans user keywords for safe visual prompt building.
 */
function cleanPromptTerm(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\[\]\(\)\{\}\<\>\\\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Builds an evocative, detailed English prompt for cover art generation.
 */
export function buildCoverPrompt(params: {
  title: string;
  author?: string;
  genre?: string;
  description?: string;
  styleId: CoverArtStyleId;
  customIdea?: string;
}): string {
  const { title, genre, description, styleId, customIdea } = params;

  const preset =
    COVER_STYLE_PRESETS.find((p) => p.id === styleId) || COVER_STYLE_PRESETS[0];

  const cleanTitle = cleanPromptTerm(title);
  const cleanGenre = cleanPromptTerm(genre || "");
  const cleanDesc = cleanPromptTerm(description || "").slice(0, 150);
  const cleanIdea = cleanPromptTerm(customIdea || "");

  const parts: string[] = [];

  // Style foundation
  parts.push(preset.promptModifier);

  // Subject / Theme derived from book info
  if (cleanIdea) {
    parts.push(`featuring ${cleanIdea}`);
  } else {
    const themeElements: string[] = [];
    if (cleanTitle) {
      themeElements.push(`visual concept of "${cleanTitle}"`);
    }
    if (cleanGenre) {
      themeElements.push(`in the realm of ${cleanGenre}`);
    }
    if (themeElements.length > 0) {
      parts.push(`depicting a compelling ${themeElements.join(", ")}`);
    }
    if (cleanDesc) {
      parts.push(`story atmosphere inspired by: ${cleanDesc}`);
    }
  }

  // Compositional invariants for book covers:
  // - 2:3 vertical aspect ratio
  // - Leave uncluttered space for book title typography
  // - High aesthetic quality, sharp details
  // - Negative constraints (no distorted text, no watermarks)
  parts.push(
    "vertical 2:3 aspect ratio, elegant book cover composition with clean space for title, atmospheric lighting, high fidelity, 8k resolution, award winning illustration"
  );
  parts.push("no text, no letters, no watermark, no signatures, no blurry, no extra limbs");

  return parts.join(", ");
}

/**
 * Enhances prompt with an LLM via active gateway or configured provider.
 */
export async function enhancePromptWithAi(options: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  bookTitle: string;
  author?: string;
  genre?: string;
  description?: string;
  styleName: string;
  currentPrompt: string;
}): Promise<string> {
  const {
    baseUrl,
    apiKey,
    model,
    bookTitle,
    author,
    genre,
    description,
    styleName,
    currentPrompt,
  } = options;

  const systemInstruction = `You are a visionary art director specializing in international bestselling book covers.
Given the book metadata and art style, write a single, highly visual, evocative prompt in English for text-to-image AI (such as Midjourney/FLUX).
Rules:
1. Focus on vivid focal subjects, lighting, mood, color palette, and vertical 2:3 book cover composition.
2. Emphasize clean negative space at the top or bottom for typography.
3. Crucial: The artwork must NOT include any text, letters, or words on the image itself.
4. Output ONLY the refined English prompt. Do NOT wrap in quotes, markdown, or commentary.`;

  const userContent = `Book Title: "${bookTitle}"
Author: "${author || "Unknown"}"
Genre: "${genre || "Literature"}"
Synopsis: "${description || "None"}"
Art Style: "${styleName}"
Current Draft Prompt: "${currentPrompt}"

Please generate the optimal image generation prompt:`;

  const isTauri = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);

  if (isTauri) {
    try {
      const resp = await invoke<string>("call_ai_completion", {
        options: {
          base_url: baseUrl,
          api_key: apiKey || null,
          model,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userContent },
          ],
          temperature: 0.7,
          max_tokens: 300,
          timeout_secs: 25,
        },
      });
      return resp.trim();
    } catch (err) {
      console.warn("Tauri call_ai_completion failed for prompt enhancement:", err);
    }
  }

  // Browser / fetch fallback
  try {
    let url = baseUrl.trim().replace(/\/+$/, "");
    if (!url.endsWith("/chat/completions")) {
      url = `${url}/chat/completions`;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey && apiKey.trim()) {
      headers["Authorization"] = `Bearer ${apiKey.trim()}`;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userContent },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (content && typeof content === "string") {
        return content.trim();
      }
    }
  } catch (err) {
    console.warn("Fetch fallback prompt enhancement failed:", err);
  }

  // If AI enhancement fails, return current prompt safely
  return currentPrompt;
}

interface ImageApiResponse {
  images?: Array<{ url?: string }>;
  data?: Array<{ url?: string; b64_json?: string }>;
  output?: string[];
  results?: Array<{ url?: string }>;
  message?: string;
  error?: { message?: string };
}

export class AiCoverService {
  /**
   * Generates a book cover image and returns both remote URL and safe Base64 Data URL.
   */
  public static async generateCoverImage(
    request: GenerateCoverRequest
  ): Promise<{ rawImageUrl: string; rawDataUrl: string }> {
    const { engine, prompt, apiKey, baseUrl, model, seed = Math.floor(Math.random() * 1000000), signal } =
      request;

    // Honoured before every request and re-checked after each await: the Tauri IPC
    // calls cannot be cancelled mid-flight, so this is what makes the "Hủy" button
    // in the AI cover studio actually stop the flow (and suppress the success toast).
    const throwIfAborted = () => {
      if (signal?.aborted) throw new DOMException("Đã hủy tạo ảnh bìa", "AbortError");
    };
    throwIfAborted();

    const dimensions = getEngineDimensions(engine, model);

    if (engine === "pollinations") {
      // Free zero-config Pollinations.ai API
      const chosenModel = model || "flux";
      const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
        prompt
      )}?width=${dimensions.width}&height=${dimensions.height}&model=${encodeURIComponent(
        chosenModel
      )}&seed=${seed}&nologo=true`;

      // Image endpoints routinely need 20-30s, so ask for a longer timeout.
      const dataUrl = await BookMetadataService.fetchCoverDataUrl(pollinationsUrl, {
        signal,
        timeoutSecs: 60,
      });
      throwIfAborted();
      return {
        rawImageUrl: pollinationsUrl,
        rawDataUrl: dataUrl,
      };
    }

    if (engine === "siliconflow") {
      if (!apiKey || !apiKey.trim()) {
        throw new Error("Vui lòng nhập API Key của SiliconFlow (SiliconCloud)");
      }

      const endpoint = baseUrl
        ? `${baseUrl.replace(/\/+$/, "")}/images/generations`
        : "https://api.siliconflow.cn/v1/images/generations";

      const chosenModel = model || "black-forest-labs/FLUX.1-schnell";
      const payload = {
        model: chosenModel,
        prompt,
        image_size: dimensions.sizeString,
        num_inference_steps: 20,
        seed,
      };

      const rawJson = await this.callImageApi(endpoint, apiKey, payload, signal);
      let parsed: ImageApiResponse;
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        throw new Error(`Phản hồi từ SiliconFlow không phải JSON hợp lệ: ${rawJson.slice(0, 150)}`);
      }

      const imageUrl =
        parsed?.images?.[0]?.url ||
        parsed?.data?.[0]?.url ||
        parsed?.output?.[0] ||
        parsed?.results?.[0]?.url;

      if (!imageUrl) {
        throw new Error(
          parsed?.message || parsed?.error?.message || "Không nhận được URL ảnh từ SiliconFlow"
        );
      }

      const dataUrl = await BookMetadataService.fetchCoverDataUrl(imageUrl, {
        signal,
        timeoutSecs: 60,
      });
      throwIfAborted();
      return {
        rawImageUrl: imageUrl,
        rawDataUrl: dataUrl,
      };
    }

    if (engine === "dall-e-3") {
      if (!apiKey || !apiKey.trim()) {
        throw new Error("Vui lòng nhập API Key OpenAI để sử dụng DALL-E 3");
      }

      const endpoint = baseUrl
        ? `${baseUrl.replace(/\/+$/, "")}/images/generations`
        : "https://api.openai.com/v1/images/generations";

      const chosenModel = model || "dall-e-3";
      const payload = {
        model: chosenModel,
        prompt,
        size: dimensions.sizeString,
        quality: "standard",
        response_format: "b64_json",
        n: 1,
      };

      const rawJson = await this.callImageApi(endpoint, apiKey, payload, signal);
      let parsed: ImageApiResponse;
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        throw new Error(`Phản hồi từ OpenAI không phải JSON hợp lệ: ${rawJson.slice(0, 150)}`);
      }

      const b64 = parsed?.data?.[0]?.b64_json;
      if (b64) {
        const dataUrl = `data:image/png;base64,${b64}`;
        return {
          rawImageUrl: dataUrl,
          rawDataUrl: dataUrl,
        };
      }

      const imageUrl = parsed?.data?.[0]?.url;
      if (imageUrl) {
        const dataUrl = await BookMetadataService.fetchCoverDataUrl(imageUrl, {
          signal,
          timeoutSecs: 60,
        });
        throwIfAborted();
        return {
          rawImageUrl: imageUrl,
          rawDataUrl: dataUrl,
        };
      }

      throw new Error(
        parsed?.error?.message || parsed?.message || "Không nhận được dữ liệu ảnh từ OpenAI"
      );
    }

    if (engine === "custom") {
      if (!baseUrl) {
        throw new Error("Vui lòng cung cấp Base URL cho dịch vụ tạo ảnh tùy chỉnh");
      }

      let endpoint = baseUrl.trim().replace(/\/+$/, "");
      if (!endpoint.endsWith("/images/generations")) {
        endpoint = `${endpoint}/images/generations`;
      }

      const payload = {
        model: model || "flux",
        prompt,
        size: dimensions.sizeString,
        response_format: "url",
      };

      const rawJson = await this.callImageApi(endpoint, apiKey, payload, signal);
      let parsed: ImageApiResponse;
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        throw new Error(`Phản hồi từ API tùy chỉnh không phải JSON hợp lệ: ${rawJson.slice(0, 150)}`);
      }

      const imageUrl =
        parsed?.data?.[0]?.url ||
        parsed?.images?.[0]?.url ||
        parsed?.data?.[0]?.b64_json;

      if (!imageUrl) {
        throw new Error("Không nhận được kết quả ảnh từ API tùy chỉnh");
      }

      if (imageUrl.startsWith("data:") || imageUrl.length > 500) {
        const dataUrl = imageUrl.startsWith("data:")
          ? imageUrl
          : `data:image/png;base64,${imageUrl}`;
        return { rawImageUrl: dataUrl, rawDataUrl: dataUrl };
      }

      const dataUrl = await BookMetadataService.fetchCoverDataUrl(imageUrl, {
        signal,
        timeoutSecs: 60,
      });
      throwIfAborted();
      return { rawImageUrl: imageUrl, rawDataUrl: dataUrl };
    }

    throw new Error(`Động cơ tạo ảnh không hợp lệ: ${engine}`);
  }

  /**
   * Helper that executes POST image generation requests through Tauri Rust command
   * to bypass CORS, or falls back to fetch in web environments.
   */
  private static async callImageApi(
    endpoint: string,
    apiKey?: string,
    payload?: any,
    signal?: AbortSignal
  ): Promise<string> {
    if (signal?.aborted) throw new DOMException("Đã hủy tạo ảnh bìa", "AbortError");

    const isTauri = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);

    if (isTauri) {
      try {
        const raw = await invoke<string>("call_image_generation_api", {
          endpoint,
          apiKey: apiKey || null,
          payloadJson: JSON.stringify(payload || {}),
          timeoutSecs: 60,
        });
        if (signal?.aborted) throw new DOMException("Đã hủy tạo ảnh bìa", "AbortError");
        return raw;
      } catch (err: unknown) {
        // Never rewrite an abort into a generic server error.
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Lỗi máy chủ tạo ảnh: ${msg}`);
      }
    }

    // Web / browser fetch fallback
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey && apiKey.trim()) {
      headers["Authorization"] = `Bearer ${apiKey.trim()}`;
    }

    // Keep the 60s ceiling while still honouring caller cancellation.
    const timeoutSignal = AbortSignal.timeout(60000);
    const requestSignal =
      signal && typeof AbortSignal.any === "function"
        ? AbortSignal.any([signal, timeoutSignal])
        : signal ?? timeoutSignal;

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload || {}),
      signal: requestSignal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    return await res.text();
  }

  /**
   * Resolves the canvas font stack for a family.
   *
   * Only families the app actually loads are listed first; the fallbacks keep
   * Vietnamese diacritics rendering if a webfont has not arrived yet.
   */
  public static getFontFamilyCss(family: CoverFontFamily): string {
    switch (family) {
      case "literata":
        return "'Literata', 'Lora', Georgia, 'Times New Roman', serif";
      case "lora":
        return "'Lora', 'Literata', Georgia, 'Times New Roman', serif";
      case "merriweather":
        return "'Merriweather', 'Literata', Georgia, 'Times New Roman', serif";
      case "inter":
        return "'Inter', 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      case "be-vietnam":
      default:
        return "'Be Vietnam Pro', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    }
  }

  /**
   * Composites typography (Book Title, Author, Subtitle) onto the raw cover artwork.
   *
   * Invariants guaranteed:
   * 1. Awaits `document.fonts.ready` so fonts are loaded before drawing.
   * 2. Draws ONLY from base64 Data URLs, never remote URLs, preventing tainted canvas.
   * 3. Preserves aspect ratio 2:3 and produces a crisp high-res output.
   */
  public static async renderTypographyOnCover(
    rawDataUrl: string,
    typography: CoverTypographyOptions
  ): Promise<string> {
    if (!typography.enabled) {
      return rawDataUrl;
    }

    if (typeof window === "undefined" || !window.document) {
      return rawDataUrl;
    }

    // Ensure the chosen face is actually loaded before drawing.
    //
    // `document.fonts.ready` alone only settles faces the document already uses;
    // a cover face is not in use until we draw it, so it must be requested
    // explicitly. Without this the canvas silently falls back to a generic serif /
    // sans and every "font" option renders identically.
    if (document.fonts) {
      const fontCss = this.getFontFamilyCss(typography.fontFamily);
      const families = fontCss
        .split(",")
        .map((part) => part.replace(/['"]/g, "").trim())
        .filter((family) => family && !["serif", "sans-serif", "cursive", "monospace"].includes(family));

      try {
        await Promise.all([
          ...families.map((family) => document.fonts.load(`bold 64px "${family}"`)),
          document.fonts.ready,
        ]);
      } catch (fontErr) {
        // A failed webfont must not abort the composition; the fallbacks in
        // `fontCss` still give readable output.
        console.warn("Could not load cover font faces; using fallbacks:", fontErr);
      }
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        try {
          const width = img.naturalWidth || 768;
          const height = img.naturalHeight || 1152;

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            return resolve(rawDataUrl);
          }

          // 1. Draw raw background artwork
          ctx.drawImage(img, 0, 0, width, height);

          // 2. Subtle Backdrop Gradient if enabled (protects text legibility)
          if (typography.hasBackdropGradient) {
            if (typography.position === "classic-top") {
              const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.45);
              topGrad.addColorStop(0, "rgba(0, 0, 0, 0.75)");
              topGrad.addColorStop(0.7, "rgba(0, 0, 0, 0.35)");
              topGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
              ctx.fillStyle = topGrad;
              ctx.fillRect(0, 0, width, height * 0.45);

              const botGrad = ctx.createLinearGradient(0, height * 0.75, 0, height);
              botGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
              botGrad.addColorStop(0.5, "rgba(0, 0, 0, 0.5)");
              botGrad.addColorStop(1, "rgba(0, 0, 0, 0.8)");
              ctx.fillStyle = botGrad;
              ctx.fillRect(0, height * 0.75, width, height * 0.25);
            } else if (typography.position === "modern-bottom") {
              const botGrad = ctx.createLinearGradient(0, height * 0.45, 0, height);
              botGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
              botGrad.addColorStop(0.35, "rgba(0, 0, 0, 0.55)");
              botGrad.addColorStop(1, "rgba(0, 0, 0, 0.9)");
              ctx.fillStyle = botGrad;
              ctx.fillRect(0, height * 0.45, width, height * 0.55);
            } else {
              // Centered
              const midGrad = ctx.createRadialGradient(
                width / 2,
                height / 2,
                width * 0.2,
                width / 2,
                height / 2,
                width * 0.65
              );
              midGrad.addColorStop(0, "rgba(0, 0, 0, 0.65)");
              midGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
              ctx.fillStyle = midGrad;
              ctx.fillRect(0, 0, width, height);
            }
          }

          // 3. Setup text styles
          const fontCss = this.getFontFamilyCss(typography.fontFamily);
          const textColor = typography.textColor || "#FFFFFF";
          const scale = typography.scale || 1.0;

          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          // Shadow setup
          if (typography.hasDropShadow) {
            ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
            ctx.shadowBlur = Math.round(14 * (width / 768));
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = Math.round(4 * (width / 768));
          } else {
            ctx.shadowColor = "transparent";
          }

          // Split title into wrapped lines
          const baseTitleSize = Math.round(44 * (width / 768) * scale);
          const titleLines = wrapTextLines(
            ctx,
            typography.title.toUpperCase(),
            width * 0.82,
            baseTitleSize,
            fontCss
          );

          // Calculate Y coordinates according to layout position
          let titleCenterY = height * 0.22;
          let authorY = height * 0.88;
          let subtitleY = height * 0.13;

          if (typography.position === "modern-bottom") {
            titleCenterY = height * 0.72;
            subtitleY = height * 0.63;
            authorY = height * 0.88;
          } else if (typography.position === "centered") {
            titleCenterY = height * 0.48;
            subtitleY = height * 0.38;
            authorY = height * 0.64;
          }

          // Draw Subtitle if present
          if (typography.subtitle && typography.subtitle.trim()) {
            const subSize = Math.round(16 * (width / 768) * scale);
            ctx.font = `600 ${subSize}px ${fontCss}`;
            ctx.fillStyle = textColor;
            ctx.letterSpacing = "4px";
            ctx.fillText(typography.subtitle.toUpperCase(), width / 2, subtitleY);
          }

          // Draw Title lines
          ctx.font = `bold ${baseTitleSize}px ${fontCss}`;
          ctx.fillStyle = textColor;
          ctx.letterSpacing = "2px";

          const lineHeight = baseTitleSize * 1.25;
          const startTitleY =
            titleCenterY - ((titleLines.length - 1) * lineHeight) / 2;

          titleLines.forEach((line, idx) => {
            ctx.fillText(line, width / 2, startTitleY + idx * lineHeight);
          });

          // Draw Author
          if (typography.author && typography.author.trim()) {
            const authorSize = Math.round(20 * (width / 768) * scale);
            ctx.font = `500 ${authorSize}px ${fontCss}`;
            ctx.fillStyle = textColor;
            ctx.letterSpacing = "3px";
            ctx.fillText(typography.author.toUpperCase(), width / 2, authorY);
          }

          // Export as high-quality JPEG base64 Data URL
          const finalDataUrl = canvas.toDataURL("image/jpeg", 0.92);
          resolve(finalDataUrl);
        } catch (canvasErr) {
          console.error("Canvas typography composition error:", canvasErr);
          resolve(rawDataUrl);
        }
      };

      img.onerror = (err) => {
        console.error("Image loading failed for typography composition:", err);
        resolve(rawDataUrl);
      };

      img.src = rawDataUrl;
    });
  }
}

/**
 * Helper to split text into wrapped lines that fit within max width.
 */
function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontSize: number,
  fontFamily: string
): string[] {
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [text];
}
