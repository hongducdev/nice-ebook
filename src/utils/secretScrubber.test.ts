import { describe, it, expect } from "vitest";
import {
  detectSecrets,
  maskSecrets,
  hasSecrets,
  isSensitiveFilename,
  maskSecretValue,
} from "./secretScrubber";

describe("secretScrubber", () => {
  describe("maskSecretValue", () => {
    it("returns ***SECRET*** for short strings", () => {
      expect(maskSecretValue("1234567")).toBe("***SECRET***");
      expect(maskSecretValue("")).toBe("***SECRET***");
    });

    it("masks characters preserving first 4 and last 4 characters", () => {
      const masked = maskSecretValue("sk-or-v1-0123456789abcdef0123456789abcdef");
      expect(masked.startsWith("sk-o")).toBe(true);
      expect(masked.endsWith("cdef")).toBe(true);
      expect(masked).toContain("****");
    });
  });

  describe("detectSecrets", () => {
    it("returns empty array for safe text", () => {
      expect(detectSecrets("This is a normal paragraph about ebooks.")).toEqual([]);
      expect(detectSecrets("")).toEqual([]);
    });

    it("detects OpenRouter API keys", () => {
      const fakeOpenRouterKey = "sk-or-v1-" + "a".repeat(64);
      const text = `Connect using key: ${fakeOpenRouterKey} in production`;
      const detected = detectSecrets(text);

      expect(detected.length).toBe(1);
      expect(detected[0].name).toBe("OpenRouter API Key");
      expect(detected[0].matched).toBe(fakeOpenRouterKey);
      expect(detected[0].riskScore).toBe(1.0);
    });

    it("detects OpenAI API keys", () => {
      const fakeOpenAiKey = "sk-proj-" + "b".repeat(48);
      const text = `Authorization: Bearer ${fakeOpenAiKey}`;
      const detected = detectSecrets(text);

      expect(detected.length).toBeGreaterThanOrEqual(1);
      expect(detected.some((d) => d.name === "OpenAI API Key")).toBe(true);
    });

    it("detects Anthropic API keys", () => {
      const fakeAnthropicKey = "sk-ant-api03-" + "c".repeat(85);
      const text = `ANTHROPIC_KEY=${fakeAnthropicKey}`;
      const detected = detectSecrets(text);

      expect(detected.length).toBe(1);
      expect(detected[0].name).toBe("Anthropic API Key");
    });

    it("detects Google AI Gemini API keys", () => {
      const fakeGeminiKey = "AIzaSy" + "d".repeat(33);
      const text = `Gemini key: ${fakeGeminiKey}`;
      const detected = detectSecrets(text);

      expect(detected.length).toBe(1);
      expect(detected[0].name).toBe("Google AI / Gemini API Key");
    });

    it("detects Private RSA/SSH Keys", () => {
      const keySnippet = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0";
      const detected = detectSecrets(keySnippet);

      expect(detected.length).toBe(1);
      expect(detected[0].name).toBe("Private RSA/SSH Key");
    });

    it("detects database connection strings with passwords", () => {
      const dbUri = "postgres://admin:SuperSecretPass123@db.internal.net:5432/ebooks";
      const detected = detectSecrets(`Database is at ${dbUri}`);

      expect(detected.length).toBe(1);
      expect(detected[0].name).toBe("Database URI with Credentials");
    });

    it("detects hardcoded password assignments", () => {
      const pass = 'password = "supersecretpassword123"';
      const detected = detectSecrets(pass);

      expect(detected.length).toBe(1);
      expect(detected[0].name).toBe("Hardcoded Password / Secret Assignment");
    });
  });

  describe("hasSecrets", () => {
    it("returns true when any secret pattern matches", () => {
      const fakeKey = "sk-or-v1-" + "f".repeat(64);
      expect(hasSecrets(fakeKey)).toBe(true);
    });

    it("returns false for regular strings", () => {
      expect(hasSecrets("Xin chào thế giới sách")).toBe(false);
      expect(hasSecrets("const model = 'gemini-2.0-flash';")).toBe(false);
    });
  });

  describe("maskSecrets", () => {
    it("replaces secrets in text with masked string", () => {
      const fakeKey = "sk-or-v1-" + "9".repeat(64);
      const raw = `Error connecting with token ${fakeKey}. Please retry.`;
      const masked = maskSecrets(raw);

      expect(masked).not.toContain(fakeKey);
      expect(masked).toContain("sk-o");
      expect(masked).toContain("****");
      expect(masked).toContain(". Please retry.");
    });

    it("leaves safe text unchanged", () => {
      const safe = "Chương 1: Bình minh trên thảo nguyên";
      expect(maskSecrets(safe)).toBe(safe);
    });
  });

  describe("isSensitiveFilename", () => {
    it("identifies sensitive configuration and key files", () => {
      expect(isSensitiveFilename(".env")).toBe(true);
      expect(isSensitiveFilename("path/to/.env.local")).toBe(true);
      expect(isSensitiveFilename("C:\\Users\\dev\\.env.production")).toBe(true);
      expect(isSensitiveFilename("id_rsa")).toBe(true);
      expect(isSensitiveFilename("id_ed25519")).toBe(true);
      expect(isSensitiveFilename("service-account.json")).toBe(true);
      expect(isSensitiveFilename("secret.json")).toBe(true);
      expect(isSensitiveFilename("private_key.pem")).toBe(true);
    });

    it("returns false for regular source and doc files", () => {
      expect(isSensitiveFilename("src/App.tsx")).toBe(false);
      expect(isSensitiveFilename("package.json")).toBe(false);
      expect(isSensitiveFilename(".env.example")).toBe(false);
      expect(isSensitiveFilename("README.md")).toBe(false);
      expect(isSensitiveFilename("")).toBe(false);
    });
  });
});
