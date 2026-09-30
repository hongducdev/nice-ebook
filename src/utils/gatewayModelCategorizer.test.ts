import { describe, it, expect } from "vitest";
import { 
  categorizeGatewayModels, 
  getProviderKeyForModel,
  getProviderMeta 
} from "./gatewayModelCategorizer";
import { DetectedGateway } from "../stores/useAppStore";

describe("gatewayModelCategorizer", () => {
  it("resolves provider key from model prefixes accurately", () => {
    expect(getProviderKeyForModel("ag/gemini-3.8-flash")).toBe("antigravity");
    expect(getProviderKeyForModel("ag/claude-sonnet-4-6")).toBe("antigravity");
    expect(getProviderKeyForModel("cx/gpt-5.6-sol")).toBe("codex");
    expect(getProviderKeyForModel("cl/openai/gpt-4o")).toBe("cline");
    expect(getProviderKeyForModel("qd/qmodel")).toBe("qoder");
    expect(getProviderKeyForModel("openrouter/typesafe/jev-1.13")).toBe("openrouter");
    expect(getProviderKeyForModel("opencode/mimo-v2.6-flash-free")).toBe("opencode");
    expect(getProviderKeyForModel("gpt-4o")).toBe("openai");
    expect(getProviderKeyForModel("claude-3-5-sonnet")).toBe("anthropic");
  });

  it("filters and displays ONLY configured providers for 9Router", () => {
    const mock9Router: DetectedGateway = {
      name: "9Router (Chính)",
      base_url: "http://127.0.0.1:20128/v1",
      port: 20128,
      is_online: true,
      gateway_type: "9router",
      latency_ms: 10,
      models: [
        "ag/gemini-3.8-flash",
        "ag/claude-sonnet-4-6",
        "cx/gpt-5.6-sol",
        "cx/gpt-5.4",
        "cl/openai/gpt-4o",
      ],
      configured_providers: [
        { provider: "antigravity", name: "hongducyb123@gmail.com", is_active: true },
        { provider: "antigravity", name: "contact.hongduc@gmail.com", is_active: true },
        { provider: "antigravity", name: "hongducdev.pxl@gmail.com", is_active: true },
        { provider: "codex", name: "hongducyb123@gmail.com", is_active: true },
        { provider: "cline", name: "hongducyb123@gmail.com", is_active: true },
        { provider: "deepseek", name: "unused-key", is_active: false }, // inactive, must be excluded!
      ],
    };

    const categories = categorizeGatewayModels(mock9Router);

    // Exactly 3 active configured categories
    expect(categories.map((c) => c.id)).toEqual(["antigravity", "codex", "cline"]);

    // Antigravity verification
    const agCategory = categories.find((c) => c.id === "antigravity")!;
    expect(agCategory.name).toBe("Antigravity");
    expect(agCategory.accountBadge).toBe("3 tài khoản");
    expect(agCategory.models).toEqual(["ag/gemini-3.8-flash", "ag/claude-sonnet-4-6"]);

    // Codex verification
    const cxCategory = categories.find((c) => c.id === "codex")!;
    expect(cxCategory.name).toBe("OpenAI Codex");
    expect(cxCategory.accountBadge).toBe("hongducyb123@gmail.com");
    expect(cxCategory.models).toEqual(["cx/gpt-5.6-sol", "cx/gpt-5.4"]);

    // Cline verification
    const clCategory = categories.find((c) => c.id === "cline")!;
    expect(clCategory.name).toBe("Cline");
    expect(clCategory.accountBadge).toBe("hongducyb123@gmail.com");
    expect(clCategory.models).toEqual(["cl/openai/gpt-4o"]);

    // Unconfigured providers MUST NOT exist!
    expect(categories.some((c) => c.id === "deepseek")).toBe(false);
    expect(categories.some((c) => c.id === "qwen")).toBe(false);
    expect(categories.some((c) => c.id === "llama")).toBe(false);
    expect(categories.some((c) => c.id === "openai")).toBe(false);
  });

  it("handles OpenCode Free gateway by showing only OpenCode category", () => {
    const mockOpenCode: DetectedGateway = {
      name: "OpenCode Engine (Free)",
      base_url: "opencode://cli",
      port: 0,
      is_online: true,
      gateway_type: "opencode",
      latency_ms: 5,
      models: [
        "opencode/mimo-v2.6-flash-free",
        "opencode/ling-3.0-flash-fin-free",
      ],
    };

    const categories = categorizeGatewayModels(mockOpenCode);
    expect(categories).toHaveLength(1);
    expect(categories[0].id).toBe("opencode");
    expect(categories[0].name).toBe("OpenCode Free");
    expect(categories[0].models).toHaveLength(2);
  });

  it("handles Ollama gateway by showing only Ollama Local category", () => {
    const mockOllama: DetectedGateway = {
      name: "Ollama Local",
      base_url: "http://127.0.0.1:11434/v1",
      port: 11434,
      is_online: true,
      gateway_type: "ollama",
      latency_ms: 12,
      models: ["llama3.2:latest", "mistral:latest"],
    };

    const categories = categorizeGatewayModels(mockOllama);
    expect(categories).toHaveLength(1);
    expect(categories[0].id).toBe("ollama");
    expect(categories[0].name).toBe("Ollama Local");
    expect(categories[0].models).toEqual(["llama3.2:latest", "mistral:latest"]);
  });

  it("returns empty array when gateway is null or offline", () => {
    expect(categorizeGatewayModels(null)).toEqual([]);

    const offlineGateway: DetectedGateway = {
      name: "Offline 9Router",
      base_url: "http://127.0.0.1:20128/v1",
      port: 20128,
      is_online: false,
      gateway_type: "9router",
      latency_ms: 0,
      models: ["ag/gemini-3.8-flash"],
    };
    expect(categorizeGatewayModels(offlineGateway)).toEqual([]);
  });

  it("filters models across categories when searchQuery is applied", () => {
    const mock9Router: DetectedGateway = {
      name: "9Router (Chính)",
      base_url: "http://127.0.0.1:20128/v1",
      port: 20128,
      is_online: true,
      gateway_type: "9router",
      latency_ms: 10,
      models: [
        "ag/gemini-3.8-flash",
        "ag/claude-sonnet-4-6",
        "cx/gpt-5.6-sol",
      ],
      configured_providers: [
        { provider: "antigravity", name: "Hongduc", is_active: true },
        { provider: "codex", name: "Hongduc", is_active: true },
      ],
    };

    // Searching "gemini" should only match Antigravity category
    const categories = categorizeGatewayModels(mock9Router, "gemini");
    expect(categories).toHaveLength(1);
    expect(categories[0].id).toBe("antigravity");
    expect(categories[0].models).toEqual(["ag/gemini-3.8-flash"]);
  });

  it("handles unknown provider keys safely via getProviderMeta", () => {
    expect(getProviderMeta("unknown-provider-xyz")).toBeUndefined();
    expect(getProviderMeta("antigravity")).toBeDefined();
    expect(getProviderMeta("antigravity")?.name).toBe("Antigravity");
  });

  it("excludes unknown/unconfigured prefixes when active configured providers are present", () => {
    const mockGateway: DetectedGateway = {
      name: "9Router",
      base_url: "http://127.0.0.1:20128/v1",
      port: 20128,
      is_online: true,
      gateway_type: "9router",
      latency_ms: 10,
      models: [
        "ag/gemini-3.8-flash",
        "unknown-random/custom-model-9",
      ],
      configured_providers: [
        { provider: "antigravity", name: "User", is_active: true },
      ],
    };

    const categories = categorizeGatewayModels(mockGateway);
    expect(categories).toHaveLength(1);
    expect(categories[0].id).toBe("antigravity");
    expect(categories.some((c) => c.id === "unknown-random")).toBe(false);
  });

  it("gracefully groups by model prefixes if configured_providers probe was empty", () => {
    const mockGatewayWithoutConns: DetectedGateway = {
      name: "9Router",
      base_url: "http://127.0.0.1:20128/v1",
      port: 20128,
      is_online: true,
      gateway_type: "9router",
      latency_ms: 10,
      models: [
        "ag/gemini-3.8-flash",
        "cx/gpt-5.6-sol",
      ],
      configured_providers: [], // probe failed or empty
    };

    const categories = categorizeGatewayModels(mockGatewayWithoutConns);
    expect(categories.map((c) => c.id)).toEqual(["antigravity", "codex"]);
  });
});
