import { describe, it, expect, beforeEach } from "vitest";
import {
  LINGUAGACHA_PRESETS,
  ConfiguredProvider,
  loadConfiguredProviders,
  saveConfiguredProviders,
  duplicateProvider,
} from "./linguaGachaProviders";

describe("linguaGachaProviders", () => {
  const storageMap = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, val: string) => storageMap.set(key, String(val)),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
  };

  beforeEach(() => {
    storageMap.clear();
    (globalThis as any).window = {
      localStorage: mockStorage,
    };
  });

  it("contains all essential LinguaGacha cloud and local presets", () => {
    const ids = LINGUAGACHA_PRESETS.map((p) => p.id);
    expect(ids).toContain("deepseek");
    expect(ids).toContain("gemini");
    expect(ids).toContain("anthropic");
    expect(ids).toContain("openai");
    expect(ids).toContain("openrouter");
    expect(ids).toContain("siliconflow");
    expect(ids).toContain("grok");
    expect(ids).toContain("ollama");
    expect(ids).toContain("sakurallm");
    expect(ids).toContain("lmstudio");
    expect(ids).toContain("custom");

    // DeepSeek preset validation
    const deepseek = LINGUAGACHA_PRESETS.find((p) => p.id === "deepseek")!;
    expect(deepseek.baseUrl).toBe("https://api.deepseek.com/v1");
    expect(deepseek.defaultModel).toBe("deepseek-chat");
    expect(deepseek.availableModels).toContain("deepseek-chat");
    expect(deepseek.availableModels).toContain("deepseek-reasoner");
  });

  it("loads default configured provider when localStorage is empty", () => {
    const list = loadConfiguredProviders();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].presetId).toBe("deepseek");
  });

  it("saves and reloads configured providers from localStorage correctly", () => {
    const mockProviders: ConfiguredProvider[] = [
      {
        id: "prov_1",
        presetId: "deepseek",
        name: "DeepSeek Primary",
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: "sk-test-key",
        selectedModel: "deepseek-chat",
        availableModels: ["deepseek-chat", "deepseek-reasoner"],
        isActive: true,
        createdAt: 1000,
      },
      {
        id: "prov_2",
        presetId: "gemini",
        name: "Gemini Flash",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        apiKey: "AIzaSy-test",
        selectedModel: "gemini-2.0-flash",
        availableModels: ["gemini-2.0-flash"],
        isActive: false,
        createdAt: 2000,
      },
    ];

    saveConfiguredProviders(mockProviders);
    const loaded = loadConfiguredProviders();

    expect(loaded).toHaveLength(2);
    expect(loaded[0].name).toBe("DeepSeek Primary");
    expect(loaded[1].name).toBe("Gemini Flash");
    expect(loaded[0].apiKey).toBe("sk-test-key");
  });

  it("duplicates an existing provider configuration with an incremental copy suffix", () => {
    const original: ConfiguredProvider = {
      id: "prov_ds",
      presetId: "deepseek",
      name: "DeepSeek Official",
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "sk-key-1",
      selectedModel: "deepseek-chat",
      availableModels: ["deepseek-chat"],
      isActive: true,
      createdAt: 100,
    };

    const copy1 = duplicateProvider(original, [original]);
    expect(copy1.id).not.toBe(original.id);
    expect(copy1.name).toBe("DeepSeek Official_BảnSao");
    expect(copy1.isActive).toBe(false);
    expect(copy1.apiKey).toBe("sk-key-1");

    const copy2 = duplicateProvider(copy1, [original, copy1]);
    expect(copy2.name).toBe("DeepSeek Official_BảnSao2");
  });
});
