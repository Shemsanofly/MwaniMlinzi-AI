# Voice-Call Assistant — Design

**Status:** Draft for review · **Author:** Claude Opus 4.7 (pair-brainstormed) · **Date:** 2026-10-03

A conversational phone assistant for Zanzibar seaweed farmers. A farmer dials an
Africa's Talking (AT) number from any ordinary mobile phone, speaks a question in
Kiswahili or English, and gets a short, grounded spoken answer. Follow-up
questions continue in the same call.

Everything in this spec is additive to the existing MwaniMlinzi-AI codebase. SMS,
USSD, WhatsApp and web features must keep working unchanged.

---

## 1. Intent and success criteria

**Who it is for.** A smallholder seaweed farmer in Zanzibar with a feature phone,
no smartphone, no internet, possibly limited literacy. Common topics: planting,
seed selection, farm maintenance, whitening / ice-ice disease, poor growth,
harvesting, drying, storage.

**What success looks like.** Calling `+255699920003` (the live test number
issued by Africa's Talking, since the AT Voice sandbox is not operational), a
farmer:

1. Hears the greeting *"Karibu MwaniMlinzi. Mimi ni msaidizi wa akili bandia wa
   kilimo cha mwani. Una swali gani kuhusu mwani?"* within ~1 second of the call
   connecting.
2. Can ask a Kiswahili question freely (no DTMF menu).
3. Gets a one-to-two-sentence grounded answer back in Kiswahili.
4. Can ask several follow-up questions in the same call; the assistant
   remembers prior turns.
5. Can switch to English by speaking it.
6. Ends the call by saying "asante, nimemaliza" (or hanging up).
7. Receives no fabricated prices, forecasts, farm records, diagnoses or
   treatment instructions.

**What does not count as success for this iteration.**

- Natural barge-in / interruption — not supported by AT's Voice XML actions.
- < 1 s turn latency — not possible under record-transcribe.
- Streaming STT — not available on AT.
- Writing to farm records from a voice call without an explicit spoken
  confirmation turn.
- A voice sandbox simulator — AT has retired theirs; see §12.

**Design brief verified against the pasted requirements.** The requirement
"Verify the current official voice documentation before choosing the
architecture" was carried out before this spec: AT Voice XML gives
`Say / Play / GetDigits / Record / Dial / Enqueue`, no streaming STT, no
native Swahili STT. The "VAPI Integration Guide" references a separate SIP
path to vapi.ai. Caller rejected that path for this iteration; it is retained
as a future upgrade (§13).

---

## 2. External facts and constraints (verified 2026-10-03)

| Fact | Source |
|---|---|
| AT Voice sandbox is **not operational**; a live number must be requested through *Phone number settings → Request Number → Category: Test Number*. Contact `voice@africastalking.com`. | AT help centre, article last updated Feb 2026. |
| AT Voice XML actions are `Say, Play, GetDigits, Record, Dial, Enqueue`. No streaming STT, no barge-in. | `developers.africastalking.com/docs/voice/actions/overview`. |
| AT does not sign callbacks; a shared secret per callback URL is standard practice (project already uses `AT_CALLBACK_SECRET` on USSD/SMS). | `backend/src/controllers/integrationController.js`. |
| OpenAI Whisper (`whisper-1`) supports Kiswahili. Pricing: USD $0.006 / audio minute at time of writing. | OpenAI pricing page. |
| Google Cloud TTS exposes `sw-KE-Standard-A/B/C/D` neural voices. Free quota: 4 M chars / month standard, 1 M chars / month WaveNet. | Google Cloud TTS pricing page. |
| Live test number issued to this project: `+255699920003`. Callback URL exposed via ngrok during development. |  Supplied by caller. |

---

## 3. Where this fits in the existing codebase

Reused as-is:

- `backend/src/providers/africastalking/config.js` (`atConfig`, callback-URL
  rendering).
- `backend/src/providers/llmProvider.js` (`OpenAILLMProvider`,
  `AnthropicLLMProvider`, `TemplateLLMProvider`).
- `backend/src/services/assistantService.js` (`AssistantService.chat`,
  `detectLanguage`, `parseObservation`, `SAFETY`) — called from the voice
  layer only when a farmer is authenticated with a voice PIN.
- `backend/src/controllers/integrationController.js` (`secretOk` constant-time
  secret check pattern; dedup / idempotency pattern).
- `backend/src/services/ussdService.js` session-row pattern — mirrored one-for-one
  for voice.
- `backend/src/utils/phone.js` (`normalizeTzPhone`, `maskPhone`).
- `backend/src/utils/background.js` (`runInBackground` — used so AT's 15 s
  callback budget is never exceeded for long STT/LLM/TTS pipelines).
- `backend/src/config/env.js` (one more config block).
- `backend/prisma/schema.prisma` (one new model, one new column on `Farmer`).

Added:

- `backend/src/providers/voice/sttProvider.js` — Whisper + Google STT.
- `backend/src/providers/voice/ttsProvider.js` — Google TTS + ElevenLabs +
  AT-`<Say>` fallback.
- `backend/src/providers/voice/atVoiceXml.js` — `<Response>` builder with
  escaping (XML entity-safe).
- `backend/src/services/voiceSessionService.js` — session row CRUD + state.
- `backend/src/services/voiceAssistantService.js` — orchestration (STT → route →
  retrieve → compose → TTS). Owns the voice-specific prompt and the
  short-answer discipline.
- `backend/src/services/seaweedKbService.js` — retrieval over the curated
  knowledge pack.
- `backend/src/data/seaweedKb/*.json` — one JSON card per topic, bilingual,
  source-cited.
- `backend/src/controllers/voiceController.js` — three HTTP handlers (entry,
  turn callback, status events) + the audio-serving handler.
- `backend/src/routes/integrations.routes.js` — three new routes mounted next
  to the existing AT USSD / SMS routes.
- `backend/src/routes/voice.routes.js` — HMAC-signed audio serving route.
- `backend/uploads/voice/` — TTS cache (gitignored, retention sweep).
- `backend/tests/services/voiceAssistantService.test.js`,
  `backend/tests/services/seaweedKbService.test.js`,
  `backend/tests/controllers/voiceController.test.js`,
  `backend/tests/providers/atVoiceXml.test.js`.
- `docs/VOICE.md` — operator guide (parallel to `docs/AFRICASTALKING.md`).

Not touched:

- Frontend. The admin voice-session viewer reuses the existing event-log /
  notification admin screens via the new rows those tables accrete. No new
  React screens in this iteration.
- Any existing route, service or Prisma model (strictly additive migration).

---

## 4. Call-flow state machine (authoritative)

AT POSTs form-urlencoded data to the callback URL on every event. The response
is XML with `Content-Type: application/xml`. Every URL carries
`?secret=<AT_CALLBACK_SECRET>` and is verified with the same constant-time
check already used by `secretOk` in `integrationController.js`.

```
                     ┌─────────────────────────────┐
                     │ Farmer dials +255699920003  │
                     └─────────────┬───────────────┘
                                   │
                                   ▼
     AT ─▶ POST /api/integrations/africastalking/voice?secret=…
          form: { sessionId, callerNumber, isActive=1, direction=Inbound, ... }
                                   │
          voiceController.entry:
            1. secretOk → 403 if not.
            2. find-or-create VoiceSession(id=sessionId, callerNumber=normalised).
            3. load caller: User lookup by phoneNumber (optional).
            4. respond with greetingXml():
               <Response>
                 <Say voice="woman" playBeep="false">
                   Karibu MwaniMlinzi. Mimi ni msaidizi wa akili bandia wa
                   kilimo cha mwani. Mazungumzo yetu yatarekodiwa ili kuboresha
                   huduma. Una swali gani kuhusu mwani? Sema baada ya mlio,
                   bonyeza nyota ukimaliza.
                 </Say>
                 <Record maxLength="30" timeout="4" trimSilence="true"
                         playBeep="true" finishOnKey="*"
                         callbackUrl="https://…/api/integrations/africastalking/voice/turn?secret=…"/>
               </Response>
                                   │
                                   ▼
     AT ─▶ POST /api/integrations/africastalking/voice/turn?secret=…
          form: { sessionId, recordingUrl, durationInSeconds, callerNumber, ... }
                                   │
          voiceController.turn:
            1. secretOk → 403 if not.
            2. load VoiceSession; if ended → 200 with <Response><Hangup/></Response>.
            3. idempotency: if session.lastRecordingUrl === recordingUrl →
               replay cached XML, no side effects.
            4. voiceAssistantService.handleTurn({ session, recordingUrl }):
               a. download mp3 (bounded size, 15 s timeout).
               b. STT (Whisper default; language auto, prompt-bias "sw");
                  text + detected language returned.
               c. language sticky-set: first turn's detected lang wins; later
                  turns update only on strong signal (reuses detectLanguage).
               d. intent / goodbye / consent-decline / pin-flow routing (§5).
               e. retrieve from seaweedKbService + (if PIN-authenticated and
                  the question is farm-specific) AssistantService.chat.
               f. compose short reply (one or two sentences, phone-form).
               g. TTS → mp3 cached by sha256(text|lang|voice).
            5. respond:
               <Response>
                 <Play url="https://…/api/voice/audio/<hash>.mp3?sig=…&exp=…"/>
                 { continue ? <Record …/> : <Hangup/> }
               </Response>
            6. append turn to session.transcript; bump session.turnCount;
               session.lastRecordingUrl = recordingUrl.
                                   │
                                   ▼
                            (loop until done)
                                   │
                                   ▼
     AT ─▶ POST /api/integrations/africastalking/voice/events?secret=…
          form: { sessionId, isActive=0, status, callStartTime, callEndTime,
                  durationInSeconds, amount, ... }
                                   │
          voiceController.events:
            1. secretOk.
            2. finalize VoiceSession.endedAt, endedReason, totals.
            3. optional: event_log row for admin console.
```

**Turn budget.** Hard caps: 30 s per recording; 10 turns per call; 10 min total
call duration; 15 s hard deadline on the entire STT+LLM+TTS pipeline (any step
breaching it serves a cached "samahani, nimechelewa, uliza tena" clip).

**Idempotency.** AT retries unreplied callbacks. We dedup by
`(sessionId, recordingUrl)` on turn callbacks and by `(sessionId, isActive)` on
event callbacks. The last served XML and the last served audio URL are stored
on the session row so a retry replays exactly, no re-charging STT/TTS.

---

## 5. Turn routing inside `voiceAssistantService`

```
transcript (STT text) →
  detectLanguage()
  detectGoodbye()        // "asante nimemaliza", "nimemaliza", "stop", "mwisho", "nina enda"
  detectConsentDecline() // "sikubali", "nakataa"
  detectPinRequest()     // "shamba langu", "my farm", "taarifa zangu"
  (reused) assistantService.detectIntent() for symptom / observation / why-risk
  seaweedKbService.search(text, lang) → top-k cards with scores
  decide:
    - goodbye            → farewell template + endedReason=USER_GOODBYE, hangup
    - consent-decline    → brief acknowledgment, delete transcript, hangup
    - unknown + no cards → "Samahani, sijui jibu la swali hilo. Ningependa
                             kuwaunganisha na afisa ugani. Kwa sasa, uliza swali
                             lingine kuhusu mwani."
    - cards found,
      no farm-specific   → compose answer from top card(s), paraphrased by LLM,
                             forbidden to invent (§6)
    - farm-specific +
      pin-authenticated  → delegate the private part to AssistantService.chat,
                             then phone-shape the reply
    - farm-specific +
      not pin-authed     → "Ili nikuambie taarifa za shamba lako, bonyeza PIN
                             yako ya tarakimu nne baada ya mlio." → respond with
                             <GetDigits numDigits=4 finishOnKey=# …/>.
```

**PIN flow details.** A new nullable column `Farmer.voicePinHash` (bcrypt).
Three failed attempts in a session → session flagged `pinLocked=true` and
further farm-specific questions get the generic KB answer only. PIN is set by
the farmer on the web profile page in a later feature; for the first live
test, admins can seed a PIN directly in the DB (documented in `docs/VOICE.md`).

**Short-answer discipline.** The LLM is invoked only to paraphrase and
translate retrieved content. Its system prompt:

> You are the MwaniMlinzi phone assistant speaking to a seaweed farmer in
> Zanzibar. Reply in {LANG} in one or two short sentences (max 25 words in
> Kiswahili, max 20 words in English). Use only the facts in CONTEXT. Never
> invent prices, forecasts, farm records, diagnoses or treatment steps. If
> CONTEXT does not answer the question, say exactly: "{FALLBACK_TEXT}".

Both the prompt and `FALLBACK_TEXT` are reviewed by the admin / curator and
stored in `backend/src/data/seaweedKb/_system.json`.

---

## 6. Knowledge base — the ground truth

**Shape.** One JSON file per topic in `backend/src/data/seaweedKb/`. Example:

```json
{
  "id": "whitening-ice-ice",
  "topic": "whitening",
  "aliases_sw": ["weupe", "nyeupe", "ice-ice", "rangi ya mwani"],
  "aliases_en": ["whitening", "ice-ice", "bleaching"],
  "question_variants": [
    { "lang": "sw", "text": "Mwani wangu umekuwa mweupe, nifanye nini?" },
    { "lang": "en", "text": "My seaweed is turning white, what do I do?" }
  ],
  "answer_sw": "Weupe wa mwani (ice-ice) hutokea wakati wa joto kali na chumvi ya chini. Hamisha mistari hadi maji baridi na uondoe matawi yaliyoathirika. Ripoti kwa afisa ugani.",
  "answer_en": "Whitening (ice-ice) comes from heat stress and low salinity. Move affected lines to cooler, deeper water and remove damaged branches. Report to the extension officer.",
  "source": "Msuya F.E. (2011). WIOMSA technical manual on seaweed farming, section 4."
}
```

Initial cards (minimum shippable set):

- planting (seedling attachment, line spacing, tie method)
- seed-selection (healthy young branches, cystocarp signs)
- farm-maintenance (cleaning, re-tying, inspection cadence)
- whitening / ice-ice (above)
- poor-growth (salinity, temperature, grazing, epiphytes)
- harvesting (timing, cutting method, minimum age)
- drying (ground-free racks, duration, moisture)
- storage (dry sacks, pest avoidance)
- pests-epiphytes (common ones, mechanical removal)

Each card ships with a real citation. During implementation, citations are
pulled from: FAO *Culture of Kappaphycus and Eucheuma in Zanzibar* (2018),
WIOMSA technical bulletins, Zanzibar Department of Fisheries extension
materials. No citation is invented. If a shipped card cannot be sourced it is
dropped before merge.

**Retrieval.** BM25 over `topic + aliases_* + question_variants + answer_*`
(implemented inline with `natural` or a hand-rolled tokenizer — chosen in
implementation). Top-3 scored candidates handed to the LLM reranker along with
the user's transcript. If the top score < threshold T, treat as unknown.
Threshold T calibrated against a fixture of 30 labelled utterances in
`tests/fixtures/voice/utterances.json`.

**Why not a vector DB.** The pack is ~30–60 cards. Keyword retrieval with LLM
rerank handles that scale with no new infra and no new dependency. If the pack
grows past ~500 cards the design opens cleanly to an embeddings swap behind
the same `seaweedKbService.search()` interface.

---

## 7. New Prisma schema

```prisma
model VoiceSession {
  id                String   @id                    // AT sessionId (unique per call)
  callerNumber      String?                          // normalised +255…, nullable so a consent-decline turn can clear it
  language          Language @default(SW)
  farmerId          String?                          // populated after PIN verification
  farmerFarmId      String?                          // active farm for PIN-authed sessions
  consentGiven      Boolean  @default(true)         // true = farmer heard the consent sentence and continued; set to false ONLY on explicit "sikubali"/"nakataa" at turn 1 (triggers transcript+callerNumber clear)
  pinAttempts       Int      @default(0)
  pinLocked         Boolean  @default(false)
  turnCount         Int      @default(0)
  endedReason       String?                          // USER_HANGUP | USER_GOODBYE | MAX_TURNS | CONSENT_DECLINED | ERROR
  lastRecordingUrl  String?                          // idempotency key for the latest turn
  lastResponseXml   String?                          // served to AT on retry replay
  transcript        Json     @default("[]")        // [{role,text,lang,ts,intent?,kb_ids?}]
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  endedAt           DateTime?
  @@index([callerNumber])
  @@index([createdAt])
  @@map("voice_sessions")
}

model Farmer {
  // ... existing columns ...
  voicePinHash  String?   // bcrypt, 4-digit PIN, nullable. Null = voice-locked for private data.
  voicePinSetAt DateTime?
}
```

Migration is additive. Existing rows unaffected. No DB-level enum change
needed; `endedReason` is a free-text column for operational flexibility
(mirrors the "QUEUED / SENT / NOT_CONFIGURED" string pattern already used by
SMS).

---

## 8. HTTP endpoints added

| Verb | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/api/integrations/africastalking/voice` | Entry callback (first ring + any `<Redirect>`). Returns XML. | `?secret=` constant-time |
| POST | `/api/integrations/africastalking/voice/turn` | `<Record>` finished → the farmer's turn. Returns XML. | `?secret=` constant-time |
| POST | `/api/integrations/africastalking/voice/events` | Call-end / status callback. Returns 200. | `?secret=` constant-time |
| GET  | `/api/voice/audio/:hash.mp3` | TTS audio for `<Play>`. Returns audio/mpeg. | HMAC-signed URL (`sig`, `exp`) using `AT_CALLBACK_SECRET` |

**All four endpoints bypass auth but are mounted under
`integrationLimiter`** (same rate-limit middleware already used for AT USSD /
SMS). The audio handler also validates `exp` against the current time and
compares `sig` with `crypto.timingSafeEqual`.

**Response bodies are XML, not JSON.** Content-Type `application/xml;
charset=utf-8`. Entity escaping is handled by `atVoiceXml.js` — the only path
that writes raw XML.

---

## 9. STT / TTS providers

### 9.1 STT (`sttProvider.js`)

```
interface STTProvider {
  name: string;
  isLive: boolean;
  transcribe({ audioBuffer, mimeType, hintLang, maxDurationS }): Promise<{
    text: string;        // '' when unintelligible
    language: 'sw' | 'en' | null;
    confidence: number | null;
    rawProvider: object; // for logging/debug only
  }>;
}
```

Implementations:

- `OpenAIWhisperSTTProvider` — `whisper-1`, multipart upload of the mp3,
  `language=sw` as a bias (not a hard filter — the model handles code-switching).
  Default when `OPENAI_API_KEY` is set.
- `GoogleSTTProvider` — Google Cloud Speech-to-Text, `sw-TZ`. Picked when
  `VOICE_STT_PROVIDER=google` AND `GOOGLE_APPLICATION_CREDENTIALS` is set.
- `NullSTTProvider` — returns `{ text: '', language: null }`. Default when
  nothing is configured; produces a graceful "haikueleweka" turn.

Env (added to `.env.example`):

```
VOICE_STT_PROVIDER=openai           # openai | google | ''
VOICE_STT_LANG_HINT=sw
VOICE_STT_MAX_SECONDS=30
```

OPENAI credentials reuse the existing `LLM_API_KEY` when
`LLM_PROVIDER=openai`; otherwise a dedicated `VOICE_OPENAI_API_KEY` is read.

### 9.2 TTS (`ttsProvider.js`)

```
interface TTSProvider {
  name: string;
  isLive: boolean;
  synthesize({ text, lang, voice }): Promise<{
    audio: Buffer;
    mimeType: 'audio/mpeg';
  }>;
}
```

Implementations:

- `GoogleTTSProvider` — `sw-KE-Standard-A` (female), `sw-KE-Standard-B` (male);
  English falls back to `en-US-Neural2-C`. Default when
  `GOOGLE_TTS_API_KEY` set.
- `ElevenLabsTTSProvider` — multilingual v2 voice; backup when
  `ELEVENLABS_API_KEY` set. Note: Swahili pronunciation is passable but less
  stable than Google's.
- `AtSayTTSProvider` — degenerate case: no audio file, the caller gets AT's
  built-in `<Say>` TTS which is English-leaning and acknowledged as degraded.
  Used only if the other two providers are both down.

**Cache.** `sha256(text + '|' + lang + '|' + voice)` → write mp3 once to
`backend/uploads/voice/<hash>.mp3`. Cache hit → serve the file; cache miss →
synthesize-then-serve. Hourly cron sweeps files older than
`VOICE_AUDIO_RETENTION_DAYS` (default 7).

Env:

```
VOICE_TTS_PROVIDER=google                      # google | elevenlabs | at_say
GOOGLE_TTS_API_KEY=
ELEVENLABS_API_KEY=
VOICE_TTS_VOICE_SW=sw-KE-Standard-A
VOICE_TTS_VOICE_EN=en-US-Neural2-C
VOICE_AUDIO_RETENTION_DAYS=7
```

---

## 10. Privacy, safety, abuse

- Consent spoken on turn 1 of every call (greeting carries it); "sikubali" /
  "nakataa" during turn 1 clears `transcript` and `callerNumber` from the row
  (keep only `id`, `endedReason=CONSENT_DECLINED`, timestamps) and plays a
  short goodbye.
- Caller-ID is identification, not authorization. Private data (observations,
  prices, forecasts, farm notes) is gated by the voice PIN per §5.
- `callerNumber` is masked in all logs via `maskPhone` (reuses existing util).
- Audio files are served from HMAC-signed URLs with a 10-minute expiry.
- Recording URLs from AT, PINs and raw transcripts are never logged. Only
  session id, masked caller number, turn count and endedReason enter
  structured logs.
- Credentials (`VOICE_OPENAI_API_KEY`, `GOOGLE_TTS_API_KEY`, …) are read only
  from `process.env` through `config/env.js`, never from the DB or UI, same
  rule as AT credentials today.
- Observation drafts are NEVER written from a voice turn without an explicit
  "ndio, hifadhi" confirmation turn. Rate-limited to 1 confirmation / call.
- Rate limit: `integrationLimiter` (existing) on all three voice endpoints;
  additionally per-caller session cap: 5 calls / caller / hour.
- Supabase-style accidental enumeration of audio IDs is prevented by (a) HMAC
  signature and (b) 10-minute expiry.

---

## 11. Error handling (every known failure path)

| Failure | What the farmer hears | What the system does |
|---|---|---|
| STT returns empty | "Samahani sijakusikia, tafadhali sema tena." | No turn counted; same `<Record>` served. |
| STT provider down | Same as above. | Alert admin via existing notification channel. |
| LLM provider down | Falls back to raw top-card `answer_sw/en`. | Logged; no fabrication. |
| TTS provider down | Secondary TTS provider; if that is also down, AT `<Say>`. | Logged. |
| No KB card scored above T | "Samahani, sijui jibu la swali hilo. Uliza swali lingine au piga simu kwa afisa ugani." | Logged with transcript for curation. |
| Audio download > 15 s | "Samahani, nimechelewa, uliza tena." | Idempotent retry possible. |
| PIN wrong x3 | "PIN si sahihi. Nitakuambia taarifa za jumla tu." | `pinLocked=true`, continues with KB-only. |
| Caller hangs up mid-turn | — | `events` callback closes the session. |
| AT sends duplicate callback | Same XML served. | Replayed from `lastResponseXml`. |
| Secret mismatch | HTTP 403, no body leak. | Logged with IP, not with the given secret. |
| Session row disappears mid-call | "Samahani, piga simu tena." + `<Hangup/>`. | Logged. |

---

## 12. Testing strategy

### 12.1 Local / offline tests (`npm test`, no live credentials)

- `tests/providers/atVoiceXml.test.js` — XML escaping (`<Say>Mwani &amp; Co.</Say>`
  must not render as `Mwani & Co.`), nested `<Record><Say>…</Say></Record>`,
  `<Play url="…"/>`, special-char filenames.
- `tests/services/seaweedKbService.test.js` — retrieval against a fixture pack
  (uses 10 cards); exact-match question, aliases match, Swahili vs English,
  score threshold, "I don't know" path.
- `tests/services/voiceAssistantService.test.js` — fake STT / LLM / TTS
  providers. Scenarios:
  - greeting → first turn → KB answer → second turn → goodbye detected
  - consent decline on turn 1 clears transcript
  - PIN gate: locked session serves KB answer only for farm-specific question
  - idempotent replay: same `recordingUrl` twice → same XML, no second LLM
    call (asserted via spy counter)
  - two concurrent sessions do not share transcript or farm context
  - max turns = 10 enforced with polite close
- `tests/controllers/voiceController.test.js` — supertest.
  - missing `?secret=` → 403
  - wrong secret (same length) → 403, no timing side-channel visible to the
    test clock
  - correct secret, well-formed form body → 200 XML containing `<Record>`
  - HMAC-signed audio URL: valid → 200 mp3 bytes; expired → 410; bad `sig` →
    403
  - events callback with `isActive=0` closes the session
- `tests/services/voiceAssistantService.safety.test.js` — the LLM-paraphrase
  prompt is fed adversarial transcripts ("nipe bei ya leo ya mwani" / "give
  me today's seaweed price") and the stub LLM is checked to never emit a
  price number; a numeric regex over the reply must fail.

### 12.2 Live-call checklist (`docs/VOICE.md`)

A manual checklist run against `+255699920003` once the credentials and
provider keys are in place. Each item names what to say, what to listen for,
what to inspect in logs / DB:

1. Dial → greeting plays in Kiswahili within 1 s.
2. Say "Mwani wangu umekuwa mweupe nifanye nini?" → short Kiswahili answer
   about ice-ice.
3. Follow-up "Nifanye nini zaidi?" → coherent follow-up referencing turn 1.
4. Say "Switch to English" → next turn answered in English.
5. Stay silent after beep → "Samahani sijakusikia" plays.
6. Background noise test — the beach recording fixture in `tests/fixtures/`
   proves STT returns `''` cleanly.
7. Interrupt mid-answer by speaking — expected failure (document that
   interruption is not supported; farmer must wait for the beep).
8. Say "asante nimemaliza" → polite goodbye + hangup.
9. Reconnect → previous turns are not shown (new session row).
10. Admin: `voice_sessions` row exists; `event_logs` has the status callback;
    masked caller number everywhere.

The checklist is explicit about what was tested locally vs what required a
live call (see §13).

### 12.3 What is NOT tested in this iteration

- End-to-end call with real AT voice (requires a live number and credentials
  that live outside the repo).
- Load testing with concurrent live calls.
- Audio quality under poor cellular reception — ad-hoc, farmer-reported.

---

## 13. Deployment and setup documentation

New document `docs/VOICE.md` (parallel to `docs/AFRICASTALKING.md`), structured
as:

1. **How it works** (ASCII flow diagram, same style as `AFRICASTALKING.md`).
2. **Environment variables** (full table, with sandbox/live/off examples).
3. **Live number setup** (reproducing AT's current steps because the sandbox
   is down):
   - Create AT account; apply for a voice number via *Voice → Phone number
     settings → Request Number → Category: Test Number*. Contact
     `voice@africastalking.com` to accelerate.
   - Pay the one-off fee for the number (per AT's current pricing).
   - Set the Voice Callback URL to
     `https://<PUBLIC_API_URL>/api/integrations/africastalking/voice?secret=<AT_CALLBACK_SECRET>`
     and the Event URL to `/voice/events`.
4. **ngrok during development.**
   - `ngrok http 5000`
   - Copy the HTTPS URL into `PUBLIC_API_URL` in `.env` and into AT's dashboard.
   - Restart the API (`npm run dev` in `backend`).
5. **Provider accounts.**
   - OpenAI (for Whisper + LLM paraphrase).
   - Google Cloud TTS (service account JSON on disk; path in
     `GOOGLE_APPLICATION_CREDENTIALS`) or key in `GOOGLE_TTS_API_KEY`.
   - ElevenLabs (optional backup).
6. **External costs** (ballpark, called out as *approximate, verify before
   enabling production*):
   - AT inbound voice minute: ~KES 1 / min (verify current rate).
   - Whisper: $0.006 / audio minute.
   - Google TTS: free below 4 M chars / month; $4 / 1 M chars after.
   - LLM paraphrase: Claude Haiku or GPT-4o-mini at ~$0.0005 / turn.
7. **Live-call checklist** (§12.2 copied here).
8. **What is tested locally vs what requires credentials and a live call**.
9. **Known limitations.** The pauses, the lack of barge-in, the 30 s
   recording cap, the AT voice sandbox being down.
10. **Future upgrade path: VAPI / vapi.ai over SIP.** A short appendix noting
    that AT's "Voice VAPI Integration Guide" supports pointing an AT number at
    a vapi.ai voice-agent endpoint over SIP for natural barge-in conversation;
    the backend-tool interface defined by `voiceAssistantService` is already
    the right shape to serve as the HTTP tool layer that vapi.ai would call.

---

## 14. Explicit non-goals

- Vector embeddings / RAG infra.
- Natural barge-in / streaming STT (not available on AT XML).
- An admin web screen dedicated to voice (reuses existing admin event-log
  views in this iteration).
- Writing to farm records without spoken confirmation.
- Multi-tenant voice routing (one AT number for the whole system).
- Fraud / caller-impersonation detection beyond the PIN gate.
- Phone-call initiation from the system to the farmer (outbound) — this
  iteration is inbound only.

---

## 15. Open questions for implementation planning

These are to be resolved while writing the plan, not here:

- Exact BM25 implementation (`natural` package vs hand-rolled). Decide in the
  plan after measuring footprint of `natural`.
- Google TTS auth mode (API key vs service-account JSON). Both work; the
  Google docs currently recommend service accounts.
- Which NPM package wraps Google Cloud TTS cleanly in ES-module projects
  (`@google-cloud/text-to-speech` is official and ESM-safe since v6).
- Admin review UI for voice transcripts — out of scope for this spec; the
  rows accrete in Prisma and can be inspected via `prisma studio` for now.
- Observation-draft confirmation UX via voice is left for a follow-up spec;
  this iteration keeps voice read-only against private farm data.

---

## 16. Reviewer checklist (for the human partner before approval)

- [ ] Is the architecture choice (record-transcribe) acceptable given the
      pauses and no barge-in?
- [ ] Is the PIN gate the right privacy boundary, or should caller-ID alone
      authorize farm data?
- [ ] Is the knowledge-pack scope (nine topic cards) the right initial size?
- [ ] Are the chosen STT/TTS providers acceptable (Whisper + Google sw-KE)?
- [ ] Is `backend/uploads/voice/` an acceptable TTS cache location, or should
      it move to a different directory / object store?
- [ ] Should the live-call checklist be in `docs/VOICE.md` or in a dedicated
      `docs/VOICE-TEST-PLAN.md`?

Reply with any changes you want, otherwise approval moves this to the
implementation plan (`writing-plans` skill).
