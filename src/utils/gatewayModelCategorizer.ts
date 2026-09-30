import { ConfiguredProviderInfo, DetectedGateway } from "../stores/useAppStore";

export interface ModelCategory {
  id: string;
  name: string;
  description: string;
  accent: string;
  accountBadge?: string;
  models: string[];
}

export interface ProviderMeta {
  name: string;
  description: string;
  accent: string;
  aliases: string[];
}

export const PROVIDER_METADATA = {
  antigravity: {
    name: "Antigravity",
    description: "Tài khoản Antigravity (Google / Claude / OSS) đã kết nối",
    accent: "#4285f4",
    aliases: ["ag", "antigravity"],
  },
  codex: {
    name: "OpenAI Codex",
    description: "Tài khoản ChatGPT / Codex OAuth đã kết nối",
    accent: "#10a37f",
    aliases: ["cx", "codex"],
  },
  cline: {
    name: "Cline",
    description: "Tài khoản Cline OAuth đã kết nối",
    accent: "#f59e0b",
    aliases: ["cl", "cline"],
  },
  qoder: {
    name: "Qoder AI",
    description: "Tài khoản Qoder AI đã kết nối",
    accent: "#8b5cf6",
    aliases: ["qd", "qoder", "qdcn"],
  },
  openrouter: {
    name: "OpenRouter",
    description: "Khóa API OpenRouter đã cấu hình",
    accent: "#6366f1",
    aliases: ["openrouter"],
  },
  "claude-code": {
    name: "Claude Code",
    description: "Tài khoản Claude Code OAuth đã kết nối",
    accent: "#d97757",
    aliases: ["cc", "claude-code"],
  },
  "gemini-cli": {
    name: "Gemini CLI",
    description: "Tài khoản Gemini CLI đã kết nối",
    accent: "#1a73e8",
    aliases: ["gc", "gcli", "gemini-cli"],
  },
  "github-copilot": {
    name: "GitHub Copilot",
    description: "Tài khoản GitHub Copilot đã kết nối",
    accent: "#24292e",
    aliases: ["gh", "github-copilot"],
  },
  kiro: {
    name: "Kiro AI",
    description: "Tài khoản Kiro AI đã kết nối",
    accent: "#ec4899",
    aliases: ["kr", "kiro"],
  },
  iflow: {
    name: "iFlow AI",
    description: "Tài khoản iFlow AI đã kết nối",
    accent: "#06b6d4",
    aliases: ["if", "iflow"],
  },
  qwen: {
    name: "Qwen Code",
    description: "Tài khoản Qwen Code đã kết nối",
    accent: "#615ced",
    aliases: ["qw", "qwen"],
  },
  deepseek: {
    name: "DeepSeek",
    description: "Khóa API DeepSeek đã cấu hình",
    accent: "#4d6bfe",
    aliases: ["deepseek"],
  },
  minimax: {
    name: "MiniMax",
    description: "Khóa API MiniMax đã cấu hình",
    accent: "#ff6b6b",
    aliases: ["minimax", "minimax-cn"],
  },
  glm: {
    name: "GLM / Zhipu",
    description: "Khóa API GLM Coding đã cấu hình",
    accent: "#3b82f6",
    aliases: ["glm", "glm-cn"],
  },
  kimi: {
    name: "Kimi Coding",
    description: "Khóa API Kimi Coding đã cấu hình",
    accent: "#10b981",
    aliases: ["kimi"],
  },
  openai: {
    name: "OpenAI",
    description: "Khóa API OpenAI trực tiếp",
    accent: "#10a37f",
    aliases: ["openai"],
  },
  anthropic: {
    name: "Anthropic",
    description: "Khóa API Anthropic Claude trực tiếp",
    accent: "#d97757",
    aliases: ["anthropic"],
  },
  gemini: {
    name: "Google Gemini",
    description: "Khóa API Google Gemini trực tiếp",
    accent: "#1a73e8",
    aliases: ["gemini"],
  },
  opencode: {
    name: "OpenCode Free",
    description: "Các mô hình AI miễn phí 100% không cần API key từ OpenCode CLI",
    accent: "#ec4899",
    aliases: ["opencode"],
  },
  ollama: {
    name: "Ollama Local",
    description: "Mô hình cục bộ triển khai offline trên máy tính qua Ollama",
    accent: "#f97316",
    aliases: ["ollama"],
  },
} as const satisfies Record<string, ProviderMeta>;

export function getProviderMeta(key: string): ProviderMeta | undefined {
  const dict: Record<string, ProviderMeta> = PROVIDER_METADATA;
  return dict[key];
}

