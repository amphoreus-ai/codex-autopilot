#!/usr/bin/env node

import process from "node:process";

import { installHook } from "../src/install.mjs";

function parseArgs(argv) {
  const options = {
    cwd: process.cwd(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--cwd") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("--cwd requires a path");
      }
      options.cwd = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await installHook(options);
  console.log(`repository: ${result.repoRoot}`);

  for (const line of result.messages) {
    console.log(line);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
