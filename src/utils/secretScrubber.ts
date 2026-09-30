/**
 * Jev Guardrail - Secret Scrubber & Credential Sanitizer
 * Adapted from JevGuarAgent (JOG) `jog/jev_engine.py`
 *
 * Provides high-precision zero-latency detection and masking for API keys,
 * private keys, database credentials, and authorization tokens.
 */

export interface SecretRule {
  name: string;
  pattern: RegExp;
  riskScore: number;
}

export interface DetectedSecret {
  name: string;
  matched: string;
  masked: string;
  riskScore: number;
  index: number;
}

export const SENSITIVE_FILENAMES: readonly string[] = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.staging",
  ".env.development",
  "id_rsa",
  "id_ed25519",
  "id_dsa",
  "id_ecdsa",
  "service-account.json",
  "credentials.json",
  "secret.json",
  "private_key.pem",
  "server.key",
  "auth_token.txt",
];

export const SECRET_RULES: SecretRule[] = [
  {
    name: "Anthropic API Key",
    pattern: /sk-ant-api[0-9]{2}-[A-Za-z0-9_-]{80,120}/g,
    riskScore: 1.0,
  },
  {
    name: "OpenRouter API Key",
    pattern: /sk-or-v1-[a-f0-9]{64}/g,
    riskScore: 1.0,
  },
  {
    name: "OpenAI API Key",
    pattern: /sk-(?!(?:ant|or)-)(?:proj-|live-)?[A-Za-z0-9_-]{32,80}/g,
    riskScore: 1.0,
  },
  {
    name: "Google AI / Gemini API Key",
    pattern: /AIzaSy[A-Za-z0-9_-]{33}/g,
    riskScore: 1.0,
  },
  {
    name: "GitHub Token",
    pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}|github_pat_[A-Za-z0-9_]{22}_[A-Za-z0-9_]{59}/g,
    riskScore: 1.0,
  },
  {
    name: "AWS Access Key ID",
    pattern: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
    riskScore: 1.0,
  },
  {
    name: "AWS Secret Access Key",
    pattern: /aws_secret_access_key\s*[:=]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/gi,
    riskScore: 1.0,
  },
  {
    name: "Private RSA/SSH Key",
    pattern: /-----BEGIN (?:RSA |OPENSSH |DSA |EC )?PRIVATE KEY-----/g,
    riskScore: 1.0,
  },
  {
    name: "Generic Bearer / JWT Token",
    pattern: /bearer\s+eyJh[A-Za-z0-9-_=]+\.eyJh[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]+/gi,
    riskScore: 0.9,
  },
  {
    name: "Slack Token",
    pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g,
    riskScore: 0.9,
  },
  {
    name: "Stripe Live Key",
    pattern: /(?:sk|rk)_live_[0-9a-zA-Z]{24,34}/g,
    riskScore: 1.0,
  },
  {
    name: "Database URI with Credentials",
    pattern: /(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis):\/\/[^:]+:[^@\s]+@[a-zA-Z0-9.-]+/gi,
    riskScore: 0.95,
  },
  {
    name: "Hardcoded Password / Secret Assignment",
    pattern: /(?:password|passwd|secret_key|client_secret|db_pass)\s*[:=]\s*['"][^'"\s]{8,}['"]/gi,
    riskScore: 0.8,
  },
  {
    name: ".env Sensitive Assignment",
    pattern: /^(?:DB_PASSWORD|SECRET_KEY|API_KEY|AUTH_TOKEN|PRIVATE_KEY)\s*=\s*\S+/gm,
    riskScore: 0.85,
  },
];

/**
 * Mask a secret string, leaving first 4 and last 4 characters visible if long enough.
 */
export function maskSecretValue(raw: string): string {
  if (!raw || raw.length <= 8) {
    return "***SECRET***";
  }
  const prefix = raw.slice(0, 4);
  const suffix = raw.slice(-4);
  const stars = "*".repeat(Math.min(16, raw.length - 8));
  return `${prefix}${stars}${suffix}`;
}

/**
 * Detect all known secrets in a given text string.
 */
export function detectSecrets(text: string): DetectedSecret[] {
  if (!text || typeof text !== "string") {
    return [];
  }

  const results: DetectedSecret[] = [];

  for (const rule of SECRET_RULES) {
    // Reset regex state if global
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = rule.pattern.exec(text)) !== null) {
      const raw = match[0];
      results.push({
        name: rule.name,
        matched: raw,
        masked: maskSecretValue(raw),
        riskScore: rule.riskScore,
        index: match.index,
      });

      // Avoid infinite loop if non-global or zero-width match
      if (!rule.pattern.global || raw.length === 0) {
        break;
      }
    }
  }

  return results;
}

/**
 * Check if text contains any secret without returning details.
 */
export function hasSecrets(text: string): boolean {
  if (!text || typeof text !== "string") {
    return false;
  }
  for (const rule of SECRET_RULES) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Replace all detected secret occurrences in text with masked representations.
 */
export function maskSecrets(text: string): string {
  if (!text || typeof text !== "string") {
    return text;
  }

  let sanitized = text;
  for (const rule of SECRET_RULES) {
    rule.pattern.lastIndex = 0;
    sanitized = sanitized.replace(rule.pattern, (match) => maskSecretValue(match));
  }
  return sanitized;
}

/**
 * Check if a filename is in the sensitive file blacklist.
 */
export function isSensitiveFilename(filepath: string): boolean {
  if (!filepath) return false;
  const normalized = filepath.replace(/\\/g, "/");
  const basename = normalized.split("/").pop() || "";
  const lower = basename.toLowerCase();

  return SENSITIVE_FILENAMES.some((name) => lower === name.toLowerCase());
}
