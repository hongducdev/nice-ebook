/**
 * Regression suite: the model the user picked must be ACTIVE right after a cold start.
 *
 * Symptom that triggered this suite: "đã chọn model nhưng không active để sử dụng,
 * phải vào ấn tay để chọn một lần nữa".
 *
 * Root causes covered here:
 *  A. `scanGateways()` only restored a gateway from `lg-active-gateway-name` or a provider
 *     flagged `isActive` — with neither present (the flag is easy to lose) the app booted
 *     with `activeGateway === null` while `lg-selected-model` still held the user's model,
 *     so the model was unusable until the user clicked through the AI tab again.
 *  B. A user-configured provider silently dropped the model the user had picked whenever it
 *     was missing from `availableModels`, replacing it with `models[0]`.
 *
 * The store hydrates `selectedModel` from localStorage at module load, so these tests must
 * install a fake storage BEFORE importing the module — hence `vi.resetModules()` + dynamic
 * import instead of the static import used by the other store tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const PROVIDER_KEY = "nice-ebook-configured-providers-v1";
const MODEL_KEY = "lg-selected-model";
const GATEWAY_KEY = "lg-active-gateway-name";

function fakeStorage(seed: Record<string, string>) {
  const map: Record<string, string> = { ...seed };
  return {
    map,
    api: {
      getItem: (k: string) => (k in map ? map[k] : null),
      setItem: (k: string, v: string) => { map[k] = String(v); },
      removeItem: (k: string) => { delete map[k]; },
      clear: () => { Object.keys(map).forEach((k) => delete map[k]); },
      key: (i: number) => Object.keys(map)[i] ?? null,
      get length() { return Object.keys(map).length; },
    },
  };
}

const provider = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "prov_gemini_1",
  presetId: "gemini",
  name: "Google Gemini API",
  baseUrl: "https://gcli.ggchan.dev/v1",
  apiKey: "sk-test",
  selectedModel: "gemini-2.5-pro",
  availableModels: ["gemini-2.5-pro", "gemini-2.0-flash"],
  isActive: false,
  createdAt: 1,
  ...over,
});

const localGateway = (models: string[]) => ({
  name: "Ollama Local",
  base_url: "http://127.0.0.1:11434",
  port: 11434,
  is_online: true,
  models,
  gateway_type: "ollama",
  latency_ms: 12,
});

async function boot(seed: Record<string, string>, scannedGateways: unknown[] = []) {
  const { map, api } = fakeStorage(seed);
  (globalThis as any).window = {
    localStorage: api,
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  vi.resetModules();
  const { useAppStore } = await import("./useAppStore");
  const { invoke } = await import("@tauri-apps/api/core");
  (invoke as any).mockImplementation((cmd: string) => {
    if (cmd === "scan_ai_gateways") return Promise.resolve(scannedGateways);
    return Promise.resolve({});
  });

  await useAppStore.getState().scanGateways();
  return { store: useAppStore, storage: map };
}

describe("Startup model activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete (globalThis as any).window;
    vi.resetModules();
  });

  it("activates the provider that owns the persisted model even when no provider is flagged active", async () => {
    const { store, storage } = await boot({
      [MODEL_KEY]: "gemini-2.5-pro",
      [PROVIDER_KEY]: JSON.stringify([provider({ isActive: false })]),
    });

    const state = store.getState();
    expect(state.activeGateway?.name).toBe("Google Gemini API");
    expect(state.selectedModel).toBe("gemini-2.5-pro");
    // The UI marks a model chip as active by comparing against activeGateway.models.
    expect(state.activeGateway?.models).toContain("gemini-2.5-pro");
    // The choice must survive untouched: no silent rewrite of the user's preference.
    expect(storage[MODEL_KEY]).toBe("gemini-2.5-pro");
  });

  it("prefers the provider owning the persisted model over an unrelated local gateway", async () => {
    const { store } = await boot(
      {
        [MODEL_KEY]: "gemini-2.5-pro",
        [PROVIDER_KEY]: JSON.stringify([provider({ isActive: false })]),
      },
      [localGateway(["llama3.2:latest"])]
    );

    const state = store.getState();
    expect(state.activeGateway?.name).toBe("Google Gemini API");
    expect(state.selectedModel).toBe("gemini-2.5-pro");
  });

  it("keeps an explicitly saved gateway name authoritative over the model owner", async () => {
    const { store } = await boot(
      {
        [MODEL_KEY]: "llama3.2:latest",
        [GATEWAY_KEY]: "Ollama Local",
        [PROVIDER_KEY]: JSON.stringify([provider({ isActive: true })]),
      },
      [localGateway(["llama3.2:latest"])]
    );

    const state = store.getState();
    expect(state.activeGateway?.name).toBe("Ollama Local");
    expect(state.selectedModel).toBe("llama3.2:latest");
  });

  it("never drops the provider's own selected model from the model list", async () => {
    // A model typed by the user is legitimately absent from availableModels.
    const { store } = await boot({
      [MODEL_KEY]: "gemini-2.5-pro",
      [PROVIDER_KEY]: JSON.stringify([
        provider({ selectedModel: "gemini-2.5-pro", availableModels: ["gemini-2.0-flash"], isActive: true }),
      ]),
    });

    const state = store.getState();
    expect(state.activeGateway?.name).toBe("Google Gemini API");
    expect(state.activeGateway?.models[0]).toBe("gemini-2.5-pro");
    expect(state.selectedModel).toBe("gemini-2.5-pro");
  });

  it("warns instead of silently booting into the offline core when nothing can serve the saved model", async () => {
    const { store } = await boot({
      [MODEL_KEY]: "gemini-2.5-pro",
      [PROVIDER_KEY]: JSON.stringify([
        provider({ id: "prov_deepseek", name: "DeepSeek Official", selectedModel: "deepseek-chat", availableModels: ["deepseek-chat"], isActive: false }),
      ]),
    });

    const state = store.getState();
    expect(state.activeGateway).toBeNull();
    // The preference is preserved...
    expect(state.selectedModel).toBe("gemini-2.5-pro");
    // ...and the mismatch is reported instead of failing silently.
    expect(state.terminalLogs.some((l) => l.text.includes("không thuộc nhà cung cấp nào"))).toBe(true);
  });
});
