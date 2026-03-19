# Voice Interview — Code Logic Summary

This document describes the logic flow for the AI voice interview feature across the three main files.

---

## 1. Frontend: `client/src/pages/candidate/VoiceInterviewRoom.tsx`

### Purpose
Candidate-facing UI: start interview, hear AI questions (TTS), speak answers (STT), auto-submit after pause, show transcript and status.

### Constants
| Constant | Value | Meaning |
|----------|--------|---------|
| `ANSWER_COMPLETE_PAUSE_MS` | 2500 | After 2.5s of silence → auto-submit (answer complete). Shorter pauses (thinking) are ignored. |
| `SILENCE_CHECK_FIRST_MS` | 8000 | No speech for 8s → send "(silence 8s)" → AI says "Just checking — can you hear me?" |
| `SILENCE_CHECK_SECOND_MS` | 7000 | After first check, 7s more (15s total) → send "(silence 15s)" → "Are you still there?" |
| `AI_THINKING_DELAY_MIN_MS` / `MAX_MS` | 600–900 | Random delay (ms) before showing/playing next AI question (simulate thinking). |

### State & Refs (main ones)
- **State:** `response`, `interimTranscript`, `isAISpeaking`, `isListening`, `audioEnabled`, `cameraOn`, `preferredLanguage`, `isAIThinking`, `expressionSamples`.
- **Refs:** `recognitionRef` (Web Speech API), `vadTimerRef` (2.5s pause → submit), `idleTimerRef` (8s/15s silence check), `latestResponseRef` / `latestInterimRef` (for submit), `isAISpeakingRef`, `ignoreResultsUntilRef` (ignore STT for 400ms after TTS ends), `silenceCheckPhaseRef` (0 = before 8s, 1 = 8s–15s), `submittedSilenceCheckRef` (so onSuccess doesn’t clear idle timer), `sessionStatusRef` (for refetchInterval).

### Flow (high level)
1. **Session** loaded via `getVoiceInterviewSession(sessionId)`; refetch every 5s when in progress and not `isAIThinking`.
2. **Assigned:** User picks language, can enable camera/mic, clicks “Start Interview” → `startVoiceInterview(sessionId, { preferredLanguage })`.
3. **In progress:**
   - **Pre-warm:** When `session.status === 'in_progress'`, effect gets mic + creates a `SpeechRecognition` instance, runs it briefly so it’s ready when user turns mic on.
   - **Mic on:** User clicks Mic → `startListening()`:
     - If pre-warmed `rec` and stream exist: set `rec.onresult`, `rec.onend`, `rec.onerror`, start idle timer (8s), call `rec.start()`.
     - Else: `getUserMedia`, create new `SpeechRecognition`, same handlers, start idle (8s) and `newRec.start()`.
   - **onresult (both paths):**
     - If `isAISpeakingRef.current` or `Date.now() < ignoreResultsUntilRef.current` → return (don’t process).
     - Else: accumulate final + interim, clear idle timer, call `scheduleAutoSubmit()` (reset 2.5s VAD timer), update `response` / `interimTranscript` and refs.
   - **VAD:** After 2.5s with no new speech, `autoSubmitRef.current()` runs → submit `(latestResponseRef + latestInterimRef).trim()` or `"(No response)"`.
   - **Idle:** If no speech at all: 8s → `silenceCheckRef.current()` sends "(silence 8s)", schedules next in 7s; 7s later → "(silence 15s)", then 8s again.
4. **TTS:** When `session.currentQuestion` changes, effect runs `speakQuestion(q, onEnd, lang)`. **Mic is not stopped**; we only set `isAISpeaking = true`. In `onEnd`: `isAISpeaking = false`, `ignoreResultsUntilRef = Date.now() + 400`, reset refs and idle timer (8s) so next answer is clean.
5. **Submit:** `submitVoiceInterviewAnswer(sessionId, text, { expressionSummary })`. On success:
   - If `done`: stop listening, redirect to report.
   - Else: if silence check → apply next question immediately; else apply after 600–900ms (“Thinking…”), then update cache so auto-speak plays the next question.

### Key functions
- **speakQuestion(text, onEnd?, languageCode?):** Browser `SpeechSynthesis`; uses `LANG_BCP47`, picks voice, speaks; `onEnd` when done.
- **runAutoSubmit():** Clears VAD/idle timers, submits `latestResponseRef + latestInterimRef` or "(No response)" with expression summary.
- **runSilenceCheck():** Submits "(silence 8s)" or "(silence 15s)", flips phase, schedules next idle (7s or 8s), sets `submittedSilenceCheckRef` so onSuccess keeps that timer.
- **startListening():** Gets mic (reuse pre-warm or new), attaches onresult (with ignore logic), onend (restart rec if still listening), onerror; starts 8s idle and `rec.start()`.
- **stopListening():** Clears timers, stops recognition and audio stream, sets `isListening` false.

