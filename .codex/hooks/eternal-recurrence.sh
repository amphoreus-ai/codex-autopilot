#!/bin/sh

PHRASE_1='I CONFIRM TASK COMPLETION: I have fully achieved all requested goals, because'
PHRASE_2='I CONFIRM TASK FAILURE: I tried multiple approaches (at least 5 times), but cannot complete it due to objective constraints, because'
PHRASE_3='NO TASK: The user did not ask for a task to be completed, because'
PHRASE_4='TASK SUSPENDED: The task is still in progress, but I need user feedback, authorization, or more information to continue, because'

allowed_phrases_text() {
  printf '%s\n%s\n%s\n%s' \
    "- $PHRASE_1" \
    "- $PHRASE_2" \
    "- $PHRASE_3" \
    "- $PHRASE_4"
}

emit_continue() {
  printf '%s\n' '{"continue":true}'
}

emit_block() {
  reason=$1
  if command -v jq >/dev/null 2>&1; then
    jq -Rn --arg reason "$reason" '{"decision":"block","reason":$reason}'
  else
    printf '{"decision":"block","reason":"%s"}\n' "$reason"
  fi
}

block_reason() {
  printf '%s' "Agent run intercepted: your reply would pause the conversation, but it did not include a valid status declaration.\n\nWhenever you decide to end the current turn, include exactly one of the following phrases in your reply:\n$(allowed_phrases_text)\n\nPlease rewrite your reply to match your actual progress."
}

yield_block_reason() {
  printf '%s' "Let me think about it and I may have late reply; you can keep going. I trust your ability to work through the current difficulty. Review the context and error messages carefully, try different search strategies, tool calls, or code changes, and continue the task."
}

payload=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  emit_block "$(block_reason)"
  exit 0
fi

last_message=$(printf '%s' "$payload" | jq -r 'if type == "object" then (.last_assistant_message // "") else "" end | if type == "string" then . else "" end' 2>/dev/null)

case $last_message in
  *"$PHRASE_1"* | *"$PHRASE_2"* | *"$PHRASE_3"*)
    emit_continue
    exit 0
    ;;
  *"$PHRASE_4"*)
    emit_block "$(yield_block_reason)"
    exit 0
    ;;
esac

emit_block "$(block_reason)"
