# AI provider notes (Member 2)

## What the demo uses
- Provider: Google Gemini API (AI Studio key, free tier)
- Model: `gemini-3.5-flash` (set with `GEMINI_MODEL`; `LLM_PROVIDER=gemini`)
- Optional: Anthropic Claude adapter (`LLM_PROVIDER=anthropic`, needs `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`). Not run for the demo unless a key and credits are available.
- Demo mode (`DEMO_MODE=true`) uses fixed sample data and calls no model. Every result is labelled DEMO.

## Model history (why the default changed)
- `gemini-2.5-flash` returned 404 on 11 Nov 2026. Google's deprecation page lists its shutdown as 16 Oct 2026, with `gemini-3.5-flash` as the suggested replacement.
- Model names change often. If you ever see "model not found (404)", check `GEMINI_MODEL`. `npx tsx src/services/ai/eval/listModels.ts` lists the models your key can use.

## Free-tier limits (fill in from AI Studio before the demo)
| Item | Value |
|---|---|
| Requests per minute | _TODO: copy from AI Studio for gemini-3.5-flash_ |
| Requests per day | _TODO_ |
| Tokens per minute | _TODO_ |
| Checked on | _TODO: date_ |

Limits change. Record the values you actually see on the day.

## Data handling
- Free-tier prompts may be logged or reviewed by Google. Use sample quotations only. Never send real vendor documents.
- API keys live only in each developer's local `.env`, never in Git.

## Evaluation result (sample quotations, real model)
Run: `npx tsx src/services/ai/eval/runEval.ts`

| Date | Model | Extraction accuracy | Injection test | Pipeline test |
|---|---|---|---|---|
| 11 Nov 2026 | gemini-3.5-flash | 100% (45/45 fields, quotes A, B, C and the injection quote) | PASS | PASS (A ranked first, B second, C rejected for the 7-day deadline; explanation by AI) |

## Safety design (what is verified in code, not trusted to the model)
- The model only returns JSON that must match a strict schema (extra keys are rejected).
- Every extracted value needs evidence text that actually appears in the document, and the amount must appear in that evidence. Otherwise the value is set to unknown and the buyer reviews it.
- Quotation text is treated as untrusted data. Instruction-like text is flagged, and values backed by it are removed.
- Budget, deadline, specifications, totals, ranking and approval are calculated by backend code. The model cannot change them.
- Explanation numbers are checked against backend data. If they do not match, a code-written template is shown instead.
- If the model fails, the error is shown. Live mode never falls back to fake data.
