# `ai-cost/missing-token-limit`

> Model call with no output token limit

| | |
| --- | --- |
| **Category** | AI Cost & Abuse Controls |
| **Severity** | `medium` |
| **Confidence** | `medium` |
| **Blocker** | No |
| **Tags** | `cost`, `llm` |

## What this means

A model call does not cap its output length. Output tokens are the expensive half of most pricing, and without a cap a single request can run to the model full context window - which is both the largest possible bill for that request and the slowest possible response.

## How to fix it

Set max_tokens (maxTokens in the Vercel AI SDK, max_output_tokens for Gemini) to the largest response your UI can actually display. Pick the number from the product requirement, not from the model maximum.

## References

- https://platform.openai.com/docs/api-reference/chat/create#chat-create-max_completion_tokens
- https://docs.claude.com/en/api/messages

## Disabling this rule

```json
{
  "rules": {
    "ai-cost/missing-token-limit": "off"
  }
}
```

---

[← All rules](./README.md)