export function getProviderKeyForModel(modelName: string): string {
  const lower = modelName.toLowerCase();
  const prefix = lower.includes("/") ? lower.split("/")[0] : "";

  if (prefix) {
    for (const [key, meta] of Object.entries(PROVIDER_METADATA)) {
      if (key === prefix || (meta.aliases as readonly string[]).includes(prefix)) {
        return key;
      }
    }
    return prefix;
  }

  // Fallbacks if model has no prefix
  if (lower.startsWith("gpt") || lower.startsWith("o1") || lower.startsWith("o3")) return "openai";
  if (lower.startsWith("claude")) return "anthropic";
  if (lower.startsWith("gemini") || lower.startsWith("gemma")) return "gemini";
  if (lower.startsWith("deepseek")) return "deepseek";
  if (lower.startsWith("qwen")) return "qwen";

  return "other";
}

export function categorizeGatewayModels(
  activeGateway: DetectedGateway | null,
  searchQuery = ""
): ModelCategory[] {
  if (!activeGateway || !activeGateway.is_online || activeGateway.models.length === 0) {
    return [];
  }

  const rawModels: string[] = activeGateway.models;
  const filtered = searchQuery.trim()
    ? rawModels.filter((m) => m.toLowerCase().includes(searchQuery.toLowerCase()))
    : rawModels;

  // Special Gateway 1: OpenCode CLI Free
  if (activeGateway.gateway_type === "opencode") {
    return [
      {
        id: "opencode",
        name: "OpenCode Free",
        description: "Các mô hình AI miễn phí 100% không cần API key từ OpenCode CLI",
        accent: "#ec4899",
        accountBadge: "Local CLI",
        models: filtered,
      },
    ];
  }

  // Special Gateway 2: Ollama Local
  if (activeGateway.gateway_type === "ollama") {
    return [
      {
        id: "ollama",
        name: "Ollama Local",
        description: "Mô hình cục bộ triển khai offline trên máy tính qua Ollama",
        accent: "#f97316",
        accountBadge: "Localhost",
        models: filtered,
      },
    ];
  }

  // 9Router or Proxy Gateway: Group models by their actual provider
  const buckets: Record<string, string[]> = {};
  for (const m of filtered) {
    const pKey = getProviderKeyForModel(m);
    if (!buckets[pKey]) {
      buckets[pKey] = [];
    }
    buckets[pKey].push(m);
  }

  // Map configured connections if available
  const configuredList = activeGateway.configured_providers || [];
  const activeConfiguredMap = new Map<string, ConfiguredProviderInfo[]>();
  for (const c of configuredList) {
    if (c.is_active !== false) {
      const canonicalKey = Object.keys(PROVIDER_METADATA).find((k) => {
        const meta = getProviderMeta(k);
        return k === c.provider || (meta?.aliases as readonly string[] | undefined)?.includes(c.provider);
      }) || c.provider;
      const existing = activeConfiguredMap.get(canonicalKey) || [];
      existing.push(c);
      activeConfiguredMap.set(canonicalKey, existing);
    }
  }

  const resultCategories: ModelCategory[] = [];

  // ONLY SHOW PROVIDERS THAT ARE SETUP!
  for (const [pKey, models] of Object.entries(buckets)) {
    if (models.length === 0) continue;

    // If activeConfiguredMap is non-empty, only keep providers that are in activeConfiguredMap
    if (activeConfiguredMap.size > 0 && !activeConfiguredMap.has(pKey)) {
      continue;
    }

    const conns = activeConfiguredMap.get(pKey);
    let accountBadge: string | undefined = undefined;
    if (conns && conns.length > 0) {
      if (conns.length > 1) {
        accountBadge = `${conns.length} tài khoản`;
      } else {
        accountBadge = conns[0].name || conns[0].provider;
      }
    }

    const meta = getProviderMeta(pKey);
    const name = meta?.name || (pKey.charAt(0).toUpperCase() + pKey.slice(1));
    const description = meta?.description || `Mô hình thuộc nhà cung cấp ${name} đã cấu hình trong 9Router`;
    const accent = meta?.accent || "var(--primary)";

    resultCategories.push({
      id: pKey,
      name,
      description,
      accent,
      accountBadge,
      models,
    });
  }

  // Sort order: Antigravity -> Codex -> Cline -> Qoder -> OpenRouter -> others
  const PRIORITY_ORDER = [
    "antigravity",
    "codex",
    "cline",
    "qoder",
    "openrouter",
    "claude-code",
    "gemini-cli",
    "github-copilot",
    "kiro",
    "iflow",
    "qwen",
  ];

  resultCategories.sort((a, b) => {
    const idxA = PRIORITY_ORDER.indexOf(a.id);
    const idxB = PRIORITY_ORDER.indexOf(b.id);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });

  return resultCategories;
}
