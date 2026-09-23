import { invoke } from "@tauri-apps/api/core";
import { 
  EBOOK_STYLING_SYSTEM_PROMPT, 
  buildStylingUserPrompt, 
  AiStylingResult 
} from "./prompts/ebookStyling";
import { JevDecision } from "../stores/useAppStore";

export interface AiRequestOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  title: string;
  author: string;
  sampleText: string;
  jevGenreHint?: string;
}

export class AiService {
  public static async generateStyling(options: AiRequestOptions): Promise<{
    result: AiStylingResult;
    source: "gateway" | "jev_fallback";
    error?: string;
  }> {
    const {
      baseUrl,
      apiKey,
      model,
      temperature = 0.7,
      title,
      author,
      sampleText,
      jevGenreHint,
    } = options;

    const userPrompt = buildStylingUserPrompt(title, author, sampleText, jevGenreHint);

    // Normalize base URL
    let url = baseUrl.trim();
    if (url.endsWith("/")) url = url.slice(0, -1);
    if (!url.endsWith("/chat/completions")) {
      url = `${url}/chat/completions`;
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (apiKey && apiKey.trim().length > 0) {
        headers["Authorization"] = `Bearer ${apiKey.trim()}`;
      }

      const body = {
        model,
        messages: [
          { role: "system", content: EBOOK_STYLING_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature,
        stream: false,
      };

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI Gateway responded with status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Empty response from AI Gateway");
      }

      // Clean JSON string (remove markdown code blocks if present)
      const cleanJson = content
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      const parsed: AiStylingResult = JSON.parse(cleanJson);
      return {
        result: parsed,
        source: "gateway",
      };
    } catch (err) {
      console.warn("AI Gateway call failed, falling back to Jev Core:", err);

      // Offline Jev Core Fallback
      const jev: JevDecision = await invoke("classify_text_jev", { text: sampleText });

      const fallbackResult: AiStylingResult = {
        theme_name: `${jev.genre_label} (Jev Auto-Generated)`,
        genre_analysis: jev.explanation,
        colors: {
          bg: jev.typography.palette.bg_color,
          text: jev.typography.palette.text_color,
          accent: jev.typography.palette.accent_color,
          border: jev.typography.palette.border_color,
          cardBg: "#1c1c22",
        },
        typography: {
          font_family: jev.typography.palette.font_family,
          line_height: jev.typography.line_height,
          first_line_indent: jev.typography.first_line_indent,
          drop_caps: jev.typography.drop_caps,
          scene_divider: jev.typography.scene_divider,
        },
        custom_css: `/* Jev Core Offline Generated Style */\n.drop-cap { color: ${jev.typography.palette.accent_color}; }`,
      };

      return {
        result: fallbackResult,
        source: "jev_fallback",
        error: String(err),
      };
    }
  }
}
