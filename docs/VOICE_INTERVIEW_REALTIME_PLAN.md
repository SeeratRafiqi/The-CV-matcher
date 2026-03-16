# Voice Interview — Real-Time Architecture & Implementation Plan

## Objective

Upgrade from button-based submission to a **real-time conversational AI interviewer**: continuous voice, no submit button, human-like flow, connection/silence handling, and rescheduling.

---

## ✅ Implemented (Steps 1–2)

### Step 1 & 2: Remove manual submit flow + Voice Activity Detection (VAD)

- **VAD**: When the user **pauses for ~700ms** after speaking, the current transcript is treated as complete and **sent automatically** to the backend (no button press).
- **Submit button**: Still available as **"Send now"** (optional) for edge cases; primary flow is auto-send on pause.
- **UI copy**: "Your answer is sent automatically when you pause (~0.7s). Or type and send."
- **Technical**: `pendingTranscriptRef` accumulates final STT results; `vadTimerRef` restarts on each final result; when the 700ms timer fires, `autoSubmitRef.current()` sends the text and clears state. Timer is cleared on manual submit and when stopping the mic.

---

## Current Pipeline (After Step 1–2)

```
Candidate speaks → Browser Web Speech API (STT)
  → Final result + 700ms pause → Auto-send transcript to backend
  → Backend: Qwen conductor (state machine) → next line (text)
  → TTS (Alibaba qwen3-tts-flash or browser) → audio to candidate
```

---

## Remaining Implementation Steps

### Step 3: Streaming Speech-to-Text (optional upgrade)

- **Current**: Browser Web Speech API (no streaming to backend).
- **Target**: Alibaba Paraformer streaming ASR via WebSocket.
- **Backend**: WebSocket proxy — client sends binary audio chunks; server forwards to `wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference/` (Fun-ASR/Paraformer), streams back `result-generated` transcript.
- **Frontend**: Capture mic at 16 kHz mono (e.g. `AudioContext` + `ScriptProcessorNode` or `MediaRecorder`), send WAV/PCM chunks over WebSocket; display partial/final transcript from server.
- **Note**: Can keep browser STT and add streaming ASR later for better latency and multilingual support.

---

### Step 4: Backend Interview Orchestrator (extend current conductor)

- **Current**: Conductor in `server/services/qwen.ts` + `voiceInterviewController.ts` — phases: greeting → small_talk → context_setting → ready_check → interview → closing.
- **Target (from spec)**: Align phases with spec where useful:
  1. Greeting  
  2. Warmup Questions  
  3. CV Discussion  
  4. Technical Questions  
  5. Follow-up Questions  
  6. Behavioral Questions  
  7. Closing  
- **Session model**: Add fields to `VoiceInterviewSession` or conductor state:
  - `technical_issue_count`, `silence_counter`, `last_activity_at` (for silence detection).
- **Orchestrator**: Decide next phase from state + last answer; call Qwen with phase-specific prompt; store conversation history. Already largely in place; extend with new phases and counters.

---

### Step 5: Qwen-Plus + Structured Prompt

- **Current**: Uses existing Qwen (e.g. `qwen-turbo`) via `callQwenWithHistory` and phase prompts in `buildPhasePrompt`.
- **Target**: Prefer **Qwen-Plus** for interviewer (set `QWEN_MODEL=qwen-plus` or add `interviewModel` in config). One system prompt for the interviewer:
  - Conversational, one question at a time, follow-ups from answers, acknowledge then next question, speak in candidate language, handle technical issues politely.
- **CV + JD context**: Already passed into `generateConductorQuestions` and conductor state (`jobTitle`, `jobDescription`, `jobSkills`, `candidateContext`). Ensure full CV text and JD are in the prompt when asking CV/technical/behavioral questions (already available in state; can add explicit “Candidate CV” / “Job Description” blocks in prompt).

---

### Step 6: Multilingual Support

- **Current**: Candidate chooses language before start; conductor and TTS use `preferredLanguage`; Qwen is instructed to reply only in that language.
- **Target**: Detect language from candidate speech (e.g. from ASR `language` if using Paraformer, or a small classifier on first segment) and set `session.language` or `conductor_state.detectedLanguage`; LLM and TTS use that. If no streaming ASR yet, keep current “choose language before start” and optional future “detect from first utterance”.

