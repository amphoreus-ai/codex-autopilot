#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON, parseTOML, stringifyJSON, stringifyTOML } from "confbox";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, ".codex");
const dst = join(process.cwd(), ".codex");
const srcHookDir = join(src, "hooks", "codex-autopilot");
const dstHookDir = join(dst, "hooks", "codex-autopilot");

mkdirSync(join(dst, "hooks"), { recursive: true });

if (resolve(srcHookDir) !== resolve(dstHookDir)) {
    cpSync(srcHookDir, dstHookDir, { recursive: true, force: true, errorOnExist: false });
}

const configPath = join(dst, "config.toml");
const config = existsSync(configPath) ? parseTOML(readFileSync(configPath, "utf8")) : {};
config.features = { ...(config.features ?? {}), codex_hooks: true };
writeIfChanged(configPath, `${stringifyTOML(config).trimEnd()}\n`);

const hooksPath = join(dst, "hooks.json");
const sourceHooks = parseJSON(readFileSync(join(src, "hooks.json"), "utf8"));
const targetHooks = existsSync(hooksPath) ? parseJSON(readFileSync(hooksPath, "utf8")) : {};
const mergedHooks = { ...targetHooks, hooks: { ...(targetHooks.hooks ?? {}) } };

for (const [event, entries] of Object.entries(sourceHooks.hooks ?? {})) {
    const list = [...(mergedHooks.hooks[event] ?? [])];
    const seen = new Set(list.map((entry) => JSON.stringify(entry)));
    for (const entry of entries) {
        const key = JSON.stringify(entry);
        if (!seen.has(key)) {
            seen.add(key);
            list.push(entry);
        }
    }
    mergedHooks.hooks[event] = list;
}

writeIfChanged(hooksPath, `${stringifyJSON(mergedHooks, { indentation: 2 }).trimEnd()}\n`);

function writeIfChanged(path, content) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
        writeFileSync(path, content);
    }
}