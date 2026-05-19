#!/usr/bin/env node

import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "..", "codex");
const dst = join(process.cwd(), ".codex");

cpSync(join(src, "hooks", "arar"), join(dst, "hooks", "arar"), { recursive: true });

const hooksPath = join(dst, "hooks.json");
const srcHooks = JSON.parse(readFileSync(join(src, "hooks.json"), "utf8")).hooks ?? {};
const target = existsSync(hooksPath) ? JSON.parse(readFileSync(hooksPath, "utf8")) : {};
target.hooks ??= {};

for (const [event, entries] of Object.entries(srcHooks)) {
    const list = (target.hooks[event] ??= []);
    const seen = new Set(list.map((e) => JSON.stringify(e)));
    for (const entry of entries) {
        const key = JSON.stringify(entry);
        if (!seen.has(key)) {
            seen.add(key);
            list.push(entry);
        }
    }
}

writeFileSync(hooksPath, `${JSON.stringify(target, null, 2)}\n`);