---

### Step 7: Silence Detection

- **Logic**: If no candidate message for **e.g. 8 seconds** (track `last_activity_at` or heartbeat), orchestrator injects a system message or sends a canned AI line: *“Just checking — can you hear me?”* If still no reply after another N seconds: *“Are you still there?”*
- **Implementation**: Backend timer or periodic check (e.g. every 5s) when session is `in_progress`: if `now - last_activity_at > 8s`, enqueue a “silence check” response (could be a fixed TTS line or one LLM call with a “silence check” prompt). Frontend can also track “last time we got a response” and show a “Reconnecting…” or “Are you there?” UI; backend drives the actual interviewer line.

---

### Step 8: Technical Issue Detection

- **Logic**: Detect phrases like “I can’t hear you”, “My mic is not working”, “Connection problem” in the candidate’s transcript (simple keyword match or small classifier). Set `state = TECHNICAL_ISSUE`; AI responds with: *“No problem. Please check your microphone settings. I’ll wait a moment.”*
- **Implementation**: In `submitAnswer`, before calling `conductInterview`, check `answerText` for technical-issue phrases; if match, either call a dedicated Qwen prompt for “technical issue” or return a fixed TTS line and increment `technical_issue_count`. Optionally after 1–2 such events, offer reschedule (Step 9).

---

### Step 9: Automatic Rescheduling

- **Logic**: If `technical_issue_count >= 2` (or similar), AI says: *“It seems we’re experiencing technical issues. Would you like to reschedule the interview for another time?”* If candidate agrees (e.g. “yes”, “reschedule”), create a reschedule event and update session status.
- **Implementation**: In conductor state, add `technical_issue_count` and a phase or flag `offering_reschedule`. When offering reschedule, next user message is parsed for agreement; if yes, call a backend method to create a new `VoiceInterviewSession` (or reschedule link) and mark current session as `rescheduled` or `cancelled`. Notify candidate (e.g. email or in-app) with new link/time.

---

### Step 10: Stream TTS to Frontend

- **Current**: Frontend requests TTS via `POST /voice-interviews/tts` with `{ text, languageCode }`; backend returns full WAV; frontend plays with `Audio` element.
- **Target**: Stream TTS so playback can start before the full sentence is generated (lower latency).
- **Options**:
  - **A)** DashScope TTS with `stream: true` (if supported for qwen3-tts-flash); backend streams chunks to frontend over HTTP chunked or WebSocket; frontend uses `AudioContext` + `decodeAudioData` on chunks or a streaming audio element.
  - **B)** Keep current “full audio” TTS and add a WebSocket channel: backend sends “TTS started” then base64/WAV chunks; frontend queues and plays. Same idea, different transport.

---

## Recommended Tech Stack (Current vs Spec)

| Component        | Spec suggestion | Current implementation        |
|-----------------|-----------------|------------------------------|
| Frontend        | React, WebRTC   | React, Web Speech API, optional WebSocket later |
| Backend         | Python, FastAPI | **Node.js, Express** (keep)  |
| LLM             | Qwen-Plus       | Qwen (configurable; set to qwen-plus for interview) |
| ASR             | Paraformer      | Browser STT (Paraformer via WebSocket proxy later) |
| TTS             | qwen3-tts-flash | qwen3-tts-flash (Alibaba) + browser fallback |
| Storage         | PostgreSQL, Redis | **Existing DB** (Sequelize); add columns as needed; Redis optional for “live” state |

---

## Implementation Order (Recommended)

1. ✅ **Steps 1–2**: VAD + auto-send (done).  
2. **Steps 5–6**: Orchestrator phases + Qwen-Plus + CV/JD prompt + multilingual (no new infra).  
3. **Steps 7–8**: Silence detection + technical issue detection (backend + small frontend hints).  
4. **Step 9**: Rescheduling flow (backend + optional email).  
5. **Step 3 + 10**: Streaming ASR (WebSocket proxy) + streaming TTS (when needed for latency).

This order gets you to a “real-time conversation” feel quickly (VAD + better prompts + silence/tech handling), then adds streaming and rescheduling.
