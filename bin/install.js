#!/usr/bin/env node

import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cwd = process.cwd();

function installFlavor({ srcDir, dstDir, hooksFile }) {
    cpSync(join(srcDir, "hooks", "arar"), join(dstDir, "hooks", "arar"), { recursive: true });

    const hooksPath = join(dstDir, hooksFile);
    const srcHooks = JSON.parse(readFileSync(join(srcDir, hooksFile), "utf8")).hooks ?? {};
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
}

installFlavor({
    srcDir: join(pkgRoot, "codex"),
    dstDir: join(cwd, ".codex"),
    hooksFile: "hooks.json",
});

installFlavor({
    srcDir: join(pkgRoot, "claude"),
    dstDir: join(cwd, ".claude"),
    hooksFile: "settings.json",
});
