/**
 * LinguaGacha-style AI Provider Architecture for NiceEbook Studio.
 * Inspired by https://github.com/neavo/LinguaGacha
 *
 * Provides out-of-the-box presets for popular Cloud and Local AI backends,
 * supporting endpoint duplication, custom base URLs, API key management,
 * and seamless OpenAI-compatible protocol dispatching.
 */

export interface LinguaGachaProviderPreset {
  id: string;
  name: string;
  description: string;
  category: "cloud" | "local" | "custom";
  baseUrl: string;
  defaultModel: string;
  availableModels: string[];
  requiresApiKey: boolean;
  apiKeyHelpUrl?: string;
  placeholderKey?: string;
  accent: string;
}

export interface ConfiguredProvider {
  id: string;
  presetId: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  selectedModel: string;
  availableModels: string[];
  isActive: boolean;
  createdAt: number;
}

export const LINGUAGACHA_PRESETS: LinguaGachaProviderPreset[] = [
  {
    id: "deepseek",
    name: "DeepSeek API",
    description: "Mô hình dịch thuật văn học & tiểu thuyết tối ưu chi phí nhất (DeepSeek-V3 & R1)",
    category: "cloud",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    availableModels: ["deepseek-chat", "deepseek-reasoner"],
    requiresApiKey: true,
    apiKeyHelpUrl: "https://platform.deepseek.com/api_keys",
    placeholderKey: "sk-...",
    accent: "#4d6bfe",
  },
  {
    id: "gemini",
    name: "Google Gemini API",
    description: "Dịch thuật ngữ cảnh lớn siêu tốc qua giao thức OpenAI-compatible của Google",
    category: "cloud",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
    availableModels: [
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
    ],
    requiresApiKey: true,
    apiKeyHelpUrl: "https://aistudio.google.com/app/apikey",
    placeholderKey: "AIzaSy...",
    accent: "#1a73e8",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude API",
    description: "Văn phong văn học sâu sắc, tự nhiên và dịch thơ ca xuất sắc nhất",
    category: "cloud",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-3-5-sonnet-20241022",
    availableModels: [
      "claude-3-5-sonnet-20241022",
      "claude-3-7-sonnet",
      "claude-3-5-haiku-20241022",
    ],
    requiresApiKey: true,
    apiKeyHelpUrl: "https://console.anthropic.com/settings/keys",
    placeholderKey: "sk-ant-...",
    accent: "#d97757",
  },
  {
    id: "openai",
    name: "OpenAI API",
    description: "Mô hình GPT-4o, GPT-4o-mini và dòng mô hình suy luận o1, o3-mini",
    category: "cloud",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    availableModels: ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1"],
    requiresApiKey: true,
    apiKeyHelpUrl: "https://platform.openai.com/api-keys",
    placeholderKey: "sk-...",
    accent: "#10a37f",
  },
  {
    id: "openrouter",
    name: "OpenRouter Aggregator",
    description: "Cổng kết nối tổng hợp hơn 200+ mô hình AI toàn cầu chỉ với 1 khóa API duy nhất",
    category: "cloud",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "google/gemini-2.0-flash-001",
    availableModels: [
      "google/gemini-2.0-flash-001",
      "anthropic/claude-3.5-sonnet",
      "deepseek/deepseek-r1",
      "qwen/qwen-2.5-72b-instruct",
      "meta-llama/llama-3.3-70b-instruct",
    ],
    requiresApiKey: true,
    apiKeyHelpUrl: "https://openrouter.ai/keys",
    placeholderKey: "sk-or-...",
    accent: "#6366f1",
  },
  {
    id: "siliconflow",
    name: "SiliconFlow (SiliconCloud)",
    description: "Hạ tầng AI Cloud tăng tốc DeepSeek V3, R1 và Qwen 2.5 với giá cực rẻ",
    category: "cloud",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "deepseek-ai/DeepSeek-V3",
    availableModels: [
      "deepseek-ai/DeepSeek-V3",
      "deepseek-ai/DeepSeek-R1",
      "Qwen/Qwen2.5-72B-Instruct",
      "Qwen/Qwen2.5-14B-Instruct",
    ],
    requiresApiKey: true,
    apiKeyHelpUrl: "https://cloud.siliconflow.cn/account/ak",
    placeholderKey: "sk-...",
    accent: "#3b82f6",
  },
  {
    id: "grok",
    name: "xAI Grok",
    description: "Mô hình Grok-2 thông minh, văn phong hiện đại và sắc sảo",
    category: "cloud",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-2-1212",
    availableModels: ["grok-2-1212", "grok-2-vision-1212"],
    requiresApiKey: true,
    placeholderKey: "xai-...",
    accent: "#000000",
  },
  {
    id: "qwen",
    name: "Alibaba Qwen (DashScope)",
    description: "Dòng mô hình Qwen 2.5 hàng đầu về dịch thuật ngôn ngữ Á Đông",
    category: "cloud",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    availableModels: ["qwen-plus", "qwen-max", "qwen-turbo"],
    requiresApiKey: true,
    accent: "#ff6a00",
  },
  {
    id: "moonshot",
    name: "Moonshot AI (Kimi)",
    description: "Mô hình Kimi đọc ngữ cảnh dài 128k, xử lý tiếng Trung cổ phong rất tốt",
    category: "cloud",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-32k",
    availableModels: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
    requiresApiKey: true,
    accent: "#10b981",
  },
  {
    id: "volcengine",
    name: "ByteDance Doubao (火山引擎)",
    description: "Mô hình Đậu Bao (Doubao) chuyên dịch truyện Trung Quốc mượt mà",
    category: "cloud",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: "doubao-pro-32k",
    availableModels: ["doubao-pro-32k", "doubao-lite-32k"],
    requiresApiKey: true,
    accent: "#00d2c0",
  },
  {
    id: "ollama",
    name: "Ollama Localhost",
    description: "Mô hình nguồn mở chạy 100% offline cục bộ (Qwen 2.5, Llama 3.2, Mistral)",
    category: "local",
    baseUrl: "http://127.0.0.1:11434/v1",
    defaultModel: "qwen2.5:latest",
    availableModels: ["qwen2.5:latest", "llama3.2:latest", "mistral:latest"],
    requiresApiKey: false,
    accent: "#f97316",
  },
  {
    id: "sakurallm",
    name: "SakuraLLM Local",
    description: "Lõi AI chuyên dịch Light Novel và tiểu thuyết Nhật Bản sang tiếng Trung/Việt",
    category: "local",
    baseUrl: "http://127.0.0.1:5000/v1",
    defaultModel: "sakura-13b",
    availableModels: ["sakura-13b", "sakura-7b"],
    requiresApiKey: false,
    accent: "#f43f5e",
  },
  {
    id: "lmstudio",
    name: "LM Studio / KoboldCPP",
    description: "Máy chủ OpenAI-compatible cục bộ chạy GGUF trên GPU/CPU",
    category: "local",
    baseUrl: "http://127.0.0.1:1234/v1",
    defaultModel: "local-model",
    availableModels: ["local-model"],
    requiresApiKey: false,
    accent: "#8b5cf6",
  },
  {
    id: "custom",
    name: "Custom OpenAI Compatible",
    description: "Tùy chỉnh bất kỳ Endpoint OpenAI-compatible hoặc Proxy API cá nhân",
    category: "custom",
    baseUrl: "https://api.your-domain.com/v1",
    defaultModel: "gpt-4o",
    availableModels: ["gpt-4o"],
    requiresApiKey: true,
    accent: "#64748b",
  },
];

