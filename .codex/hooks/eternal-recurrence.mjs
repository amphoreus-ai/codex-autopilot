#!/usr/bin/env node

import process from "node:process";

const REQUIRED_PHRASES = [
  "I ABSOLUTELY CONFIRM THAT ALL TASKS ARE COMPLETE AND ALL GOALS HAVE BEEN ACHIEVED",
  "I ABSOLUTELY CONFIRM THAT IT IS IMPOSSIBLE TO COMPLETE ALL TASKS OR ACHIEVE ALL GOALS UNDER ANY CIRCUMSTANCES",
  "THE USER DID NOT SPECIFY ANY TASK",
];

function allowedPhrasesText() {
  return REQUIRED_PHRASES.map((phrase) => `"${phrase}"`).join(", ");
}

function emitJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  let payload;
  try {
    const rawInput = await readStdin();
    payload = JSON.parse(rawInput);
  } catch {
    emitJson({
      decision: "block",
      reason:
        "The Stop hook could not parse the current turn data. Do not end the current turn; " +
        "you may stop only if your final reply contains one of the following phrases verbatim: " +
        `${allowedPhrasesText()}.`,
    });
    return;
  }

  const lastMessage = payload.last_assistant_message || "";
  if (REQUIRED_PHRASES.some((phrase) => lastMessage.includes(phrase))) {
    emitJson({ continue: true });
    return;
  }

  const hookActive = Boolean(payload.stop_hook_active);
  const reminder = hookActive
    ? "The Stop hook has already continued you once; "
    : "Do not end the current turn; ";
  emitJson({
    decision: "block",
    reason:
      `${reminder}your final reply must contain one of the following phrases verbatim: ` +
      `${allowedPhrasesText()}. ` +
      "You may stop only when you are completely certain the task is finished, " +
      "or absolutely certain it cannot be completed.",
  });
}

await main();