---

## 2. Backend: `server/controllers/voiceInterviewController.ts`

### Purpose
Assign session, start interview (generate questions, first line), submit answer (conductor + special cases), get session/report; time-based question count.

### Helpers (no DB)
- **filterToInterviewQa(questions, answers):** Returns only substantive Q&A (excludes short/small-talk lines) for report/outcome.
- **isSilenceAnswer(text):** True for empty or "(No response)" / "(No answer provided)" / "[silence]".
- **isSilenceCheckMarker(text):** True for "(silence 8s)" or "(silence 15s)".
- **getSilenceCheck8sMessage(lang)** / **getSilenceCheck15sMessage(lang):** Localized "Just checking — can you hear me?" / "Are you still there?".
- **getAreYouThereMessage(lang):** Localized "Are you there? If you can hear me...".
- **isTechnicalIssue(text):** True if text mentions mic/audio/technical/reschedule issues.
- **userConfirmedReschedule(text):** True for yes/ok/reschedule/sure etc.
- **getRescheduleOfferMessage(lang):** Localized offer to reschedule.
- **maxTurnsFromDuration(durationMinutes):** `INTRO_TURNS (4) +` number of interview questions; questions = `min(12, max(3, floor((duration - 2) / 2)))` so total turns fit the recruiter-set duration.

### Assign (POST)
- Body: `applicationId`, optional `durationMinutes` (5–60, default 10).
- Creates `VoiceInterviewSession`: `max_questions = maxTurnsFromDuration(duration)`, `duration_minutes = duration`, `status: 'assigned'`, expires in 72h.
- Optional Alibaba DirectMail email to candidate (when ALIBABA_DM_FROM and ALIBABA_DM_PASS are set).

### Start (POST /session/:id/start)
- Body: optional `preferredLanguage`.
- Load session + job; get candidate CV text.
- **Question count:** `numInterviewQuestions = max(MIN_INTERVIEW_QUESTIONS, session.max_questions - INTRO_TURNS)`.
- **qwenService.generateConductorQuestions(** jobTitle, jobDescription, jobSkills, candidateContext, count: numInterviewQuestions, preferredLanguage **)** → list of question strings.
- Build **InterviewState:** phase `'greeting'`, questionIndex 0, smallTalkTurns 0, conversationHistory [], questions = conductorQuestions, candidateName, jobTitle, interviewerName 'Aria', preferredLanguage.
- **qwenService.startInterview(initialState)** → first line (greeting) + updated state.
- Save session: status `'in_progress'`, started_at, questions = [first line], answers [], conductor_state = updatedState.
- Return session id, status, currentQuestionIndex 0, maxQuestions, currentQuestion (greeting), preferredLanguage.

### Submit answer (POST /session/:id/answer)
- Body: `answerText`, optional `expressionSummary`.
- Load session; check in progress and not over `duration_minutes`.
- Parse `questions`, `answers`, `conductor_state` from session.
- **If conductor_state present:**

  1. **Silence check:** If `isSilenceCheckMarker(text)` → append user + assistant (8s or 15s message) to state, save, return `done: false`, currentQuestion = that message.

  2. **Generic silence:** If `isSilenceAnswer(text)` → append "(No response)" + getAreYouThereMessage, save, return same.

  3. **Reschedule confirm:** If `state.rescheduleOffered` and `userConfirmedReschedule(text)` → mark session completed, outcome = reschedule message, return `done: true` with goodbye.

  4. **Tech issue:** If not yet offered and `isTechnicalIssue(text)` → set `rescheduleOffered: true`, append user + getRescheduleOfferMessage, save, return that message.

  5. **Normal turn:** If phase is `'interview'`, append current Q and answer to questions/answers. Call **qwenService.conductInterview(state, text)** → nextLine, updatedState.

  6. **Closing:** If `updatedState.phase === 'closing'`: filter Q&A with filterToInterviewQa, call **generateVoiceInterviewOutcome**, save session (completed, outcome), return `done: true` and outcome.

  7. **Else:** Save updated questions, answers, conductor_state; return `done: false`, currentQuestion = nextLine.

- **If no conductor_state:** Legacy path (single Q&A step, then complete or next).

### Get session (GET)
- Returns session with **currentQuestion** from last assistant message in `conductor_state.conversationHistory` (so refetch shows latest line), or from questions[index] fallback.
- PreferredLanguage from state; endsAt from started_at + duration_minutes.