const CONFIG_STORAGE_KEY = "nice-ebook-configured-providers-v1";

/**
 * Loads user's configured provider endpoints from localStorage.
 */
export function loadConfiguredProviders(): ConfiguredProvider[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) {
      // Default to DeepSeek preset if no providers exist yet
      const defaultDeepseek: ConfiguredProvider = {
        id: "prov_deepseek_default",
        presetId: "deepseek",
        name: "DeepSeek Official",
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: "",
        selectedModel: "deepseek-chat",
        availableModels: ["deepseek-chat", "deepseek-reasoner"],
        isActive: false,
        createdAt: Date.now(),
      };
      return [defaultDeepseek];
    }
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn("Could not load configured providers:", err);
    return [];
  }
}

/**
 * Persists configured provider endpoints into localStorage.
 */
export function saveConfiguredProviders(providers: ConfiguredProvider[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(providers));
  } catch (err) {
    console.warn("Could not save configured providers:", err);
  }
}

/**
 * Duplicates an existing provider endpoint with an incremental suffix (like LinguaGacha's _副本).
 */
export function duplicateProvider(
  provider: ConfiguredProvider,
  existingList: ConfiguredProvider[]
): ConfiguredProvider {
  const baseName = provider.name.replace(/_BảnSao(?:\d+)?$/, "");
  const copiesCount = existingList.filter((p) => p.name.startsWith(baseName)).length;
  const newName = `${baseName}_BảnSao${copiesCount > 1 ? copiesCount : ""}`;

  return {
    ...provider,
    id: `prov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: newName,
    isActive: false,
    createdAt: Date.now(),
  };
}
