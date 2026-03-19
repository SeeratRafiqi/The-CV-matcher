# APIs and models used in this app

Use this list to look up **official pricing** for each service. All of these use the same Alibaba Cloud account / API key unless noted.

---

## 1. Alibaba DashScope — Qwen LLM (text generation)

**What it’s used for:** CV review, tailor resume, cover letter, match score, voice interview conversation, and other text-generation features.

| Item | Value |
|------|--------|
| **Service** | Alibaba Cloud Model Studio (DashScope) |
| **API type** | Chat completions (OpenAI-compatible endpoint) |
| **Model** | From env: `QWEN_MODEL` (default: **`qwen-turbo`**) |
| **Base URL** | From env: `ALIBABA_LLM_API_BASE_URL` (default: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`) |
| **Auth** | `ALIBABA_LLM_API_KEY` or `DASHSCOPE_API_KEY` |

**Where to see pricing (manual):**

- **Official pricing doc:**  
  https://www.alibabacloud.com/help/doc-detail/2987148.html  

- In that doc, find the row for **your** model (e.g. **Qwen-Turbo**, **Qwen-Plus**, **Qwen-Max**).  
- Pricing is usually given as **$ per 1M input tokens** and **$ per 1M output tokens**.  
- To match the admin “Usage & Cost” to your bill, set in server `.env`:
  - `ALIBABA_LLM_INPUT_PRICE_PER_1M=<value from doc>`
  - `ALIBABA_LLM_OUTPUT_PRICE_PER_1M=<value from doc>`

---

## 2. Alibaba DashScope — TTS (speech synthesis)

**What it’s used for:** Voice interview — turning AI replies into spoken audio (if enabled).

| Item | Value |
|------|--------|
| **Service** | Alibaba Cloud Model Studio (DashScope) — multimodal |
| **API type** | Multimodal generation (TTS) |
| **Model** | **`qwen3-tts-flash`** (fixed in code) |
| **Base URL** | From env: `ALIBABA_TTS_BASE_URL` (default: `https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`) |
| **Auth** | Same as LLM: `ALIBABA_LLM_API_KEY` or `DASHSCOPE_API_KEY` |

**Where to see pricing (manual):**

- Check the same Model Studio / DashScope billing and pricing pages for **TTS** or **multimodal** (e.g. speech) pricing.  
- Example entry point:  
  https://www.alibabacloud.com/help/en/model-studio/developer-reference/billing-for-generation  
- Or from the Alibaba Cloud console: **Billing** → **Model Studio** / **DashScope** and look for TTS / speech.

---

## 3. Optional: Alibaba DirectMail (voice interview assigned notification)

**What it’s used for:** When a company *assigns* a voice interview to a candidate, the app can send an email to the candidate via **Alibaba Cloud DirectMail** (e.g. “Voice interview scheduled for [Job] — complete before [date]”). Not used to run the interview itself.

| Item | Value |
|------|--------|
| **Service** | Alibaba Cloud DirectMail (SMTP) |
| **Env vars** | `ALIBABA_DM_FROM`, `ALIBABA_DM_PASS`; optional: `ALIBABA_DM_HOST`, `ALIBABA_DM_PORT`, `ALIBABA_DM_FROM_NAME`, `FRONTEND_URL` / `APP_URL` |
| **Pricing** | See Alibaba DirectMail billing. |

**Where to see pricing:** https://www.alibabacloud.com/help/en/direct-mail

---

## Summary table (for manual pricing lookup)

| # | API / product | Model(s) | Where to get pricing |
|---|----------------|----------|------------------------|
| 1 | **Alibaba DashScope (Qwen LLM)** | From `QWEN_MODEL`, default `qwen-turbo` | https://www.alibabacloud.com/help/doc-detail/2987148.html |
| 2 | **Alibaba DashScope (TTS)** | `qwen3-tts-flash` | Same Alibaba Model Studio / DashScope billing docs (TTS / speech section) |
| 3 | **Alibaba DirectMail** (optional) | — | For “voice interview assigned” email to candidate |

---

## Env vars that affect which model and pricing you use

- **`QWEN_MODEL`** — Which Qwen LLM model is used (e.g. `qwen-turbo`, `qwen-plus`, `qwen-max`). Must match the name in the Alibaba pricing doc when you set the per-1M token prices.
- **`ALIBABA_LLM_INPUT_PRICE_PER_1M`** — Input price ($ per 1M tokens). Default: International $0.05.
- **`ALIBABA_LLM_OUTPUT_PRICE_PER_1M`** — Output price ($ per 1M tokens). Default: International $0.2.
- **`ALIBABA_TTS_PRICE_PER_10K_CHARS`** — TTS price ($ per 10K characters). Default: International $0.115.
- **`ALIBABA_DM_FROM`** / **`ALIBABA_DM_PASS`** — Optional. When set, the app sends the candidate an email (via Alibaba DirectMail) when a voice interview is assigned.

The admin “Usage & Cost” page shows **real-time** cost and token usage by user using these rates.
