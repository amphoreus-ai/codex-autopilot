import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const HOOK_RELATIVE_PATH = path.join(".codex", "hooks", "eternal-recurrence.mjs");
const COMMAND = `node "$(git rev-parse --show-toplevel)/${HOOK_RELATIVE_PATH.replaceAll(path.sep, "/")}"`;
const DEFAULT_CONFIG = "[features]\ncodex_hooks = true\n";
const HOOK_TEMPLATE_PATH = fileURLToPath(
  new URL("../.codex/hooks/eternal-recurrence.mjs", import.meta.url),
);

function formatStatus(action, filePath) {
  return `${action}: ${filePath}`;
}

function parseHooksJson(source, filePath) {
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`${filePath} exists but is not valid JSON; refusing to overwrite it.`);
  }
}

function hasExistingCommand(stopEntries, command) {
  return stopEntries.some((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }

    if (entry.type === "command" && entry.command === command) {
      return true;
    }

    if (!Array.isArray(entry.hooks)) {
      return false;
    }

    return entry.hooks.some(
      (hook) => hook && typeof hook === "object" && hook.type === "command" && hook.command === command,
    );
  });
}

function mergeHooksJson(existing) {
  const root = existing ?? {};
  if (root === null || typeof root !== "object" || Array.isArray(root)) {
    throw new Error(".codex/hooks.json must contain a top-level object.");
  }

  const hooks = root.hooks;
  if (hooks !== undefined && (hooks === null || typeof hooks !== "object" || Array.isArray(hooks))) {
    throw new Error(".codex/hooks.json field \"hooks\" must be an object when present.");
  }

  const nextRoot = hooks === undefined ? { ...root, hooks: {} } : { ...root, hooks: { ...hooks } };
  const stopEntries = nextRoot.hooks.Stop;
  if (stopEntries !== undefined && !Array.isArray(stopEntries)) {
    throw new Error(".codex/hooks.json field \"hooks.Stop\" must be an array when present.");
  }

  const nextStopEntries = Array.isArray(stopEntries) ? [...stopEntries] : [];
  if (hasExistingCommand(nextStopEntries, COMMAND)) {
    return { changed: false, content: JSON.stringify(nextRoot, null, 2) + "\n" };
  }

  nextStopEntries.push({
    hooks: [
      {
        type: "command",
        command: COMMAND,
      },
    ],
  });
  nextRoot.hooks.Stop = nextStopEntries;

  return { changed: true, content: JSON.stringify(nextRoot, null, 2) + "\n" };
}

function mergeConfigToml(existing) {
  if (existing === null) {
    return { changed: true, content: DEFAULT_CONFIG };
  }

  const lines = existing.split("\n");
  const featuresIndex = lines.findIndex((line) => line.trim() === "[features]");

  if (featuresIndex === -1) {
    const separator = existing.endsWith("\n") ? (existing.endsWith("\n\n") ? "" : "\n") : "\n\n";
    return {
      changed: true,
      content: `${existing}${separator}[features]\ncodex_hooks = true\n`,
    };
  }

  let sectionEnd = lines.length;
  for (let index = featuresIndex + 1; index < lines.length; index += 1) {
    if (/^\s*\[[^\]]+\]\s*$/.test(lines[index])) {
      sectionEnd = index;
      break;
    }
  }

  const nextLines = [...lines];
  for (let index = featuresIndex + 1; index < sectionEnd; index += 1) {
    if (/^\s*codex_hooks\s*=/.test(nextLines[index])) {
      if (nextLines[index] === "codex_hooks = true") {
        return { changed: false, content: existing };
      }
      nextLines[index] = "codex_hooks = true";
      return {
        changed: true,
        content: `${nextLines.join("\n")}${existing.endsWith("\n") ? "" : "\n"}`,
      };
    }
  }

  nextLines.splice(featuresIndex + 1, 0, "codex_hooks = true");
  return {
    changed: true,
    content: `${nextLines.join("\n")}${existing.endsWith("\n") ? "" : "\n"}`,
  };
}

async function resolveRepoRoot(cwd) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd });
    return stdout.trim();
  } catch {
    throw new Error(`No Git repository found from ${cwd}.`);
  }
}

async function writeIfChanged(filePath, content) {
  let existing = null;
  try {
    existing = await readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }
  }

  if (existing === content) {
    return "unchanged";
  }

  await writeFile(filePath, content, "utf8");
  return existing === null ? "created" : "updated";
}

export async function installHook({ cwd = process.cwd() } = {}) {
  const repoRoot = await resolveRepoRoot(cwd);
  const codexDir = path.join(repoRoot, ".codex");
  const hooksDir = path.join(codexDir, "hooks");
  const hookConfigPath = path.join(codexDir, "hooks.json");
  const configTomlPath = path.join(codexDir, "config.toml");
  const hookScriptPath = path.join(repoRoot, HOOK_RELATIVE_PATH);

  await mkdir(hooksDir, { recursive: true });

  const hookSource = await readFile(HOOK_TEMPLATE_PATH, "utf8");

  let hookConfigSource = null;
  try {
    hookConfigSource = await readFile(hookConfigPath, "utf8");
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }
  }

  const parsedHooks = hookConfigSource === null ? {} : parseHooksJson(hookConfigSource, hookConfigPath);
  const mergedHooks = mergeHooksJson(parsedHooks);

  let configSource = null;
  try {
    configSource = await readFile(configTomlPath, "utf8");
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }
  }

  const mergedConfig = mergeConfigToml(configSource);
  const hookScriptStatus = await writeIfChanged(hookScriptPath, hookSource);
  const hookConfigStatus = await writeIfChanged(hookConfigPath, mergedHooks.content);
  const configStatus = await writeIfChanged(configTomlPath, mergedConfig.content);

  const messages = [
    formatStatus(hookScriptStatus, HOOK_RELATIVE_PATH),
    formatStatus(hookConfigStatus, path.join(".codex", "hooks.json")),
    formatStatus(configStatus, path.join(".codex", "config.toml")),
  ];

  if ([hookScriptStatus, hookConfigStatus, configStatus].every((status) => status === "unchanged")) {
    messages.push("already installed");
  }

  return { repoRoot, messages };
}
