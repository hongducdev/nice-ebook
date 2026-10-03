import { describe, it, expect, beforeEach } from "vitest";
import {
  LINGUAGACHA_PRESETS,
  ConfiguredProvider,
  loadConfiguredProviders,
  saveConfiguredProviders,
  duplicateProvider,
  activateProviderInList,
  buildGatewayModelList,
  findProviderOwningModel,
  shouldAutoActivateProvider,
  persistProviderActivation,
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

  describe("activation & model-list helpers", () => {
    const base: ConfiguredProvider[] = [
      {
        id: "prov_ds",
        presetId: "deepseek",
        name: "DeepSeek Official",
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: "sk-1",
        selectedModel: "deepseek-chat",
        availableModels: ["deepseek-chat"],
        isActive: true,
        createdAt: 1,
      },
      {
        id: "prov_gm",
        presetId: "gemini",
        name: "Google Gemini API",
        baseUrl: "https://example.test/v1",
        apiKey: "sk-2",
        selectedModel: "gemini-2.5-pro",
        availableModels: ["gemini-2.5-pro", "gemini-2.0-flash"],
        isActive: false,
        createdAt: 2,
      },
    ];

    it("activateProviderInList keeps every provider while switching the active flag", () => {
      const updated = activateProviderInList(base, "prov_gm");

      // Regression guard: the old code mapped over a not-yet-committed state snapshot and
      // persisted an EMPTY array, erasing every configured provider (and the active flag).
      expect(updated).toHaveLength(2);
      expect(updated.map((p) => p.id)).toEqual(["prov_ds", "prov_gm"]);
      expect(updated.find((p) => p.id === "prov_gm")?.isActive).toBe(true);
      expect(updated.find((p) => p.id === "prov_ds")?.isActive).toBe(false);
      expect(updated.find((p) => p.id === "prov_ds")?.apiKey).toBe("sk-1");
    });

    it("activateProviderInList is a no-op for an unknown id", () => {
      expect(activateProviderInList(base, "prov_missing")).toBe(base);
    });

    it("buildGatewayModelList puts the selected model first, dedupes and never drops it", () => {
      const prov: ConfiguredProvider = {
        ...base[1],
        selectedModel: "gemini-2.5-pro",
        availableModels: ["gemini-2.0-flash", "gemini-2.5-pro", ""],
      };

      const models = buildGatewayModelList(prov);
      expect(models[0]).toBe("gemini-2.5-pro");
      expect(models.filter((m) => m === "gemini-2.5-pro")).toHaveLength(1);
      expect(models).toEqual(["gemini-2.5-pro", "gemini-2.0-flash"]);
    });

    it("buildGatewayModelList still exposes a model typed by the user but absent from availableModels", () => {
      const models = buildGatewayModelList({
        ...base[1],
        selectedModel: "gemini-3.9-experimental",
        availableModels: ["gemini-2.0-flash"],
      });
      expect(models).toContain("gemini-3.9-experimental");
    });

    it("findProviderOwningModel only adopts the provider with positive evidence", () => {
      expect(findProviderOwningModel(base, "gemini-2.5-pro")?.id).toBe("prov_gm");
      expect(findProviderOwningModel(base, "deepseek-chat")?.id).toBe("prov_ds");
      // Unrelated model: no provider may be adopted for it.
      expect(findProviderOwningModel(base, "gpt-4o")).toBeUndefined();
      expect(findProviderOwningModel(base, null)).toBeUndefined();
      expect(findProviderOwningModel(base, "   ")).toBeUndefined();
    });

    it("findProviderOwningModel matches a provider whose only model is its selected one", () => {
      const defaultOnly: ConfiguredProvider = {
        ...base[0],
        id: "prov_bare",
        selectedModel: "my-custom-model",
        availableModels: [],
      };
      expect(findProviderOwningModel([defaultOnly], "my-custom-model")?.id).toBe("prov_bare");
      expect(findProviderOwningModel([defaultOnly], "other-model")).toBeUndefined();
    });

    it("shouldAutoActivateProvider only fires once the scan settled and a provider is flagged active", () => {
      const attempted = { alreadyAttempted: false, isScanningGateways: false, hasActiveGateway: false };

      // Waiting for the startup scan: must NOT activate (and must not burn the caller's latch).
      expect(shouldAutoActivateProvider({ ...attempted, isScanningGateways: true, providers: base })).toBeNull();
      // A gateway is already active: nothing to restore.
      expect(shouldAutoActivateProvider({ ...attempted, hasActiveGateway: true, providers: base })).toBeNull();
      // Already attempted this mount: never fight a deliberate de-activation.
      expect(shouldAutoActivateProvider({ ...attempted, alreadyAttempted: true, providers: base })).toBeNull();
      // Nothing flagged active: nothing to restore automatically.
      expect(
        shouldAutoActivateProvider({ ...attempted, providers: base.map((p) => ({ ...p, isActive: false })) })
      ).toBeNull();
      // Ready: restore the flagged provider.
      expect(shouldAutoActivateProvider({ ...attempted, providers: base })?.id).toBe("prov_ds");
    });

    it("persistProviderActivation keeps every stored provider and persists the flags (no wipe)", () => {
      saveConfiguredProviders(base);

      const updated = persistProviderActivation(base[1]);
      expect(updated).toHaveLength(2);

      // Re-read from storage: this is the regression that used to erase the list.
      const reloaded = loadConfiguredProviders();
      expect(reloaded.map((p) => p.id)).toEqual(["prov_ds", "prov_gm"]);
      expect(reloaded.find((p) => p.id === "prov_gm")?.isActive).toBe(true);
      expect(reloaded.find((p) => p.id === "prov_ds")?.isActive).toBe(false);
      expect(reloaded.find((p) => p.id === "prov_ds")?.apiKey).toBe("sk-1");
    });

    it("persistProviderActivation appends a provider that is not stored yet", () => {
      saveConfiguredProviders([base[0]]);
      const fresh: ConfiguredProvider = { ...base[1], id: "prov_new", isActive: false };

      persistProviderActivation(fresh);

      const reloaded = loadConfiguredProviders();
      expect(reloaded.map((p) => p.id)).toEqual(["prov_ds", "prov_new"]);
    });
  });
});
