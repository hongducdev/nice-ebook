#!/usr/bin/env node
/**
 * Jev Guardrail - Pre-Commit & Secret Verification Script
 * Ported from JevGuarAgent (JOG)
 *
 * Scans staged git files or repository source files to prevent accidental
 * commits of sensitive files (.env, keys) or hardcoded credentials.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync, execFileSync } from "node:child_process";
const SENSITIVE_FILENAMES = new Set([
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
]);

const SECRET_PATTERNS = [
  { name: "Anthropic API Key", pattern: /sk-ant-api[0-9]{2}-[A-Za-z0-9_-]{80,120}/g },
  { name: "OpenRouter API Key", pattern: /sk-or-v1-[a-f0-9]{64}/g },
  { name: "OpenAI API Key", pattern: /sk-(?!(?:ant|or)-)(?:proj-|live-)?[A-Za-z0-9_-]{32,80}/g },
  { name: "Google AI / Gemini API Key", pattern: /AIzaSy[A-Za-z0-9_-]{33}/g },
  { name: "GitHub Token", pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}|github_pat_[A-Za-z0-9_]{22}_[A-Za-z0-9_]{59}/g },
  { name: "AWS Access Key ID", pattern: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g },
  { name: "AWS Secret Access Key", pattern: /aws_secret_access_key\s*[:=]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/gi },
  { name: "Private RSA/SSH Key", pattern: /-----BEGIN (?:RSA |OPENSSH |DSA |EC )?PRIVATE KEY-----/g },
  { name: "Generic Bearer / JWT Token", pattern: /bearer\s+eyJh[A-Za-z0-9-_=]+\.eyJh[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]+/gi },
  { name: "Slack Token", pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g },
  { name: "Stripe Live Key", pattern: /(?:sk|rk)_live_[0-9a-zA-Z]{24,34}/g },
  { name: "Database URI with Credentials", pattern: /(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis):\/\/[^:]+:[^@\s]+@[a-zA-Z0-9.-]+/gi },
  { name: "Hardcoded Password / Secret Assignment", pattern: /(?:password|passwd|secret_key|client_secret|db_pass)\s*[:=]\s*['"][^'"\s]{8,}['"]/gi },
  { name: ".env Sensitive Assignment", pattern: /^(?:DB_PASSWORD|SECRET_KEY|API_KEY|AUTH_TOKEN|PRIVATE_KEY)\s*=\s*\S+/gm },
];

const IGNORED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".ico", ".icns", ".gif", ".webp",
  ".woff", ".woff2", ".ttf", ".eot",
  ".zip", ".epub", ".pdf", ".lock",
]);

const IGNORED_DIRS = new Set([
  "node_modules", "dist", "target", ".git", ".idea", ".vscode", "build"
]);

function mask(raw) {
  if (!raw || raw.length <= 8) return "***SECRET***";
  return raw.slice(0, 4) + "*".repeat(Math.min(16, raw.length - 8)) + raw.slice(-4);
}

function getFilesToCheck() {
  const args = process.argv.slice(2);
  const isStagedOnly = args.includes("--staged");

  if (isStagedOnly) {
    try {
      const output = execSync("git diff --cached --name-only --diff-filter=ACMR", { encoding: "utf8" });
      return output.split("\n").map(f => f.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  // Check git tracked / modified files or fallback to walk
  try {
    const output = execSync("git status --porcelain -uall", { encoding: "utf8" });
    const files = output
      .split("\n")
      .map(line => line.slice(3).trim())
      .filter(Boolean);
    if (files.length > 0) {
      return files;
    }
  } catch {
    // ignore
  }

  // Fallback: scan src, src-tauri, scripts
  const result = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (IGNORED_DIRS.has(ent.name)) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else {
        result.push(full);
      }
    }
  }

  walk("src");
  walk("src-tauri/src");
  walk("scripts");
  return result;
}

function checkFile(filepath, isStaged = false) {
  const normalized = filepath.replace(/\\/g, "/");
  const basename = path.basename(normalized);

  // 1. Sensitive filename check
  if (SENSITIVE_FILENAMES.has(basename.toLowerCase())) {
    return [{
      type: "sensitive_file",
      name: `Tệp cấu hình nhạy cảm (${basename})`,
      detail: "Không được commit tệp chứa cấu hình hoặc khóa bảo mật vào Git."
    }];
  }

  // Skip binary/ignored files
  const ext = path.extname(basename).toLowerCase();
  if (IGNORED_EXTENSIONS.has(ext)) {
    return [];
  }

  // 2. Content secret check
  let content = null;
  if (isStaged) {
    try {
      content = execFileSync("git", ["show", `:${normalized}`], {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      });
    } catch {
      return [];
    }
  } else {
    if (!fs.existsSync(filepath)) {
      return [];
    }
    try {
      content = fs.readFileSync(filepath, "utf8");
    } catch {
      return []; // Binary or unreadable
    }
  }

  if (!content) {
    return [];
  }
  if (normalized.endsWith("secretScrubber.test.ts") || normalized.endsWith("check-secrets.mjs")) {
    return [];
  }

  const violations = [];
  for (const rule of SECRET_PATTERNS) {
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(content)) !== null) {
      violations.push({
        type: "credential_leak",
        name: rule.name,
        detail: `Phát hiện: ${mask(match[0])}`
      });
      if (!rule.pattern.global) break;
    }
  }

  return violations;
}

function main() {
  const isStagedOnly = process.argv.includes("--staged");
  const files = getFilesToCheck();
  const allViolations = [];

  for (const file of files) {
    const issues = checkFile(file, isStagedOnly);
    if (issues.length > 0) {
      allViolations.push({ file, issues });
    }
  }

  if (allViolations.length > 0) {
    console.error("\n" + "=".repeat(65));
    console.error("🛡️  [Jev Guardrail] PHÁT HIỆN NGUY CƠ RÒ RỈ SECRET - BLOCK COMMIT");
    console.error("=".repeat(65));
    for (const v of allViolations) {
      console.error(`\n❌ Tệp: ${v.file}`);
      for (const iss of v.issues) {
        console.error(`   • [${iss.name}]: ${iss.detail}`);
      }
    }
    console.error("\n💡 Hướng dẫn khắc phục:");
    console.error("   1. Di chuyển các API keys / passwords vào file biến môi trường .env (đã thêm vào .gitignore).");
    console.error("   2. Sử dụng os.getenv() hoặc cấu hình lưu trữ bảo mật.");
    console.error("   3. Tuyệt đối không commit tệp chứa private key hoặc token xác thực.\n");
    process.exit(1);
  }

  console.log("🛡️  [Jev Guardrail] Kiểm tra an toàn bí mật: PASS (Không phát hiện rò rỉ trong " + files.length + " tệp)");
  process.exit(0);
}

main();
