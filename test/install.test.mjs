import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { installHook } from "../src/install.mjs";

const execFileAsync = promisify(execFile);

async function createRepo() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "agent-eternal-"));
  await execFileAsync("git", ["init"], { cwd: repoRoot });
  return repoRoot;
}

test("installs into an empty repository and is idempotent", async () => {
  const repoRoot = await createRepo();

  const firstRun = await installHook({ cwd: repoRoot });
  assert.equal(firstRun.messages.includes("already installed"), false);

  const hooksJson = JSON.parse(await readFile(path.join(repoRoot, ".codex", "hooks.json"), "utf8"));
  assert.deepEqual(hooksJson.hooks.Stop, [
    {
      hooks: [
        {
          type: "command",
          command: 'node "$(git rev-parse --show-toplevel)/.codex/hooks/eternal-recurrence.mjs"',
        },
      ],
    },
  ]);

  const configToml = await readFile(path.join(repoRoot, ".codex", "config.toml"), "utf8");
  assert.match(configToml, /\[features\]\ncodex_hooks = true\n?/);

  const secondRun = await installHook({ cwd: repoRoot });
  assert.equal(secondRun.messages.at(-1), "already installed");
});

test("preserves existing hooks and feature config", async () => {
  const repoRoot = await createRepo();
  await mkdir(path.join(repoRoot, ".codex", "hooks"), { recursive: true });

  await writeFile(
    path.join(repoRoot, ".codex", "hooks.json"),
    JSON.stringify(
      {
        hooks: {
          PreToolUse: [
            {
              hooks: [
                {
                  type: "command",
                  command: "echo pre",
                },
              ],
            },
          ],
          Stop: [
            {
              hooks: [
                {
                  type: "command",
                  command: "echo other-stop",
                },
              ],
            },
          ],
        },
        metadata: {
          owner: "user",
        },
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    path.join(repoRoot, ".codex", "config.toml"),
    '[other]\nvalue = 1\n\n[features]\ncustom = true\n',
  );

  await installHook({ cwd: repoRoot });

  const hooksJson = JSON.parse(await readFile(path.join(repoRoot, ".codex", "hooks.json"), "utf8"));
  assert.equal(hooksJson.metadata.owner, "user");
  assert.equal(hooksJson.hooks.PreToolUse[0].hooks[0].command, "echo pre");
  assert.equal(hooksJson.hooks.Stop[0].hooks[0].command, "echo other-stop");
  assert.equal(hooksJson.hooks.Stop[1].hooks[0].command, 'node "$(git rev-parse --show-toplevel)/.codex/hooks/eternal-recurrence.mjs"');

  const configToml = await readFile(path.join(repoRoot, ".codex", "config.toml"), "utf8");
  assert.match(configToml, /\[other\]\nvalue = 1/);
  assert.match(configToml, /\[features\][\s\S]*custom = true/);
  assert.match(configToml, /\[features\][\s\S]*codex_hooks = true/);
});

test("refuses to overwrite invalid hooks.json", async () => {
  const repoRoot = await createRepo();
  await mkdir(path.join(repoRoot, ".codex"), { recursive: true });
  await writeFile(path.join(repoRoot, ".codex", "hooks.json"), "{not valid json}\n");

  await assert.rejects(
    installHook({ cwd: repoRoot }),
    /hooks\.json exists but is not valid JSON; refusing to overwrite it\./,
  );
});
