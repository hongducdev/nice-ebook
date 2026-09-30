#!/usr/bin/env node
/**
 * Installs Git pre-commit hooks for nice-ebook.
 */
import fs from "node:fs";
import path from "node:path";

const gitHooksDir = path.join(process.cwd(), ".git", "hooks");
const hookPath = path.join(gitHooksDir, "pre-commit");

if (!fs.existsSync(gitHooksDir)) {
  console.log("No .git directory found. Skipping hook installation.");
  process.exit(0);
}

const hookContent = `#!/bin/sh
# Jev Guardrail - Pre-commit Hook for nice-ebook
node scripts/check-secrets.mjs --staged
`;

try {
  fs.writeFileSync(hookPath, hookContent, { mode: 0o755 });
  console.log("🛡️  [Jev Guardrail] Pre-commit hook successfully installed at .git/hooks/pre-commit");
} catch (err) {
  console.warn("Could not write pre-commit hook:", err.message);
}