### Get report
- Load session; parse questions/answers; lazy-generate outcome if completed but outcome null (filterToInterviewQa + generateVoiceInterviewOutcome); return report with outcome and qa.

---

## 3. Qwen service: `server/services/qwen.ts` (interview part)

### Types
- **InterviewPhase:** `'greeting' | 'small_talk' | 'context_setting' | 'ready_check' | 'interview' | 'closing'`.
- **InterviewState:** phase, questionIndex, smallTalkTurns, conversationHistory (role + content), questions (string[]), candidateName, jobTitle, interviewerName?, preferredLanguage?, rescheduleOffered?.

### generateConductorQuestions(params)
- Input: jobTitle, jobDescription, jobSkills, candidateContext, count, preferredLanguage.
- Single prompt: generate exactly `count` questions for the role (behavioral + technical), one per line; if non-English, “output only in that language”.
- callQwen → split lines, strip numbering, filter length > 10, return slice(0, count).

### startInterview(state)
- phase is `'greeting'`. buildPhasePrompt(state) gives greeting instructions.
- callQwenWithHistory(systemPrompt, [{ role: 'user', content: openingPrompt }], respondInLanguage).
- Returns greeting text and updated state (conversationHistory = [openingPrompt, greeting]).

### conductInterview(state, userMessage)
- Append userMessage to history; **transitionPhase(state, userMessage)** → nextPhase (code-only, no LLM).
- buildPhasePrompt({ ...state, phase: nextPhase }) → systemPrompt.
- callQwenWithHistory(systemPrompt, history, respondInLanguage) → response.
- Append response to history; if nextPhase is interview and state.phase was interview, increment questionIndex.
- Return response and updatedState (phase, questionIndex, smallTalkTurns, conversationHistory).

### transitionPhase(state, userMessage)
- greeting → small_talk.
- small_talk → context_setting after smallTalkTurns >= 1, else small_talk.
- context_setting → ready_check.
- ready_check → interview if candidateIsReady(message), else ready_check.
- interview → closing if questionIndex >= questions.length - 1, else interview.
- closing → closing.

### candidateIsReady(message)
- True if message includes any of: yes, yep, sure, ready, let's go, okay, sounds good, etc.

### buildPhasePrompt(state)
- **basePersonality:** Language rule (if non-English: “output only in that language”), then: Aria is a professional interviewer, **formal but warm**, courteous and approachable; no bullet points; candidate name; output only spoken line.
- **Per phase:** Greeting (greet by name, introduce self, ask how they are / trouble joining; 2–3 sentences). Small_talk (respond, formal and interview-appropriate; 2–3 sentences). Context_setting (explain format, totalQuestions, role; 3–4 sentences). Ready_check (ask if ready or any questions; one sentence). Interview (acknowledge previous answer if not first, then ask current question only). Closing (thank, review and be in touch, any questions; 3–4 sentences).

### callQwenWithHistory(systemPrompt, history, respondInLanguage?)
- If respondInLanguage, append a user message: “Your next reply must be entirely in ${language}”.
- callQwenWithMessages(systemPrompt, messages, false) → plain text.

### generateVoiceInterviewOutcome(params)
- Input: jobTitle, questions[], answers[], expressionSummary?.
- Prompt: summarize for recruiter, fit, strengths, concerns; output SUMMARY (for recruiters). Parses JSON or fallback text; returns outcome string.

---

## End-to-end flow (single answer)

1. Candidate speaks → browser STT → onresult (if not ignored) → update transcript, reset 2.5s VAD timer.
2. 2.5s silence → runAutoSubmit() → POST answer with text + optional expressionSummary.
3. Backend: conductor checks (silence 8s/15s, generic silence, reschedule confirm, tech issue) or normal turn → conductInterview(state, text) → nextLine, updatedState.
4. If closing: generate outcome, save, return done: true. Else save state, return done: false, currentQuestion: nextLine.
5. Frontend onSuccess: if not done, apply next question after 600–900ms (or immediately for silence check); update cache → auto-speak effect runs → speakQuestion(nextLine). TTS onEnd: set ignore 400ms, reset refs and 8s idle; mic was never stopped so it keeps capturing.

---

## File locations

| File | Role |
|------|------|
| `client/src/pages/candidate/VoiceInterviewRoom.tsx` | UI, STT, TTS, VAD, idle/silence timers, submit, thinking delay. |
| `server/controllers/voiceInterviewController.ts` | Assign, start, submitAnswer, getSession, getReport; silence/tech/reschedule helpers; time-based question count. |
| `server/services/qwen.ts` | generateConductorQuestions, startInterview, conductInterview, transitionPhase, buildPhasePrompt, generateVoiceInterviewOutcome; formal-but-warm personality. |
