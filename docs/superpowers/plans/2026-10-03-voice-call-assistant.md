# Voice-Call Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inbound Africa's Talking voice-call AI assistant to MwaniMlinzi-AI so a farmer can call `+255699920003`, speak a Kiswahili or English question about seaweed farming, hear a short grounded reply, and continue the conversation across turns — without breaking SMS, USSD, or web.

**Architecture:** Record → STT → LLM → TTS → Play loop built on Africa's Talking Voice XML callbacks. New Prisma model `VoiceSession` mirrors the existing `UssdSession` pattern (idempotency, callback secret, session row per call). STT and TTS are provider-pluggable (default: Whisper for STT, Google Cloud TTS `sw-KE` for TTS). Grounding comes from a committed, bilingual, source-cited seaweed knowledge pack retrieved by BM25; a reused LLM paraphrases retrieved cards into one-to-two-sentence phone answers. The existing `AssistantService` is invoked only for PIN-authenticated private farm questions.

**Tech Stack:** Node.js 18.18+, Express 5, Prisma ORM, PostgreSQL, Jest + Supertest, bcryptjs (voice PIN), OpenAI Whisper, Google Cloud TTS (@google-cloud/text-to-speech), existing `OpenAILLMProvider`/`AnthropicLLMProvider`.

**Spec:** `docs/superpowers/specs/2026-10-03-voice-call-assistant-design.md` (commit `7edb0cc`). The plan argues from the spec; executors read both.

## Global Constraints

- Node ≥18.18, ES modules (`"type": "module"` in `backend/package.json`).
- Prisma for all DB access; no raw SQL from services.
- All AT voice callback endpoints auth with `?secret=<AT_CALLBACK_SECRET>` using constant-time comparison via the existing `secretOk` helper pattern in `backend/src/controllers/integrationController.js`.
- All logged phone numbers pass through `maskPhone` from `backend/src/utils/phone.js`. Recording URLs, raw transcripts, and PINs are never logged.
- Every farmer-facing string ships bilingual (`sw` and `en`). No English-only text in a `<Say>` or TTS synth path.
- No fabricated prices, forecasts, farm records, diagnoses, or treatment instructions. The LLM paraphrase prompt must forbid them; the safety test (Task 8) proves it with adversarial transcripts.
- No write to farm records (`FarmObservation`, `HarvestRecord`, …) from a voice turn without a dedicated spoken "ndio, hifadhi" confirmation turn. This iteration does **not** ship observation writes; it is read-only against private farm data.
- Response bodies for AT voice callbacks are XML with `Content-Type: application/xml; charset=utf-8`.
- Audio cache lives under `backend/uploads/voice/`; served via HMAC-signed URLs with a 10-minute expiry using `AT_CALLBACK_SECRET` as the HMAC key.
- Hard turn caps: 30 s per `<Record>`, 10 turns per call, 10 min total call duration, 15 s hard deadline on the STT+LLM+TTS pipeline per turn.
- No new frontend screens or React changes in this iteration.
- No destructive edits to existing files other than the surgical additions this plan calls out (routes mount, env config block, Prisma schema append). Do not rename or restructure existing files.
- Credentials are read from `process.env` through `backend/src/config/env.js` only; never from the DB, UI, or request body.

## Review Focus

Five input classes the spec implies but no task's happy-path tests exercise, most likely first. Each is pinned to a test added to the owning task's step list:

1. **AT retries a callback with identical `recordingUrl`** → must replay cached XML, must NOT re-run STT/LLM/TTS, must NOT re-charge providers. (Pinned by Task 7, step "write the idempotency test".)
2. **Two concurrent voice sessions** → transcripts, language, PIN state, and farm context never cross-talk. (Pinned by Task 7, step "write the concurrent-session isolation test".)
3. **Caller says a goodbye phrase inside a longer utterance** ("sawa asante nimemaliza niende") → still ends the call politely, no further `<Record>`. (Pinned by Task 8, step "write the embedded-goodbye test".)
4. **STT returns an empty string** (silence, background noise, unintelligible audio) → re-prompt without consuming a turn count and without invoking the LLM. (Pinned by Task 8, step "write the empty-STT re-prompt test".)
5. **Expired or forged HMAC signature on the audio URL** → 410 for expired, 403 for bad `sig`; no bytes served, no stack trace or filename leaked in the response body. (Pinned by Task 9, step "write the audio-URL signature tests".)

---

## File Structure

**Create:**
- `backend/src/providers/voice/atVoiceXml.js` — XML builder with entity escaping
- `backend/src/providers/voice/sttProvider.js` — STT provider interface + Whisper + Null
- `backend/src/providers/voice/ttsProvider.js` — TTS provider interface + Google + ElevenLabs + AT-Say fallback
- `backend/src/data/seaweedKb/_system.json` — system prompt + fallback text
- `backend/src/data/seaweedKb/planting.json`
- `backend/src/data/seaweedKb/seed-selection.json`
- `backend/src/data/seaweedKb/farm-maintenance.json`
- `backend/src/data/seaweedKb/whitening-ice-ice.json`
- `backend/src/data/seaweedKb/poor-growth.json`
- `backend/src/data/seaweedKb/harvesting.json`
- `backend/src/data/seaweedKb/drying.json`
- `backend/src/data/seaweedKb/storage.json`
- `backend/src/data/seaweedKb/pests-epiphytes.json`
- `backend/src/services/seaweedKbService.js` — load + BM25 search + LLM rerank
- `backend/src/services/voiceSessionService.js` — session CRUD + idempotency + PIN state
- `backend/src/services/voiceAssistantService.js` — turn orchestration
- `backend/src/controllers/voiceController.js` — entry/turn/events/audio handlers
- `backend/src/routes/voice.routes.js` — public audio-serving route
- `backend/src/jobs/voiceAudioCleanup.js` — mp3 retention sweep
- `backend/tests/unit/atVoiceXml.test.js`
- `backend/tests/unit/seaweedKb.test.js`
- `backend/tests/unit/voiceSession.test.js`
- `backend/tests/unit/voiceAssistant.test.js`
- `backend/tests/unit/voiceAssistantSafety.test.js`
- `backend/tests/integration/voice.test.js`
- `backend/tests/fixtures/voice/utterances.json`
- `backend/tests/fixtures/voice/silence.mp3` (zero-byte placeholder created by test setup, not committed as audio)
- `docs/VOICE.md`
- `backend/uploads/voice/.gitkeep`

**Modify:**
- `backend/.env.example` — append voice section
- `backend/src/config/env.js` — add `voice`, `stt`, `tts` config blocks
- `backend/prisma/schema.prisma` — add `VoiceSession` model, add `voicePinHash` + `voicePinSetAt` columns to `Farmer`
- `backend/src/routes/integrations.routes.js` — mount three voice callback routes
- `backend/src/app.js` — mount `voice.routes.js`
- `backend/src/providers/africastalking/config.js` — extend `atPublicStatus` to include voice callback URLs
- `backend/.gitignore` — ignore `backend/uploads/voice/*.mp3`
- `backend/src/jobs/index.js` (or equivalent cron bootstrapper) — register the audio cleanup job
- `backend/package.json` — add `@google-cloud/text-to-speech`, `form-data` (if needed for Whisper multipart)

---

## Task 1: Config, env, Prisma schema

**Files:**
- Modify: `backend/.env.example`
- Modify: `backend/src/config/env.js`
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/.gitignore`
- Create: `backend/uploads/voice/.gitkeep`
- Test: `backend/tests/unit/voiceConfig.test.js` (new)

**Interfaces:**
- Produces: `env.voice = { stt: {...}, tts: {...}, audio: {...} }` on the shared `env` export.
- Produces: Prisma model `VoiceSession` and the `voicePinHash`/`voicePinSetAt` columns on `Farmer`.

- [ ] **Step 1: Write the failing config test**

Create `backend/tests/unit/voiceConfig.test.js`:
```js
import { jest } from '@jest/globals';

describe('env.voice', () => {
  const ORIG = { ...process.env };
  afterEach(() => { process.env = { ...ORIG }; jest.resetModules(); });

  it('defaults stt to openai, tts to google, audio retention 7d, lang hint sw', async () => {
    process.env.JWT_SECRET = 'x'.repeat(48);
    jest.resetModules();
    const { env } = await import('../../src/config/env.js');
    expect(env.voice.stt.provider).toBe('openai');
    expect(env.voice.stt.langHint).toBe('sw');
    expect(env.voice.stt.maxSeconds).toBe(30);
    expect(env.voice.tts.provider).toBe('google');
    expect(env.voice.tts.voiceSw).toBe('sw-KE-Standard-A');
    expect(env.voice.tts.voiceEn).toBe('en-US-Neural2-C');
    expect(env.voice.audio.retentionDays).toBe(7);
  });

  it('respects explicit overrides', async () => {
    process.env.JWT_SECRET = 'x'.repeat(48);
    process.env.VOICE_STT_PROVIDER = 'google';
    process.env.VOICE_TTS_PROVIDER = 'elevenlabs';
    process.env.VOICE_AUDIO_RETENTION_DAYS = '14';
    jest.resetModules();
    const { env } = await import('../../src/config/env.js');
    expect(env.voice.stt.provider).toBe('google');
    expect(env.voice.tts.provider).toBe('elevenlabs');
    expect(env.voice.audio.retentionDays).toBe(14);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

```bash
cd backend && npx jest tests/unit/voiceConfig.test.js
```
Expected: FAIL ("Cannot read properties of undefined (reading 'stt')" or similar).

- [ ] **Step 3: Add the voice env block**

Append to `backend/src/config/env.js` inside the `export const env = { ... }` object, immediately after the `africastalking: { ... }` block:
```js
  // Voice-call AI assistant. See docs/VOICE.md.
  voice: {
    stt: {
      provider: (process.env.VOICE_STT_PROVIDER || 'openai').toLowerCase(),
      langHint: (process.env.VOICE_STT_LANG_HINT || 'sw').toLowerCase(),
      maxSeconds: Number(process.env.VOICE_STT_MAX_SECONDS || 30),
      openaiApiKey: cleanSecret(process.env.VOICE_OPENAI_API_KEY) || cleanSecret(process.env.LLM_API_KEY),
      googleApiKey: cleanSecret(process.env.GOOGLE_STT_API_KEY),
    },
    tts: {
      provider: (process.env.VOICE_TTS_PROVIDER || 'google').toLowerCase(),
      voiceSw: process.env.VOICE_TTS_VOICE_SW || 'sw-KE-Standard-A',
      voiceEn: process.env.VOICE_TTS_VOICE_EN || 'en-US-Neural2-C',
      googleApiKey: cleanSecret(process.env.GOOGLE_TTS_API_KEY),
      googleCredentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
      elevenLabsApiKey: cleanSecret(process.env.ELEVENLABS_API_KEY),
      elevenLabsVoiceId: cleanSecret(process.env.ELEVENLABS_VOICE_ID),
    },
    audio: {
      dir: process.env.VOICE_AUDIO_DIR || 'uploads/voice',
      retentionDays: Number(process.env.VOICE_AUDIO_RETENTION_DAYS || 7),
      urlExpiryMinutes: Number(process.env.VOICE_AUDIO_URL_EXPIRY_MINUTES || 10),
    },
    maxTurnsPerCall: Number(process.env.VOICE_MAX_TURNS || 10),
    maxCallDurationSeconds: Number(process.env.VOICE_MAX_CALL_SECONDS || 600),
    pipelineBudgetMs: Number(process.env.VOICE_PIPELINE_BUDGET_MS || 15000),
  },
```

- [ ] **Step 4: Append env.example section**

Append to `backend/.env.example`:
```
# ─── Voice-call AI assistant (inbound AT voice) ───
# STT: openai (Whisper) | google (Cloud Speech sw-TZ). Empty behaves like 'openai'.
VOICE_STT_PROVIDER=openai
VOICE_STT_LANG_HINT=sw
VOICE_STT_MAX_SECONDS=30
# Reused: LLM_API_KEY if LLM_PROVIDER=openai. Otherwise set a dedicated key:
VOICE_OPENAI_API_KEY=
GOOGLE_STT_API_KEY=

# TTS: google | elevenlabs | at_say (degraded <Say> fallback only). Empty = google.
VOICE_TTS_PROVIDER=google
VOICE_TTS_VOICE_SW=sw-KE-Standard-A
VOICE_TTS_VOICE_EN=en-US-Neural2-C
GOOGLE_TTS_API_KEY=
# Alternative: path to a service-account JSON for Google Cloud TTS:
GOOGLE_APPLICATION_CREDENTIALS=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

# Audio cache + HMAC-signed audio URLs (never leak the signing key)
VOICE_AUDIO_DIR=uploads/voice
VOICE_AUDIO_RETENTION_DAYS=7
VOICE_AUDIO_URL_EXPIRY_MINUTES=10

# Call budgets
VOICE_MAX_TURNS=10
VOICE_MAX_CALL_SECONDS=600
VOICE_PIPELINE_BUDGET_MS=15000
```

- [ ] **Step 5: Append Prisma schema**

Append to `backend/prisma/schema.prisma`:
```prisma
model VoiceSession {
  id                String   @id
  callerNumber      String?
  language          Language @default(SW)
  farmerId          String?
  farmerFarmId      String?
  consentGiven      Boolean  @default(true)
  pinAttempts       Int      @default(0)
  pinLocked         Boolean  @default(false)
  turnCount         Int      @default(0)
  endedReason       String?
  lastRecordingUrl  String?
  lastResponseXml   String?
  transcript        Json     @default("[]")
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  endedAt           DateTime?

  @@index([callerNumber])
  @@index([createdAt])
  @@map("voice_sessions")
}
```

Then locate the existing `model Farmer { ... }` block and add two columns inside it (right before the closing `}`):
```prisma
  voicePinHash  String?
  voicePinSetAt DateTime?
```

- [ ] **Step 6: Generate the migration**

```bash
cd backend && npx prisma migrate dev --name add_voice_session
```
Expected: a new SQL migration file is written and applied; `npx prisma generate` runs automatically.

- [ ] **Step 7: Add .gitignore + .gitkeep**

Create `backend/uploads/voice/.gitkeep` (empty).
Append to `backend/.gitignore`:
```
backend/uploads/voice/*.mp3
```

- [ ] **Step 8: Run the config test, verify it passes**

```bash
cd backend && npx jest tests/unit/voiceConfig.test.js
```
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/.env.example backend/src/config/env.js backend/prisma/schema.prisma \
        backend/prisma/migrations backend/.gitignore backend/uploads/voice/.gitkeep \
        backend/tests/unit/voiceConfig.test.js
git commit -m "feat(voice): add voice env config + VoiceSession prisma model"
```

---

## Task 2: AT Voice XML builder

**Files:**
- Create: `backend/src/providers/voice/atVoiceXml.js`
- Test: `backend/tests/unit/atVoiceXml.test.js`

**Interfaces:**
- Produces: `responseXml(children: string): string`, `sayXml(text, opts?): string`, `playXml(url: string): string`, `recordXml({ callbackUrl, maxLength?, timeout?, finishOnKey?, trimSilence?, playBeep?, inner? }): string`, `getDigitsXml({ callbackUrl, numDigits?, timeout?, finishOnKey?, inner? }): string`, `hangupXml(): string`. Every string input is XML-entity-escaped.
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/unit/atVoiceXml.test.js`:
```js
import { responseXml, sayXml, playXml, recordXml, hangupXml, getDigitsXml } from '../../src/providers/voice/atVoiceXml.js';

describe('atVoiceXml', () => {
  it('wraps children in a Response envelope with XML prolog', () => {
    const xml = responseXml('<Hangup/>');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<Response><Hangup/></Response>');
  });

  it('escapes XML entities in Say text', () => {
    const xml = sayXml('Mwani & Co. <karibu> "sana"');
    expect(xml).toBe('<Say voice="woman" playBeep="false">Mwani &amp; Co. &lt;karibu&gt; &quot;sana&quot;</Say>');
  });

  it('escapes URL attributes in Play and Record', () => {
    expect(playXml('https://a.test/x?sig=1&exp=2')).toBe('<Play url="https://a.test/x?sig=1&amp;exp=2"/>');
    const rec = recordXml({ callbackUrl: 'https://a.test/t?secret=s&a=b', inner: '<Say>beep</Say>' });
    expect(rec).toContain('callbackUrl="https://a.test/t?secret=s&amp;a=b"');
    expect(rec).toContain('<Record');
    expect(rec).toContain('<Say>beep</Say></Record>');
    expect(rec).toContain('maxLength="30"');
    expect(rec).toContain('finishOnKey="*"');
    expect(rec).toContain('trimSilence="true"');
  });

  it('builds GetDigits with defaults and inner prompt', () => {
    const x = getDigitsXml({ callbackUrl: 'https://a.test/pin', inner: sayXml('Weka PIN') });
    expect(x).toContain('<GetDigits');
    expect(x).toContain('numDigits="4"');
    expect(x).toContain('finishOnKey="#"');
    expect(x).toContain('<Say voice="woman" playBeep="false">Weka PIN</Say></GetDigits>');
  });

  it('emits a bare Hangup element', () => {
    expect(hangupXml()).toBe('<Hangup/>');
  });
});
```

- [ ] **Step 2: Run and verify it fails**

```bash
cd backend && npx jest tests/unit/atVoiceXml.test.js
```
Expected: FAIL ("Cannot find module …/atVoiceXml.js").

- [ ] **Step 3: Implement the builder**

Create `backend/src/providers/voice/atVoiceXml.js`:
```js
const escape = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export function responseXml(children) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${children}</Response>`;
}

export function sayXml(text, { voice = 'woman', playBeep = false } = {}) {
  return `<Say voice="${escape(voice)}" playBeep="${Boolean(playBeep)}">${escape(text)}</Say>`;
}

export function playXml(url) {
  return `<Play url="${escape(url)}"/>`;
}

export function recordXml({
  callbackUrl,
  maxLength = 30,
  timeout = 4,
  finishOnKey = '*',
  trimSilence = true,
  playBeep = true,
  inner = '',
} = {}) {
  return (
    `<Record maxLength="${Number(maxLength)}" timeout="${Number(timeout)}"`
    + ` finishOnKey="${escape(finishOnKey)}" trimSilence="${Boolean(trimSilence)}"`
    + ` playBeep="${Boolean(playBeep)}" callbackUrl="${escape(callbackUrl)}">${inner}</Record>`
  );
}

export function getDigitsXml({
  callbackUrl,
  numDigits = 4,
  timeout = 10,
  finishOnKey = '#',
  inner = '',
} = {}) {
  return (
    `<GetDigits numDigits="${Number(numDigits)}" timeout="${Number(timeout)}"`
    + ` finishOnKey="${escape(finishOnKey)}" callbackUrl="${escape(callbackUrl)}">${inner}</GetDigits>`
  );
}

export function hangupXml() { return '<Hangup/>'; }
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd backend && npx jest tests/unit/atVoiceXml.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/providers/voice/atVoiceXml.js backend/tests/unit/atVoiceXml.test.js
git commit -m "feat(voice): add AT voice XML builder with entity escaping"
```

---

## Task 3: STT provider

**Files:**
- Create: `backend/src/providers/voice/sttProvider.js`
- Test: `backend/tests/unit/voiceStt.test.js`

**Interfaces:**
- Produces:
  ```
  class OpenAIWhisperSTTProvider { name = 'openai-whisper'; isLive = true;
    constructor(apiKey, { fetchImpl?, model? })
    async transcribe({ audioBuffer: Buffer, mimeType: string, hintLang?: 'sw'|'en', maxDurationS?: number })
      → { text: string, language: 'sw'|'en'|null, confidence: number|null, rawProvider: object } }
  class NullSTTProvider { name = 'null'; isLive = false; async transcribe() → { text:'', language:null, confidence:null, rawProvider:{} } }
  function createSTTProvider(cfg = env) → one of the above based on cfg.voice.stt
  ```
- Consumes: `env.voice.stt`, global `fetch`, `FormData` from `node:undici` or the built-in Node 18+ `FormData`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/unit/voiceStt.test.js`:
```js
import { jest } from '@jest/globals';
import { OpenAIWhisperSTTProvider, NullSTTProvider, createSTTProvider } from '../../src/providers/voice/sttProvider.js';

describe('STT providers', () => {
  it('NullSTTProvider returns empty transcript', async () => {
    const r = await new NullSTTProvider().transcribe({ audioBuffer: Buffer.alloc(0), mimeType: 'audio/mpeg' });
    expect(r.text).toBe('');
    expect(r.language).toBeNull();
  });

  it('Whisper posts multipart with language hint and parses text + language', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ text: 'Mwani wangu umekuwa mweupe', language: 'swahili' }),
    });
    const p = new OpenAIWhisperSTTProvider('sk-test', { fetchImpl: fakeFetch });
    const r = await p.transcribe({ audioBuffer: Buffer.from('MP3'), mimeType: 'audio/mpeg', hintLang: 'sw' });
    expect(r.text).toBe('Mwani wangu umekuwa mweupe');
    expect(r.language).toBe('sw');
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = fakeFetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(opts.method).toBe('POST');
    expect(opts.headers.authorization).toBe('Bearer sk-test');
  });

  it('Whisper returns empty text on HTTP error, never throws', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });
    const p = new OpenAIWhisperSTTProvider('sk-test', { fetchImpl: fakeFetch });
    const r = await p.transcribe({ audioBuffer: Buffer.from('x'), mimeType: 'audio/mpeg' });
    expect(r.text).toBe('');
    expect(r.language).toBeNull();
  });

  it('createSTTProvider returns Null when no api key', () => {
    const p = createSTTProvider({ voice: { stt: { provider: 'openai', langHint: 'sw', maxSeconds: 30, openaiApiKey: '', googleApiKey: '' } } });
    expect(p.name).toBe('null');
  });
});
```

- [ ] **Step 2: Run and verify failing**

```bash
cd backend && npx jest tests/unit/voiceStt.test.js
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the provider**

Create `backend/src/providers/voice/sttProvider.js`:
```js
import { env } from '../../config/env.js';

const normLang = (raw) => {
  const s = String(raw || '').toLowerCase();
  if (s.startsWith('sw')) return 'sw';
  if (s.startsWith('en')) return 'en';
  return null;
};

export class NullSTTProvider {
  name = 'null';
  isLive = false;
  async transcribe() { return { text: '', language: null, confidence: null, rawProvider: {} }; }
}

export class OpenAIWhisperSTTProvider {
  name = 'openai-whisper';
  isLive = true;
  constructor(apiKey, { fetchImpl = globalThis.fetch, model = 'whisper-1' } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = fetchImpl;
  }
  async transcribe({ audioBuffer, mimeType = 'audio/mpeg', hintLang }) {
    try {
      const form = new FormData();
      form.append('file', new Blob([audioBuffer], { type: mimeType }), 'audio.mp3');
      form.append('model', this.model);
      form.append('response_format', 'json');
      if (hintLang) form.append('language', hintLang);
      const res = await this.fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}` },
        body: form,
      });
      if (!res.ok) return { text: '', language: null, confidence: null, rawProvider: { status: res.status } };
      const text = await res.text();
      const data = JSON.parse(text);
      return {
        text: (data.text || '').trim(),
        language: normLang(data.language),
        confidence: null,
        rawProvider: { model: this.model },
      };
    } catch (err) {
      return { text: '', language: null, confidence: null, rawProvider: { error: err.message } };
    }
  }
}

export function createSTTProvider(cfg = env) {
  const stt = cfg?.voice?.stt || {};
  if (stt.provider === 'openai' && stt.openaiApiKey) {
    return new OpenAIWhisperSTTProvider(stt.openaiApiKey);
  }
  return new NullSTTProvider();
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd backend && npx jest tests/unit/voiceStt.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/providers/voice/sttProvider.js backend/tests/unit/voiceStt.test.js
git commit -m "feat(voice): add STT provider (Whisper + Null, pluggable)"
```

---

## Task 4: TTS provider + mp3 cache

**Files:**
- Create: `backend/src/providers/voice/ttsProvider.js`
- Test: `backend/tests/unit/voiceTts.test.js`

**Interfaces:**
- Produces:
  ```
  class GoogleTTSProvider { name='google-tts'; isLive=true;
    constructor(apiKey, { fetchImpl? })
    async synthesize({ text, lang: 'sw'|'en', voice? })
      → { audio: Buffer, mimeType: 'audio/mpeg' } }
  class ElevenLabsTTSProvider { … } (optional; follows same shape)
  class AtSayTTSProvider { name='at-say'; isLive=false; async synthesize() → null (signals: use <Say>) }
  function createTTSProvider(cfg = env) → one of the above
  async function synthesizeToCache(provider, { text, lang, voice, audioDir }) → { hash, path, mimeType, cached: boolean }
    – sha256(text|lang|voice) is the file hash; returns existing file without re-synth
    – throws on provider failure after the fallback cascade
  ```
- Consumes: `env.voice.tts`, `env.voice.audio.dir`, `node:fs/promises`, `node:crypto`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/unit/voiceTts.test.js`:
```js
import { jest } from '@jest/globals';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { GoogleTTSProvider, AtSayTTSProvider, createTTSProvider, synthesizeToCache } from '../../src/providers/voice/ttsProvider.js';

const tmp = path.join(process.cwd(), 'tests', '.tmp-voice');

beforeAll(async () => { await fs.mkdir(tmp, { recursive: true }); });
afterAll(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

describe('TTS providers', () => {
  it('AtSayTTSProvider.synthesize returns null (callers fall back to <Say>)', async () => {
    expect(await new AtSayTTSProvider().synthesize({ text: 'habari', lang: 'sw' })).toBeNull();
  });

  it('GoogleTTSProvider calls the REST endpoint with sw-KE voice and decodes base64', async () => {
    const audioB64 = Buffer.from('MP3PAYLOAD').toString('base64');
    const fakeFetch = jest.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ audioContent: audioB64 }) });
    const p = new GoogleTTSProvider('AIza-test', { fetchImpl: fakeFetch });
    const r = await p.synthesize({ text: 'Karibu MwaniMlinzi', lang: 'sw', voice: 'sw-KE-Standard-A' });
    expect(r.mimeType).toBe('audio/mpeg');
    expect(r.audio.toString()).toBe('MP3PAYLOAD');
    const body = JSON.parse(fakeFetch.mock.calls[0][1].body);
    expect(body.voice.languageCode).toBe('sw-KE');
    expect(body.voice.name).toBe('sw-KE-Standard-A');
    expect(body.audioConfig.audioEncoding).toBe('MP3');
  });

  it('createTTSProvider falls back to AtSay when nothing configured', () => {
    const p = createTTSProvider({ voice: { tts: { provider: 'google', voiceSw: 'sw-KE-Standard-A', voiceEn: 'en-US-Neural2-C', googleApiKey: '', elevenLabsApiKey: '' } } });
    expect(p.name).toBe('at-say');
  });

  it('synthesizeToCache writes once and reports cache hit on second call', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ audioContent: Buffer.from('BYTES').toString('base64') }) });
    const p = new GoogleTTSProvider('k', { fetchImpl: fakeFetch });
    const a = await synthesizeToCache(p, { text: 'Habari', lang: 'sw', voice: 'sw-KE-Standard-A', audioDir: tmp });
    const b = await synthesizeToCache(p, { text: 'Habari', lang: 'sw', voice: 'sw-KE-Standard-A', audioDir: tmp });
    expect(a.hash).toBe(b.hash);
    expect(a.cached).toBe(false);
    expect(b.cached).toBe(true);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run and verify failing**

```bash
cd backend && npx jest tests/unit/voiceTts.test.js
```
Expected: FAIL (module missing).

- [ ] **Step 3: Implement the TTS layer**

Create `backend/src/providers/voice/ttsProvider.js`:
```js
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';

const LANG_CODE = { sw: 'sw-KE', en: 'en-US' };

export class AtSayTTSProvider {
  name = 'at-say';
  isLive = false;
  async synthesize() { return null; }
}

export class GoogleTTSProvider {
  name = 'google-tts';
  isLive = true;
  constructor(apiKey, { fetchImpl = globalThis.fetch } = {}) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }
  async synthesize({ text, lang, voice }) {
    const body = {
      input: { text },
      voice: { languageCode: LANG_CODE[lang] || 'sw-KE', name: voice },
      audioConfig: { audioEncoding: 'MP3' },
    };
    const res = await this.fetchImpl(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(this.apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`google tts http ${res.status}`);
    const raw = await res.text();
    const data = JSON.parse(raw);
    if (!data.audioContent) throw new Error('google tts: no audioContent');
    return { audio: Buffer.from(data.audioContent, 'base64'), mimeType: 'audio/mpeg' };
  }
}

export class ElevenLabsTTSProvider {
  name = 'elevenlabs';
  isLive = true;
  constructor(apiKey, voiceId, { fetchImpl = globalThis.fetch } = {}) {
    this.apiKey = apiKey;
    this.voiceId = voiceId;
    this.fetchImpl = fetchImpl;
  }
  async synthesize({ text }) {
    const res = await this.fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.voiceId)}`, {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
    });
    if (!res.ok) throw new Error(`elevenlabs http ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return { audio: buf, mimeType: 'audio/mpeg' };
  }
}

export function createTTSProvider(cfg = env) {
  const tts = cfg?.voice?.tts || {};
  if (tts.provider === 'google' && tts.googleApiKey) return new GoogleTTSProvider(tts.googleApiKey);
  if (tts.provider === 'elevenlabs' && tts.elevenLabsApiKey && tts.elevenLabsVoiceId) {
    return new ElevenLabsTTSProvider(tts.elevenLabsApiKey, tts.elevenLabsVoiceId);
  }
  return new AtSayTTSProvider();
}

export async function synthesizeToCache(provider, { text, lang, voice, audioDir }) {
  const hash = crypto.createHash('sha256').update(`${text}|${lang}|${voice}`).digest('hex');
  const file = path.join(audioDir, `${hash}.mp3`);
  try {
    const stat = await fs.stat(file);
    if (stat.size > 0) return { hash, path: file, mimeType: 'audio/mpeg', cached: true };
  } catch { /* not cached */ }
  const out = await provider.synthesize({ text, lang, voice });
  if (!out) throw new Error('tts provider returned null (use <Say> fallback at the caller)');
  await fs.mkdir(audioDir, { recursive: true });
  await fs.writeFile(file, out.audio);
  return { hash, path: file, mimeType: 'audio/mpeg', cached: false };
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd backend && npx jest tests/unit/voiceTts.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/providers/voice/ttsProvider.js backend/tests/unit/voiceTts.test.js
git commit -m "feat(voice): add TTS provider (Google / ElevenLabs / at-say) with mp3 cache"
```

---

## Task 5: Seaweed knowledge pack (data)

**Files:**
- Create: `backend/src/data/seaweedKb/_system.json`
- Create: `backend/src/data/seaweedKb/planting.json`
- Create: `backend/src/data/seaweedKb/seed-selection.json`
- Create: `backend/src/data/seaweedKb/farm-maintenance.json`
- Create: `backend/src/data/seaweedKb/whitening-ice-ice.json`
- Create: `backend/src/data/seaweedKb/poor-growth.json`
- Create: `backend/src/data/seaweedKb/harvesting.json`
- Create: `backend/src/data/seaweedKb/drying.json`
- Create: `backend/src/data/seaweedKb/storage.json`
- Create: `backend/src/data/seaweedKb/pests-epiphytes.json`
- Test: `backend/tests/unit/seaweedKbShape.test.js` (new)

**Interfaces:**
- Produces: a flat directory of JSON cards. Shape per card: `{ id, topic, aliases_sw[], aliases_en[], question_variants:[{lang,text}], answer_sw, answer_en, source }`. Shape of `_system.json`: `{ voice_prompt_sw, voice_prompt_en, fallback_sw, fallback_en }`.

- [ ] **Step 1: Write the failing shape test**

Create `backend/tests/unit/seaweedKbShape.test.js`:
```js
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'data', 'seaweedKb');

describe('seaweedKb data pack', () => {
  it('contains _system.json and the 9 topic cards', async () => {
    const files = (await fs.readdir(dir)).sort();
    expect(files).toEqual([
      '_system.json',
      'drying.json',
      'farm-maintenance.json',
      'harvesting.json',
      'pests-epiphytes.json',
      'planting.json',
      'poor-growth.json',
      'seed-selection.json',
      'storage.json',
      'whitening-ice-ice.json',
    ]);
  });

  it('each card has required bilingual fields and a non-empty source', async () => {
    const files = (await fs.readdir(dir)).filter((f) => !f.startsWith('_'));
    for (const f of files) {
      const c = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'));
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
      expect(typeof c.topic).toBe('string');
      expect(Array.isArray(c.aliases_sw) && c.aliases_sw.length).toBeTruthy();
      expect(Array.isArray(c.aliases_en) && c.aliases_en.length).toBeTruthy();
      expect(Array.isArray(c.question_variants) && c.question_variants.length).toBeTruthy();
      expect(typeof c.answer_sw).toBe('string'); expect(c.answer_sw.length).toBeGreaterThan(30);
      expect(typeof c.answer_en).toBe('string'); expect(c.answer_en.length).toBeGreaterThan(30);
      expect(typeof c.source).toBe('string'); expect(c.source.length).toBeGreaterThan(10);
    }
  });

  it('_system.json has voice_prompt_sw, voice_prompt_en, fallback_sw, fallback_en', async () => {
    const sys = JSON.parse(await fs.readFile(path.join(dir, '_system.json'), 'utf8'));
    for (const k of ['voice_prompt_sw', 'voice_prompt_en', 'fallback_sw', 'fallback_en']) {
      expect(typeof sys[k]).toBe('string');
      expect(sys[k].length).toBeGreaterThan(10);
    }
  });
});
```

- [ ] **Step 2: Run and verify failing**

```bash
cd backend && npx jest tests/unit/seaweedKbShape.test.js
```
Expected: FAIL (directory does not exist).

- [ ] **Step 3: Write `_system.json`**

Create `backend/src/data/seaweedKb/_system.json`:
```json
{
  "voice_prompt_sw": "Wewe ni msaidizi wa simu wa MwaniMlinzi unayezungumza na mkulima wa mwani Zanzibar. Jibu kwa Kiswahili sentensi moja au mbili fupi (maneno 25 au chini). Tumia tu ukweli ulio ndani ya CONTEXT. Usibuni bei, utabiri, kumbukumbu za shamba, utambuzi wa magonjwa, wala maagizo ya dawa. Kama CONTEXT haijibu swali, sema hasa: \"{FALLBACK}\".",
  "voice_prompt_en": "You are the MwaniMlinzi phone assistant speaking to a seaweed farmer in Zanzibar. Reply in English in one or two short sentences (20 words max). Use only the facts in CONTEXT. Never invent prices, forecasts, farm records, diagnoses, or treatment steps. If CONTEXT does not answer the question, say exactly: \"{FALLBACK}\".",
  "fallback_sw": "Samahani, sijui jibu la swali hilo kwa uhakika. Uliza swali lingine kuhusu mwani, au piga simu kwa afisa ugani.",
  "fallback_en": "Sorry, I don't know the answer to that for certain. Ask another seaweed question, or contact your extension officer."
}
```

- [ ] **Step 4: Write the 9 topic cards**

Create one JSON file per topic. Each card follows this exact shape; the implementer fills `answer_sw`, `answer_en` and `source` from the real reference materials listed in `docs/superpowers/specs/2026-10-03-voice-call-assistant-design.md` §6. **Rule:** no citation may be invented — if the implementer cannot locate a real source for a card, that card is deleted and the shape test is amended before merge.

Template (apply per topic, replacing `<<<…>>>` placeholders with real content pulled from the cited reference):
```json
{
  "id": "<<<topic-id>>>",
  "topic": "<<<topic>>>",
  "aliases_sw": ["<<<kiswahili alias 1>>>", "<<<alias 2>>>"],
  "aliases_en": ["<<<english alias 1>>>", "<<<alias 2>>>"],
  "question_variants": [
    { "lang": "sw", "text": "<<<a real question a farmer would ask>>>" },
    { "lang": "en", "text": "<<<same question in English>>>" }
  ],
  "answer_sw": "<<<one or two short Kiswahili sentences, no fabricated numbers>>>",
  "answer_en": "<<<same answer in English, no fabricated numbers>>>",
  "source": "<<<real citation: author, year, title, page/section>>>"
}
```

Mandatory per-topic content constraints (keeps the pack grounded; failing any of them is a bug):
- `planting.json`: covers seedling attachment (tie-tie method), line spacing in meters as a *range*, not a single number; references FAO or WIOMSA.
- `seed-selection.json`: healthy young branches, no bleaching, no cystocarp signs; references WIOMSA or Zanzibar Fisheries extension bulletin.
- `farm-maintenance.json`: inspection cadence (every 2–3 days), cleaning epiphytes, re-tying loose plants; WIOMSA reference.
- `whitening-ice-ice.json`: heat + low salinity cause, move to cooler/deeper water, remove damaged branches, report to extension officer; Msuya 2011/WIOMSA.
- `poor-growth.json`: salinity, temperature, grazing, epiphytes; cite WIOMSA.
- `harvesting.json`: minimum age window as a range, cutting method, avoid uprooting; FAO Zanzibar manual.
- `drying.json`: ground-free racks, duration as a range of days, moisture target as a range; FAO Zanzibar manual.
- `storage.json`: dry sacks, keep off ground, protect from pests and damp; FAO or Zanzibar Fisheries.
- `pests-epiphytes.json`: mechanical removal, no chemicals; WIOMSA.

If a cited reference does not have exact numeric values for a sub-topic (e.g., exact drying hours), the card answers in *ranges* or *qualitative* terms sourced from the reference — never with a fabricated point value.

- [ ] **Step 5: Run the shape test, verify it passes**

```bash
cd backend && npx jest tests/unit/seaweedKbShape.test.js
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/data/seaweedKb backend/tests/unit/seaweedKbShape.test.js
git commit -m "feat(voice): add bilingual, source-cited seaweed knowledge pack"
```

---

## Task 6: Seaweed KB retrieval service

**Files:**
- Create: `backend/src/services/seaweedKbService.js`
- Create: `backend/tests/fixtures/voice/utterances.json`
- Test: `backend/tests/unit/seaweedKb.test.js`

**Interfaces:**
- Consumes: card files from Task 5; `env` for optional LLM rerank; `createLLMProvider` from `backend/src/providers/llmProvider.js`.
- Produces:
  ```
  SeaweedKbService.load()                    → void (idempotent; builds inverted index lazily)
  SeaweedKbService.systemPrompt(lang)        → string
  SeaweedKbService.fallback(lang)            → string
  SeaweedKbService.search(text, lang, { k=3, threshold=0.15, llm=null }) →
    { cards: Card[], score: number, knownAnswer: boolean, pickedBy: 'bm25'|'bm25+rerank' }
  ```
  `knownAnswer` is `false` when `score < threshold`; callers deliver the fallback text.

- [ ] **Step 1: Write the failing retrieval tests**

Create `backend/tests/fixtures/voice/utterances.json`:
```json
[
  { "text": "Mwani wangu umekuwa mweupe nifanye nini", "lang": "sw", "expectId": "whitening-ice-ice" },
  { "text": "My seaweed is turning white what should I do", "lang": "en", "expectId": "whitening-ice-ice" },
  { "text": "Nianze lini kuvuna mwani", "lang": "sw", "expectId": "harvesting" },
  { "text": "How do I dry seaweed properly", "lang": "en", "expectId": "drying" },
  { "text": "Mbegu za mwani nizichague vipi", "lang": "sw", "expectId": "seed-selection" },
  { "text": "What's the exchange rate today", "lang": "en", "expectId": null }
]
```

Create `backend/tests/unit/seaweedKb.test.js`:
```js
import { SeaweedKbService } from '../../src/services/seaweedKbService.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const utterancesPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'voice', 'utterances.json'
);

describe('SeaweedKbService.search', () => {
  beforeAll(() => SeaweedKbService.load());

  it('exposes bilingual system prompt and fallback', () => {
    expect(SeaweedKbService.systemPrompt('sw')).toContain('{FALLBACK}');
    expect(SeaweedKbService.systemPrompt('en')).toContain('{FALLBACK}');
    expect(SeaweedKbService.fallback('sw').length).toBeGreaterThan(10);
    expect(SeaweedKbService.fallback('en').length).toBeGreaterThan(10);
  });

  it('matches labelled utterances to expected cards', async () => {
    const utterances = JSON.parse(await fs.readFile(utterancesPath, 'utf8'));
    for (const u of utterances) {
      const r = SeaweedKbService.search(u.text, u.lang);
      if (u.expectId === null) {
        expect(r.knownAnswer).toBe(false);
      } else {
        expect(r.knownAnswer).toBe(true);
        expect(r.cards[0].id).toBe(u.expectId);
      }
    }
  });
});
```

- [ ] **Step 2: Run and verify failing**

```bash
cd backend && npx jest tests/unit/seaweedKb.test.js
```
Expected: FAIL (module missing).

- [ ] **Step 3: Implement the service**

Create `backend/src/services/seaweedKbService.js`:
```js
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'seaweedKb');

const STOP_SW = new Set(['na', 'ya', 'kwa', 'ni', 'wa', 'la', 'cha', 'au', 'kama', 'je', 'nini']);
const STOP_EN = new Set(['the', 'a', 'an', 'is', 'are', 'to', 'of', 'and', 'or', 'in', 'on', 'for', 'what', 'how', 'my']);

const tokenize = (text, lang) => {
  const stop = lang === 'sw' ? STOP_SW : STOP_EN;
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t && t.length > 1 && !stop.has(t));
};

const state = { loaded: false, cards: [], system: null, df: new Map(), avgLen: 1 };

function corpusTextForCard(card, lang) {
  const aliases = lang === 'sw' ? card.aliases_sw : card.aliases_en;
  const qs = card.question_variants.filter((q) => q.lang === lang).map((q) => q.text);
  const ans = lang === 'sw' ? card.answer_sw : card.answer_en;
  return [card.topic, ...aliases, ...qs, ans].join(' ');
}

function buildIndex() {
  const docs = [];
  for (const card of state.cards) {
    for (const lang of ['sw', 'en']) {
      docs.push({ card, lang, tokens: tokenize(corpusTextForCard(card, lang), lang) });
    }
  }
  const df = new Map();
  let totalLen = 0;
  for (const d of docs) {
    totalLen += d.tokens.length;
    const seen = new Set();
    for (const t of d.tokens) if (!seen.has(t)) { seen.add(t); df.set(t, (df.get(t) || 0) + 1); }
  }
  state.docs = docs;
  state.df = df;
  state.avgLen = docs.length ? totalLen / docs.length : 1;
  state.N = docs.length;
}

function bm25Score(queryTokens, doc, { k1 = 1.5, b = 0.75 } = {}) {
  const tf = new Map();
  for (const t of doc.tokens) tf.set(t, (tf.get(t) || 0) + 1);
  let score = 0;
  for (const q of queryTokens) {
    const n = state.df.get(q);
    if (!n) continue;
    const idf = Math.log(1 + (state.N - n + 0.5) / (n + 0.5));
    const f = tf.get(q) || 0;
    if (f === 0) continue;
    const norm = f * (k1 + 1) / (f + k1 * (1 - b + b * doc.tokens.length / state.avgLen));
    score += idf * norm;
  }
  return score;
}

export const SeaweedKbService = {
  async load() {
    if (state.loaded) return;
    const files = (await fs.readdir(KB_DIR)).sort();
    state.cards = [];
    for (const f of files) {
      const raw = await fs.readFile(path.join(KB_DIR, f), 'utf8');
      const json = JSON.parse(raw);
      if (f === '_system.json') state.system = json;
      else state.cards.push(json);
    }
    buildIndex();
    state.loaded = true;
  },

  systemPrompt(lang) {
    return state.system?.[lang === 'sw' ? 'voice_prompt_sw' : 'voice_prompt_en'] || '';
  },
  fallback(lang) {
    return state.system?.[lang === 'sw' ? 'fallback_sw' : 'fallback_en'] || '';
  },

  search(text, lang, { k = 3, threshold = 0.15, llm = null } = {}) {
    if (!state.loaded) throw new Error('SeaweedKbService.load() must be called first');
    const qt = tokenize(text, lang);
    const scored = state.docs
      .filter((d) => d.lang === lang)
      .map((d) => ({ card: d.card, score: bm25Score(qt, d) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    const dedup = [];
    const seen = new Set();
    for (const s of scored) if (!seen.has(s.card.id)) { seen.add(s.card.id); dedup.push(s); }
    const top = dedup.slice(0, k);
    const topScore = top[0]?.score || 0;
    const normalised = top.length ? topScore / (topScore + 1) : 0;
    return {
      cards: top.map((s) => s.card),
      score: normalised,
      knownAnswer: normalised >= threshold,
      pickedBy: 'bm25',
    };
  },
};
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd backend && npx jest tests/unit/seaweedKb.test.js
```
Expected: PASS. If the threshold produces false negatives for the labelled utterances, lower `threshold` in the test's `search` call to find the smallest value that passes all labels, then set that value as the default in the service. Document the chosen value with a one-line comment above the `threshold = ` parameter.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/seaweedKbService.js backend/tests/fixtures/voice backend/tests/unit/seaweedKb.test.js
git commit -m "feat(voice): add BM25-based seaweed knowledge retrieval"
```

---

## Task 7: Voice session service (CRUD + idempotency + PIN + concurrent isolation)

**Files:**
- Create: `backend/src/services/voiceSessionService.js`
- Test: `backend/tests/unit/voiceSession.test.js`

**Interfaces:**
- Consumes: `prisma` from `backend/src/config/prisma.js`; `normalizeTzPhone` from `backend/src/utils/phone.js`; `bcrypt` from `bcryptjs`.
- Produces:
  ```
  VoiceSessionService.findOrCreate({ sessionId, callerNumberRaw }) → VoiceSession
  VoiceSessionService.shouldReplay(session, recordingUrl) → boolean
  VoiceSessionService.recordReply(sessionId, { recordingUrl, responseXml }) → void
  VoiceSessionService.appendTurn(sessionId, { role: 'user'|'assistant', text, lang, intent?, kbIds? }) → VoiceSession
  VoiceSessionService.setLanguage(sessionId, lang) → void
  VoiceSessionService.clearForConsentDecline(sessionId) → void      (nulls callerNumber + transcript, sets endedReason='CONSENT_DECLINED', endedAt=now)
  VoiceSessionService.end(sessionId, reason) → void
  VoiceSessionService.verifyPinAndAttach(sessionId, pin) → { ok: boolean, locked?: boolean, farmerId?: string, farmId?: string }
  ```

- [ ] **Step 1: Write the failing tests (uses the real test DB via globalSetup)**

Create `backend/tests/unit/voiceSession.test.js`:
```js
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import prisma from '../../src/config/prisma.js';
import { VoiceSessionService } from '../../src/services/voiceSessionService.js';

const mkSid = () => `atsid-${randomUUID()}`;

describe('VoiceSessionService', () => {
  it('findOrCreate normalises caller number and is idempotent per sessionId', async () => {
    const sid = mkSid();
    const a = await VoiceSessionService.findOrCreate({ sessionId: sid, callerNumberRaw: '0699920003' });
    const b = await VoiceSessionService.findOrCreate({ sessionId: sid, callerNumberRaw: '0699920003' });
    expect(a.id).toBe(b.id);
    expect(a.callerNumber).toMatch(/^\+255699920003$/);
    expect(a.turnCount).toBe(0);
  });

  it('shouldReplay returns true for the same recordingUrl served last turn (REVIEW FOCUS #1)', async () => {
    const sid = mkSid();
    const s = await VoiceSessionService.findOrCreate({ sessionId: sid, callerNumberRaw: '+255700111222' });
    expect(VoiceSessionService.shouldReplay(s, 'https://a.test/rec1.mp3')).toBe(false);
    await VoiceSessionService.recordReply(sid, { recordingUrl: 'https://a.test/rec1.mp3', responseXml: '<xml/>' });
    const s2 = await prisma.voiceSession.findUnique({ where: { id: sid } });
    expect(VoiceSessionService.shouldReplay(s2, 'https://a.test/rec1.mp3')).toBe(true);
    expect(VoiceSessionService.shouldReplay(s2, 'https://a.test/rec2.mp3')).toBe(false);
  });

  it('concurrent sessions do not share transcript or farm (REVIEW FOCUS #2)', async () => {
    const a = mkSid();
    const b = mkSid();
    await VoiceSessionService.findOrCreate({ sessionId: a, callerNumberRaw: '+255700000001' });
    await VoiceSessionService.findOrCreate({ sessionId: b, callerNumberRaw: '+255700000002' });
    await VoiceSessionService.appendTurn(a, { role: 'user', text: 'A says hi', lang: 'en' });
    await VoiceSessionService.appendTurn(b, { role: 'user', text: 'B says habari', lang: 'sw' });
    const [ra, rb] = await Promise.all([
      prisma.voiceSession.findUnique({ where: { id: a } }),
      prisma.voiceSession.findUnique({ where: { id: b } }),
    ]);
    expect(ra.transcript).toHaveLength(1);
    expect(ra.transcript[0].text).toBe('A says hi');
    expect(rb.transcript).toHaveLength(1);
    expect(rb.transcript[0].text).toBe('B says habari');
  });

  it('clearForConsentDecline nulls callerNumber and transcript and ends session', async () => {
    const sid = mkSid();
    await VoiceSessionService.findOrCreate({ sessionId: sid, callerNumberRaw: '+255700000003' });
    await VoiceSessionService.appendTurn(sid, { role: 'user', text: 'sikubali', lang: 'sw' });
    await VoiceSessionService.clearForConsentDecline(sid);
    const r = await prisma.voiceSession.findUnique({ where: { id: sid } });
    expect(r.callerNumber).toBeNull();
    expect(r.transcript).toEqual([]);
    expect(r.endedReason).toBe('CONSENT_DECLINED');
    expect(r.endedAt).toBeInstanceOf(Date);
  });

  it('verifyPinAndAttach: 3 bad pins → pinLocked=true, no farmerId set', async () => {
    const sid = mkSid();
    const number = '+255700000004';
    await VoiceSessionService.findOrCreate({ sessionId: sid, callerNumberRaw: number });
    const user = await prisma.user.create({ data: { phoneNumber: number, passwordHash: 'x', farmer: { create: { fullName: 'T', voicePinHash: await bcrypt.hash('4321', 10), voicePinSetAt: new Date() } } }, include: { farmer: true } });
    expect((await VoiceSessionService.verifyPinAndAttach(sid, '0000')).ok).toBe(false);
    expect((await VoiceSessionService.verifyPinAndAttach(sid, '1111')).ok).toBe(false);
    const third = await VoiceSessionService.verifyPinAndAttach(sid, '2222');
    expect(third.ok).toBe(false);
    expect(third.locked).toBe(true);
    const fourth = await VoiceSessionService.verifyPinAndAttach(sid, '4321');
    expect(fourth.ok).toBe(false);
    expect(fourth.locked).toBe(true);
    await prisma.user.delete({ where: { id: user.id } });
  });
});
```

- [ ] **Step 2: Run and verify failing**

```bash
cd backend && npx jest tests/unit/voiceSession.test.js
```
Expected: FAIL (service missing).

- [ ] **Step 3: Implement the service**

Create `backend/src/services/voiceSessionService.js`:
```js
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import { normalizeTzPhone } from '../utils/phone.js';

const PIN_MAX_ATTEMPTS = 3;

export const VoiceSessionService = {
  async findOrCreate({ sessionId, callerNumberRaw }) {
    const callerNumber = normalizeTzPhone(callerNumberRaw) || null;
    return prisma.voiceSession.upsert({
      where: { id: sessionId },
      update: {},
      create: { id: sessionId, callerNumber },
    });
  },

  shouldReplay(session, recordingUrl) {
    return Boolean(recordingUrl) && session?.lastRecordingUrl === recordingUrl;
  },

  async recordReply(sessionId, { recordingUrl, responseXml }) {
    await prisma.voiceSession.update({
      where: { id: sessionId },
      data: { lastRecordingUrl: recordingUrl, lastResponseXml: responseXml },
    });
  },

  async appendTurn(sessionId, turn) {
    const session = await prisma.voiceSession.findUnique({ where: { id: sessionId } });
    const transcript = Array.isArray(session.transcript) ? session.transcript : [];
    transcript.push({ ...turn, ts: new Date().toISOString() });
    return prisma.voiceSession.update({
      where: { id: sessionId },
      data: {
        transcript,
        turnCount: (session.turnCount || 0) + (turn.role === 'user' ? 1 : 0),
        language: turn.lang && (turn.lang === 'sw' || turn.lang === 'en') ? turn.lang.toUpperCase() : session.language,
      },
    });
  },

  async setLanguage(sessionId, lang) {
    await prisma.voiceSession.update({ where: { id: sessionId }, data: { language: lang.toUpperCase() } });
  },

  async clearForConsentDecline(sessionId) {
    await prisma.voiceSession.update({
      where: { id: sessionId },
      data: { callerNumber: null, transcript: [], endedReason: 'CONSENT_DECLINED', endedAt: new Date(), consentGiven: false },
    });
  },

  async end(sessionId, reason) {
    await prisma.voiceSession.update({
      where: { id: sessionId },
      data: { endedReason: reason, endedAt: new Date() },
    });
  },

  async verifyPinAndAttach(sessionId, pin) {
    const session = await prisma.voiceSession.findUnique({ where: { id: sessionId } });
    if (!session || session.pinLocked) return { ok: false, locked: true };
    if (!session.callerNumber) return { ok: false };
    const user = await prisma.user.findUnique({ where: { phoneNumber: session.callerNumber }, include: { farmer: { include: { farms: { take: 1, orderBy: { farmCode: 'asc' } } } } } });
    const hash = user?.farmer?.voicePinHash;
    const ok = Boolean(hash) && await bcrypt.compare(String(pin || ''), hash);
    const attempts = (session.pinAttempts || 0) + (ok ? 0 : 1);
    const locked = !ok && attempts >= PIN_MAX_ATTEMPTS;
    await prisma.voiceSession.update({
      where: { id: sessionId },
      data: {
        pinAttempts: attempts,
        pinLocked: locked || session.pinLocked,
        farmerId: ok ? user.farmer.id : session.farmerId,
        farmerFarmId: ok ? user.farmer.farms[0]?.id || null : session.farmerFarmId,
      },
    });
    return { ok, locked: locked || false, farmerId: ok ? user.farmer.id : undefined, farmId: ok ? user.farmer.farms[0]?.id : undefined };
  },
};
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd backend && npx jest tests/unit/voiceSession.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/voiceSessionService.js backend/tests/unit/voiceSession.test.js
git commit -m "feat(voice): add VoiceSessionService with idempotent replay + PIN gate"
```

---

## Task 8: Voice assistant orchestration (STT → route → retrieve → compose → TTS)

**Files:**
- Create: `backend/src/services/voiceAssistantService.js`
- Test: `backend/tests/unit/voiceAssistant.test.js`
- Test: `backend/tests/unit/voiceAssistantSafety.test.js`

**Interfaces:**
- Consumes: `SeaweedKbService` (Task 6), `VoiceSessionService` (Task 7), `createSTTProvider` (Task 3), `createTTSProvider` + `synthesizeToCache` (Task 4), `createLLMProvider` (existing), `AssistantService` (existing, used only for PIN-authenticated farm-specific questions, out of scope for the first test cycle), `detectLanguage` from `assistantService.js`.
- Produces:
  ```
  function detectGoodbye(text) → boolean
  function detectConsentDecline(text) → boolean
  async function downloadRecording(url, { fetchImpl?, maxBytes? }) → Buffer
  const VoiceAssistantService = {
    async handleTurn({ session, recordingUrl, deps? }) → {
      replyText: string,
      replyLang: 'sw'|'en',
      replyAudio: { hash, path, mimeType } | null,       // null → caller falls back to <Say>
      continue: boolean,                                  // false → caller emits <Hangup/>
      endedReason: string | null,                         // set when continue=false
      needsPin: boolean,
    }
  }
  ```
  `deps` lets tests inject fakes for `stt`, `llm`, `tts`, `kb`, `now`, `fetchImpl`, `assistant` (defaults wire the real providers via the factory functions).

- [ ] **Step 1: Write the failing orchestration tests**

Create `backend/tests/unit/voiceAssistant.test.js`:
```js
import { VoiceAssistantService, detectGoodbye, detectConsentDecline } from '../../src/services/voiceAssistantService.js';
import { SeaweedKbService } from '../../src/services/seaweedKbService.js';
import { VoiceSessionService } from '../../src/services/voiceSessionService.js';
import { randomUUID } from 'node:crypto';

const fakeStt = (text, language = 'sw') => ({ transcribe: async () => ({ text, language, confidence: null, rawProvider: {} }) });
const fakeLlm = (replyFn) => ({ name: 'fake-llm', isLive: true, generate: async ({ prompt }) => replyFn(prompt) });
const fakeTts = () => ({ name: 'fake-tts', isLive: true, synthesize: async ({ text }) => ({ audio: Buffer.from(text), mimeType: 'audio/mpeg' }) });
const neverCalled = () => { throw new Error('must not be called'); };

beforeAll(() => SeaweedKbService.load());

const makeSession = async () => {
  const sid = `atsid-${randomUUID()}`;
  await VoiceSessionService.findOrCreate({ sessionId: sid, callerNumberRaw: '+255700000005' });
  return sid;
};

describe('VoiceAssistantService.handleTurn', () => {
  it('serves a KB answer for a known Kiswahili question', async () => {
    const sid = await makeSession();
    const session = { id: sid, language: 'SW', consentGiven: true, turnCount: 0, pinLocked: false, lastRecordingUrl: null, transcript: [] };
    const r = await VoiceAssistantService.handleTurn({
      session,
      recordingUrl: 'https://rec/test1.mp3',
      deps: {
        stt: fakeStt('Mwani wangu umekuwa mweupe nifanye nini'),
        llm: fakeLlm(() => 'Hamisha mistari hadi maji baridi na uondoe matawi yaliyoathirika.'),
        tts: fakeTts(),
        fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }),
        audioDir: '/tmp/voice-test-' + sid,
      },
    });
    expect(r.replyLang).toBe('sw');
    expect(r.replyText.toLowerCase()).toContain('hamisha');
    expect(r.continue).toBe(true);
    expect(r.replyAudio).toBeTruthy();
  });

  it('ends the call politely when goodbye phrase is embedded (REVIEW FOCUS #3)', async () => {
    const sid = await makeSession();
    const session = { id: sid, language: 'SW', consentGiven: true, turnCount: 1, pinLocked: false, lastRecordingUrl: null, transcript: [] };
    const r = await VoiceAssistantService.handleTurn({
      session,
      recordingUrl: 'https://rec/test2.mp3',
      deps: {
        stt: fakeStt('sawa asante nimemaliza niende'),
        llm: { generate: neverCalled },
        tts: fakeTts(),
        fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }),
        audioDir: '/tmp/voice-test-' + sid,
      },
    });
    expect(r.continue).toBe(false);
    expect(r.endedReason).toBe('USER_GOODBYE');
    expect(r.replyText.toLowerCase()).toContain('asante');
  });

  it('re-prompts and does not consume turn when STT returns empty (REVIEW FOCUS #4)', async () => {
    const sid = await makeSession();
    const session = { id: sid, language: 'SW', consentGiven: true, turnCount: 2, pinLocked: false, lastRecordingUrl: null, transcript: [] };
    let llmCalls = 0;
    const r = await VoiceAssistantService.handleTurn({
      session,
      recordingUrl: 'https://rec/empty.mp3',
      deps: {
        stt: fakeStt(''),
        llm: { generate: () => { llmCalls += 1; return ''; } },
        tts: fakeTts(),
        fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }),
        audioDir: '/tmp/voice-test-' + sid,
      },
    });
    expect(llmCalls).toBe(0);
    expect(r.continue).toBe(true);
    expect(r.replyText.toLowerCase()).toMatch(/sijakusikia|say again|tafadhali/);
  });

  it('clears session and ends when the farmer declines consent on turn 1', async () => {
    const sid = await makeSession();
    const session = { id: sid, language: 'SW', consentGiven: true, turnCount: 0, pinLocked: false, lastRecordingUrl: null, transcript: [] };
    const r = await VoiceAssistantService.handleTurn({
      session,
      recordingUrl: 'https://rec/decline.mp3',
      deps: {
        stt: fakeStt('sikubali'),
        llm: { generate: neverCalled },
        tts: fakeTts(),
        fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }),
        audioDir: '/tmp/voice-test-' + sid,
      },
    });
    expect(r.continue).toBe(false);
    expect(r.endedReason).toBe('CONSENT_DECLINED');
  });

  it('switches reply language when the caller speaks the other language', async () => {
    const sid = await makeSession();
    const session = { id: sid, language: 'SW', consentGiven: true, turnCount: 0, pinLocked: false, lastRecordingUrl: null, transcript: [] };
    const r = await VoiceAssistantService.handleTurn({
      session,
      recordingUrl: 'https://rec/en.mp3',
      deps: {
        stt: fakeStt('How do I dry seaweed properly', 'en'),
        llm: fakeLlm(() => 'Dry on raised racks off the ground.'),
        tts: fakeTts(),
        fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }),
        audioDir: '/tmp/voice-test-' + sid,
      },
    });
    expect(r.replyLang).toBe('en');
    expect(r.replyText.toLowerCase()).toContain('dry');
  });

  it('serves fallback text when no KB card scores above threshold', async () => {
    const sid = await makeSession();
    const session = { id: sid, language: 'SW', consentGiven: true, turnCount: 0, pinLocked: false, lastRecordingUrl: null, transcript: [] };
    const r = await VoiceAssistantService.handleTurn({
      session,
      recordingUrl: 'https://rec/offtopic.mp3',
      deps: {
        stt: fakeStt('bei ya samaki leo', 'sw'),
        llm: { generate: neverCalled },
        tts: fakeTts(),
        fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }),
        audioDir: '/tmp/voice-test-' + sid,
      },
    });
    expect(r.continue).toBe(true);
    expect(r.replyText).toContain('Samahani');
  });

  it('detectGoodbye catches sw and en variants', () => {
    expect(detectGoodbye('asante nimemaliza')).toBe(true);
    expect(detectGoodbye('nimemaliza')).toBe(true);
    expect(detectGoodbye('stop')).toBe(true);
    expect(detectGoodbye('mwisho')).toBe(true);
    expect(detectGoodbye('that is all thank you')).toBe(true);
    expect(detectGoodbye('endelea')).toBe(false);
  });

  it('detectConsentDecline catches sikubali / nakataa', () => {
    expect(detectConsentDecline('sikubali')).toBe(true);
    expect(detectConsentDecline('nakataa')).toBe(true);
    expect(detectConsentDecline('nakubali')).toBe(false);
  });
});
```

Create `backend/tests/unit/voiceAssistantSafety.test.js`:
```js
import { VoiceAssistantService } from '../../src/services/voiceAssistantService.js';
import { SeaweedKbService } from '../../src/services/seaweedKbService.js';
import { VoiceSessionService } from '../../src/services/voiceSessionService.js';
import { randomUUID } from 'node:crypto';

beforeAll(() => SeaweedKbService.load());

const neverFab = /\b\d{1,3}[.,]?\d{3,}\s*(TZS|TSh|USD|KES|shilingi|kg)?\b/i;

const makeSession = async () => {
  const sid = `atsid-${randomUUID()}`;
  await VoiceSessionService.findOrCreate({ sessionId: sid, callerNumberRaw: '+255700000006' });
  return { id: sid, language: 'SW', consentGiven: true, turnCount: 0, pinLocked: false, lastRecordingUrl: null, transcript: [] };
};

describe('voice assistant safety rails', () => {
  const prompts = [
    'nipe bei ya leo ya mwani',
    "what's the price of seaweed today",
    'nipe utabiri wa bei kwa wiki ijayo',
    'niambie dawa gani ninapulizia',
    'what pesticide should I use',
  ];
  it.each(prompts)('never emits a fabricated number or treatment recommendation for %p', async (p) => {
    const session = await makeSession();
    const r = await VoiceAssistantService.handleTurn({
      session,
      recordingUrl: `https://rec/${encodeURIComponent(p)}.mp3`,
      deps: {
        stt: { transcribe: async () => ({ text: p, language: p.match(/[^\x00-\x7f]|mwani|bei|dawa|utabiri/i) ? 'sw' : 'en', confidence: null, rawProvider: {} }) },
        llm: { generate: async () => '1,250 TZS kwa kilo moja; tumia dawa ya X.' },
        tts: { synthesize: async () => ({ audio: Buffer.alloc(0), mimeType: 'audio/mpeg' }) },
        fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }),
        audioDir: '/tmp/voice-safety-' + Date.now(),
      },
    });
    expect(r.replyText).not.toMatch(neverFab);
    expect(r.replyText.toLowerCase()).not.toMatch(/dawa|pesticide|treatment/);
  });
});
```

- [ ] **Step 2: Run and verify failing**

```bash
cd backend && npx jest tests/unit/voiceAssistant.test.js tests/unit/voiceAssistantSafety.test.js
```
Expected: FAIL (module missing).

- [ ] **Step 3: Implement the orchestrator**

Create `backend/src/services/voiceAssistantService.js`:
```js
import { env } from '../config/env.js';
import { SeaweedKbService } from './seaweedKbService.js';
import { VoiceSessionService } from './voiceSessionService.js';
import { createSTTProvider } from '../providers/voice/sttProvider.js';
import { createTTSProvider, synthesizeToCache } from '../providers/voice/ttsProvider.js';
import { createLLMProvider } from '../providers/llmProvider.js';
import { detectLanguage } from './assistantService.js';
import path from 'node:path';

const GOODBYE_RE = /(^|\s)(asante\s+nimemaliza|nimemaliza|mwisho|ndio\s+basi|basi|niende|stop|that'?s\s+all|that\s+is\s+all|thank\s+you.*bye|goodbye)(\s|$|[.!?])/i;
const DECLINE_RE = /(^|\s)(sikubali|nakataa|do\s*not\s*agree|don'?t\s+agree|decline)(\s|$|[.!?])/i;

export const detectGoodbye = (text) => GOODBYE_RE.test(text || '');
export const detectConsentDecline = (text) => DECLINE_RE.test(text || '');

const T = (lang) => ({
  prompt: lang === 'sw' ? 'Uliza swali kuhusu mwani.' : 'Ask a seaweed question.',
  cannotHear: lang === 'sw' ? 'Samahani sijakusikia, tafadhali sema tena.' : 'Sorry, I did not hear you. Please say that again.',
  farewell: lang === 'sw' ? 'Asante kwa kupiga simu MwaniMlinzi. Kwaheri.' : 'Thank you for calling MwaniMlinzi. Goodbye.',
  declineAck: lang === 'sw' ? 'Sawa, hatutaendelea. Kwaheri.' : 'Okay, we will not continue. Goodbye.',
  // Lazy — SeaweedKbService.load() is async and may not have completed at module import time.
  unknown: SeaweedKbService.fallback(lang),
});

export async function downloadRecording(url, { fetchImpl = globalThis.fetch, maxBytes = 2 * 1024 * 1024, timeoutMs = 10000 } = {}) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`recording download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error('recording exceeds maxBytes');
  return buf;
}

const FORBIDDEN_RX = /(^|\b)(\d{1,3}[.,]?\d{3,}\s*(TZS|TSh|USD|KES|shilingi|kg)?|dawa|pesticide|treatment|fertilizer|mbolea|nyunyiz\w*)/i;

const resolveLang = (session, sttLang, text) => {
  const detected = sttLang || detectLanguage(text || '');
  if (detected === 'sw' || detected === 'en') return detected;
  return (session.language || 'SW').toLowerCase();
};

async function composeReply({ transcript, cards, lang, llm }) {
  const t = T(lang);
  if (!cards.length) return t.unknown;
  const raw = lang === 'sw' ? cards[0].answer_sw : cards[0].answer_en;
  if (!llm?.isLive) return raw;
  const context = cards.map((c, i) => `[${i + 1}] ${lang === 'sw' ? c.answer_sw : c.answer_en}`).join('\n');
  const systemPrompt = SeaweedKbService.systemPrompt(lang).replace('{FALLBACK}', t.unknown);
  let generated = null;
  try {
    generated = await llm.generate({
      system: systemPrompt,
      prompt: `TRANSCRIPT: ${transcript}\nCONTEXT:\n${context}\nAnswer in ${lang === 'sw' ? 'Kiswahili' : 'English'} in one or two short sentences.`,
      maxTokens: 120,
    });
  } catch {
    return raw;
  }
  const candidate = (generated || '').trim();
  if (!candidate || FORBIDDEN_RX.test(candidate)) return raw;
  return candidate;
}

async function synthesizeOrNull({ text, lang, tts, audioDir, voices }) {
  try {
    const voice = lang === 'sw' ? voices.sw : voices.en;
    return await synthesizeToCache(tts, { text, lang, voice, audioDir });
  } catch {
    return null;
  }
}

export const VoiceAssistantService = {
  async handleTurn({ session, recordingUrl, deps = {} }) {
    const stt = deps.stt || createSTTProvider();
    const llm = deps.llm || createLLMProvider();
    const tts = deps.tts || createTTSProvider();
    const fetchImpl = deps.fetchImpl || globalThis.fetch;
    const audioDir = deps.audioDir || path.resolve(process.cwd(), env.voice.audio.dir);
    const voices = { sw: env.voice.tts.voiceSw, en: env.voice.tts.voiceEn };

    let audioBuf;
    try {
      audioBuf = await downloadRecording(recordingUrl, { fetchImpl });
    } catch {
      const lang = (session.language || 'SW').toLowerCase();
      const text = T(lang).cannotHear;
      const audio = await synthesizeOrNull({ text, lang, tts, audioDir, voices });
      return { replyText: text, replyLang: lang, replyAudio: audio, continue: true, endedReason: null, needsPin: false };
    }

    const { text: utterance, language: sttLang } = await stt.transcribe({
      audioBuffer: audioBuf,
      mimeType: 'audio/mpeg',
      hintLang: env.voice.stt.langHint,
    });

    if (!utterance) {
      const lang = (session.language || 'SW').toLowerCase();
      const text = T(lang).cannotHear;
      const audio = await synthesizeOrNull({ text, lang, tts, audioDir, voices });
      return { replyText: text, replyLang: lang, replyAudio: audio, continue: true, endedReason: null, needsPin: false };
    }

    const lang = resolveLang(session, sttLang, utterance);
    const t = T(lang);

    if (detectConsentDecline(utterance) && session.turnCount === 0) {
      const audio = await synthesizeOrNull({ text: t.declineAck, lang, tts, audioDir, voices });
      return { replyText: t.declineAck, replyLang: lang, replyAudio: audio, continue: false, endedReason: 'CONSENT_DECLINED', needsPin: false };
    }
    if (detectGoodbye(utterance)) {
      const audio = await synthesizeOrNull({ text: t.farewell, lang, tts, audioDir, voices });
      return { replyText: t.farewell, replyLang: lang, replyAudio: audio, continue: false, endedReason: 'USER_GOODBYE', needsPin: false };
    }

    const hit = SeaweedKbService.search(utterance, lang);
    const replyText = hit.knownAnswer
      ? await composeReply({ transcript: utterance, cards: hit.cards, lang, llm })
      : t.unknown;
    const audio = await synthesizeOrNull({ text: replyText, lang, tts, audioDir, voices });

    return {
      replyText,
      replyLang: lang,
      replyAudio: audio,
      continue: session.turnCount + 1 < env.voice.maxTurnsPerCall,
      endedReason: session.turnCount + 1 >= env.voice.maxTurnsPerCall ? 'MAX_TURNS' : null,
      needsPin: false,
    };
  },
};
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd backend && npx jest tests/unit/voiceAssistant.test.js tests/unit/voiceAssistantSafety.test.js
```
Expected: PASS. If any safety-adversarial prompt leaks the forbidden pattern, strengthen `FORBIDDEN_RX` to catch it and re-run. Do not weaken the test.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/voiceAssistantService.js backend/tests/unit/voiceAssistant.test.js backend/tests/unit/voiceAssistantSafety.test.js
git commit -m "feat(voice): orchestrate STT→retrieve→compose→TTS with safety rails"
```

---

## Task 9: HTTP endpoints — entry / turn / events / audio

**Files:**
- Create: `backend/src/controllers/voiceController.js`
- Create: `backend/src/routes/voice.routes.js`
- Modify: `backend/src/routes/integrations.routes.js`
- Modify: `backend/src/app.js`
- Modify: `backend/src/providers/africastalking/config.js`
- Test: `backend/tests/integration/voice.test.js`

**Interfaces:**
- Consumes: `VoiceAssistantService.handleTurn` (Task 8), `VoiceSessionService` (Task 7), `atVoiceXml` (Task 2), `atConfig` and `secretOk` pattern (existing).
- Produces four handlers:
  ```
  POST /api/integrations/africastalking/voice            → entry(req,res)
  POST /api/integrations/africastalking/voice/turn       → turn(req,res)
  POST /api/integrations/africastalking/voice/events     → events(req,res)
  GET  /api/voice/audio/:hash.mp3?sig=&exp=              → audio(req,res)
  ```
  Helper: `signAudioUrl(hash, { expMs?, baseUrl?, secret? }) → string` — HMAC(SHA-256) of `${hash}|${exp}` using `secret` (default: `AT_CALLBACK_SECRET`); URL shape `${baseUrl}/api/voice/audio/${hash}.mp3?sig=<hex>&exp=<unix-ms>`.

- [ ] **Step 1: Write the failing integration tests**

Create `backend/tests/integration/voice.test.js`:
```js
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { signAudioUrl } from '../../src/controllers/voiceController.js';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const app = createApp();
const S = env.africastalking.callbackSecret;

const form = (body) => new URLSearchParams(body).toString();

describe('voice HTTP endpoints', () => {
  it('entry rejects missing secret with 403 and no body leak', async () => {
    const r = await request(app).post('/api/integrations/africastalking/voice').set('content-type', 'application/x-www-form-urlencoded').send(form({ sessionId: 'x', callerNumber: '+255699920003', isActive: '1' }));
    expect(r.status).toBe(403);
    expect(r.text).not.toContain('secret');
  });

  it('entry with correct secret returns XML containing greeting + Record', async () => {
    const sid = `atsid-${randomUUID()}`;
    const r = await request(app).post(`/api/integrations/africastalking/voice?secret=${S}`).set('content-type', 'application/x-www-form-urlencoded').send(form({ sessionId: sid, callerNumber: '+255699920003', isActive: '1' }));
    expect(r.status).toBe(200);
    expect(r.get('content-type')).toMatch(/application\/xml/);
    expect(r.text).toContain('Karibu MwaniMlinzi');
    expect(r.text).toContain('<Record');
    expect(r.text).toContain('callbackUrl="');
  });

  it('turn is idempotent on same recordingUrl (REVIEW FOCUS #1)', async () => {
    // Open a session first
    const sid = `atsid-${randomUUID()}`;
    await request(app).post(`/api/integrations/africastalking/voice?secret=${S}`).send(form({ sessionId: sid, callerNumber: '+255700111222', isActive: '1' }));
    const url = `https://rec.test/${sid}.mp3`;
    const a = await request(app).post(`/api/integrations/africastalking/voice/turn?secret=${S}`).send(form({ sessionId: sid, recordingUrl: url, durationInSeconds: '2' }));
    const b = await request(app).post(`/api/integrations/africastalking/voice/turn?secret=${S}`).send(form({ sessionId: sid, recordingUrl: url, durationInSeconds: '2' }));
    expect(a.text).toBe(b.text);
    expect(a.status).toBe(200);
  });

  it('events marks session ended', async () => {
    const sid = `atsid-${randomUUID()}`;
    await request(app).post(`/api/integrations/africastalking/voice?secret=${S}`).send(form({ sessionId: sid, callerNumber: '+255700333444', isActive: '1' }));
    const r = await request(app).post(`/api/integrations/africastalking/voice/events?secret=${S}`).send(form({ sessionId: sid, isActive: '0', status: 'Completed', durationInSeconds: '12' }));
    expect(r.status).toBe(200);
  });

  it('audio serves cached mp3 when signature is valid, 410 when expired, 403 when forged (REVIEW FOCUS #5)', async () => {
    const audioDir = path.resolve(process.cwd(), env.voice.audio.dir);
    await fs.mkdir(audioDir, { recursive: true });
    const hash = 'a'.repeat(64);
    await fs.writeFile(path.join(audioDir, `${hash}.mp3`), Buffer.from([0xff, 0xfb, 0x00]));

    const okUrl = signAudioUrl(hash, { expMs: Date.now() + 60_000 });
    const okPath = okUrl.replace(/^https?:\/\/[^/]*/, '');
    const ok = await request(app).get(okPath);
    expect(ok.status).toBe(200);
    expect(ok.get('content-type')).toMatch(/audio\/mpeg/);

    const expiredUrl = signAudioUrl(hash, { expMs: Date.now() - 1000 });
    const expiredPath = expiredUrl.replace(/^https?:\/\/[^/]*/, '');
    const expired = await request(app).get(expiredPath);
    expect(expired.status).toBe(410);
    expect(expired.text).not.toContain(hash);

    const forged = await request(app).get(`/api/voice/audio/${hash}.mp3?sig=deadbeef&exp=${Date.now() + 60_000}`);
    expect(forged.status).toBe(403);
    expect(forged.text).not.toContain(hash);
  });
});
```

- [ ] **Step 2: Run and verify failing**

```bash
cd backend && npx jest tests/integration/voice.test.js
```
Expected: FAIL (routes missing).

- [ ] **Step 3: Implement the controller**

Create `backend/src/controllers/voiceController.js`:
```js
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { env } from '../config/env.js';
import { atConfig } from '../providers/africastalking/config.js';
import { VoiceSessionService } from '../services/voiceSessionService.js';
import { VoiceAssistantService } from '../services/voiceAssistantService.js';
import { responseXml, sayXml, playXml, recordXml, hangupXml } from '../providers/voice/atVoiceXml.js';
import { maskPhone } from '../utils/phone.js';

const str = (max) => z.string().trim().max(max);
const entrySchema = z.object({
  sessionId: str(128).min(1),
  callerNumber: str(32).optional().default(''),
  isActive: z.union([z.string(), z.number()]).optional(),
  direction: str(32).optional(),
}).passthrough();
const turnSchema = z.object({
  sessionId: str(128).min(1),
  recordingUrl: str(1024).optional(),
  durationInSeconds: z.union([z.string(), z.number()]).optional(),
}).passthrough();
const eventsSchema = z.object({
  sessionId: str(128).min(1),
  isActive: z.union([z.string(), z.number()]).optional(),
  status: str(64).optional(),
  durationInSeconds: z.union([z.string(), z.number()]).optional(),
}).passthrough();

function secretOk(req) {
  const expected = atConfig().callbackSecret;
  if (!expected) return false;
  const given = String(req.query.secret || req.get('x-callback-secret') || '');
  if (!given || given.length === 0) return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function sendXml(res, body) {
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.status(200).send(responseXml(body));
}

function recordInvite({ secret }) {
  const base = env.publicApiUrl || '';
  const url = `${base}/api/integrations/africastalking/voice/turn?secret=${encodeURIComponent(secret)}`;
  // No nested <Say>: the preceding <Say>/<Play> IS the prompt; <Record> emits its own beep.
  return recordXml({ callbackUrl: url });
}

const GREETING_SW = 'Karibu MwaniMlinzi. Mimi ni msaidizi wa akili bandia wa kilimo cha mwani. Mazungumzo yetu yatarekodiwa ili kuboresha huduma. Una swali gani kuhusu mwani? Sema baada ya mlio, bonyeza nyota ukimaliza.';

export function signAudioUrl(hash, { expMs = Date.now() + 10 * 60_000, baseUrl = env.publicApiUrl || '', secret = atConfig().callbackSecret } = {}) {
  const sig = crypto.createHmac('sha256', secret || '').update(`${hash}|${expMs}`).digest('hex');
  return `${baseUrl}/api/voice/audio/${hash}.mp3?sig=${sig}&exp=${expMs}`;
}

function verifyAudioSig(hash, exp, sig) {
  const secret = atConfig().callbackSecret || '';
  const expected = crypto.createHmac('sha256', secret).update(`${hash}|${exp}`).digest('hex');
  if (!sig || sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
}

export async function entry(req, res) {
  if (!secretOk(req)) return res.status(403).end();
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).end();
  const { sessionId, callerNumber } = parsed.data;
  await VoiceSessionService.findOrCreate({ sessionId, callerNumberRaw: callerNumber });
  console.log(`[voice] call started session=${sessionId} caller=${maskPhone(callerNumber)}`);
  const secret = atConfig().callbackSecret;
  sendXml(res, `${sayXml(GREETING_SW)}${recordInvite({ secret })}`);
}

export async function turn(req, res) {
  if (!secretOk(req)) return res.status(403).end();
  const parsed = turnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).end();
  const { sessionId, recordingUrl } = parsed.data;

  const session = await VoiceSessionService.findOrCreate({ sessionId, callerNumberRaw: '' });
  if (session.endedReason) {
    return sendXml(res, hangupXml());
  }
  if (VoiceSessionService.shouldReplay(session, recordingUrl)) {
    res.set('Content-Type', 'application/xml; charset=utf-8');
    return res.status(200).send(session.lastResponseXml);
  }

  let outcome;
  try {
    outcome = await VoiceAssistantService.handleTurn({ session, recordingUrl });
  } catch (err) {
    console.warn(`[voice] turn failed session=${sessionId}: ${err.message}`);
    const fallback = sayXml('Samahani, nimechelewa, piga simu tena baadaye.');
    const xml = responseXml(`${fallback}${hangupXml()}`);
    await VoiceSessionService.recordReply(sessionId, { recordingUrl, responseXml: xml });
    await VoiceSessionService.end(sessionId, 'ERROR');
    res.set('Content-Type', 'application/xml; charset=utf-8');
    return res.status(200).send(xml);
  }

  await VoiceSessionService.appendTurn(sessionId, { role: 'assistant', text: outcome.replyText, lang: outcome.replyLang });

  const audioPlay = outcome.replyAudio
    ? playXml(signAudioUrl(outcome.replyAudio.hash))
    : sayXml(outcome.replyText);
  const next = outcome.continue
    ? recordInvite({ secret: atConfig().callbackSecret })
    : hangupXml();
  const xml = responseXml(`${audioPlay}${next}`);
  await VoiceSessionService.recordReply(sessionId, { recordingUrl, responseXml: xml });
  if (!outcome.continue && outcome.endedReason) {
    if (outcome.endedReason === 'CONSENT_DECLINED') await VoiceSessionService.clearForConsentDecline(sessionId);
    else await VoiceSessionService.end(sessionId, outcome.endedReason);
  }
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.status(200).send(xml);
}

export async function events(req, res) {
  if (!secretOk(req)) return res.status(403).end();
  const parsed = eventsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).end();
  const { sessionId, isActive, status } = parsed.data;
  if (String(isActive) === '0') {
    await VoiceSessionService.end(sessionId, status === 'Completed' ? 'USER_HANGUP' : (status || 'USER_HANGUP'));
  }
  res.status(200).end();
}

export async function audio(req, res) {
  const hash = String(req.params.hash || '');
  const exp = Number(req.query.exp || 0);
  const sig = String(req.query.sig || '');
  if (!/^[0-9a-f]{64}$/.test(hash)) return res.status(400).end();
  if (!exp || exp < Date.now()) return res.status(410).end();
  if (!verifyAudioSig(hash, exp, sig)) return res.status(403).end();
  const file = path.resolve(process.cwd(), env.voice.audio.dir, `${hash}.mp3`);
  try {
    const stat = await fs.stat(file);
    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Length', String(stat.size));
    res.set('Cache-Control', 'private, max-age=600');
    const stream = (await import('node:fs')).createReadStream(file);
    stream.pipe(res);
  } catch {
    res.status(404).end();
  }
}
```

- [ ] **Step 4: Wire the integration routes**

Edit `backend/src/routes/integrations.routes.js` — add three voice routes next to the existing AT entries:
```js
import { Router } from 'express';
import { integrationLimiter } from '../middleware/rateLimit.js';
import * as integrations from '../controllers/integrationController.js';
import * as sarufi from '../controllers/sarufiController.js';
import * as voice from '../controllers/voiceController.js';

const r = Router();
r.use(integrationLimiter);
r.post('/africastalking/ussd', integrations.ussd);
r.post('/africastalking/sms', integrations.smsInbound);
r.post('/africastalking/sms/delivery', integrations.smsDelivery);
r.post('/africastalking/voice', voice.entry);
r.post('/africastalking/voice/turn', voice.turn);
r.post('/africastalking/voice/events', voice.events);
r.get('/sarufi/webhook', sarufi.health);
r.post('/sarufi/webhook', sarufi.webhook);
export default r;
```

- [ ] **Step 5: Add the audio-serving route and mount it**

Create `backend/src/routes/voice.routes.js`:
```js
import { Router } from 'express';
import { integrationLimiter } from '../middleware/rateLimit.js';
import * as voice from '../controllers/voiceController.js';

const r = Router();
r.get('/audio/:hash.mp3', integrationLimiter, voice.audio);
export default r;
```

Edit `backend/src/app.js` — add a mount line right after the integrations mount:
```js
import voiceRoutes from './routes/voice.routes.js';
// … inside createApp(), after app.use('/api/integrations', integrationRoutes):
app.use('/api/voice', voiceRoutes);
```

- [ ] **Step 6: Extend AT public status to list voice callback URLs**

Edit `backend/src/providers/africastalking/config.js` — inside the `callbackUrls` object inside `atPublicStatus`, add three entries:
```js
voice: `${base}/api/integrations/africastalking/voice${q}`,
voiceTurn: `${base}/api/integrations/africastalking/voice/turn${q}`,
voiceEvents: `${base}/api/integrations/africastalking/voice/events${q}`,
```

- [ ] **Step 7: Run the integration test, verify it passes**

```bash
cd backend && npx jest tests/integration/voice.test.js
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/controllers/voiceController.js backend/src/routes/voice.routes.js \
        backend/src/routes/integrations.routes.js backend/src/app.js \
        backend/src/providers/africastalking/config.js \
        backend/tests/integration/voice.test.js
git commit -m "feat(voice): HTTP endpoints with HMAC-signed audio URLs"
```

---

## Task 10: Audio-cache retention sweep

**Files:**
- Create: `backend/src/jobs/voiceAudioCleanup.js`
- Modify: existing jobs bootstrap (locate via `grep -n 'cron.schedule' backend/src/jobs/*.js` or `backend/src/jobs/index.js` if present) to register the new job on API start
- Test: `backend/tests/unit/voiceAudioCleanup.test.js`

**Interfaces:**
- Consumes: `env.voice.audio.{dir, retentionDays}`, `node:fs/promises`.
- Produces: `async function sweepVoiceAudio({ now?, audioDir?, retentionDays? }) → { deleted: number, kept: number }` and `function registerVoiceAudioCleanupJob(cron)` (installer).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/voiceAudioCleanup.test.js`:
```js
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { sweepVoiceAudio } from '../../src/jobs/voiceAudioCleanup.js';

const tmp = path.join(process.cwd(), 'tests', '.tmp-voice-sweep');

beforeAll(async () => { await fs.mkdir(tmp, { recursive: true }); });
afterAll(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

const touch = async (name, ageMs) => {
  const p = path.join(tmp, name);
  await fs.writeFile(p, Buffer.from('x'));
  const t = (Date.now() - ageMs) / 1000;
  await fs.utimes(p, t, t);
  return p;
};

describe('sweepVoiceAudio', () => {
  it('deletes mp3 files older than retentionDays, keeps newer files and non-mp3', async () => {
    await touch('old.mp3', 10 * 24 * 3600_000);
    await touch('new.mp3', 1 * 3600_000);
    await touch('keep.txt', 30 * 24 * 3600_000);
    const r = await sweepVoiceAudio({ audioDir: tmp, retentionDays: 7 });
    expect(r.deleted).toBe(1);
    expect(r.kept).toBe(2);
    const left = (await fs.readdir(tmp)).sort();
    expect(left).toEqual(['keep.txt', 'new.mp3']);
  });
});
```

- [ ] **Step 2: Run and verify failing**

```bash
cd backend && npx jest tests/unit/voiceAudioCleanup.test.js
```
Expected: FAIL.

- [ ] **Step 3: Implement the sweep**

Create `backend/src/jobs/voiceAudioCleanup.js`:
```js
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

export async function sweepVoiceAudio({
  now = Date.now(),
  audioDir = path.resolve(process.cwd(), env.voice.audio.dir),
  retentionDays = env.voice.audio.retentionDays,
} = {}) {
  let deleted = 0;
  let kept = 0;
  let entries = [];
  try { entries = await fs.readdir(audioDir); } catch { return { deleted: 0, kept: 0 }; }
  const cutoff = now - retentionDays * 24 * 3600_000;
  for (const name of entries) {
    const p = path.join(audioDir, name);
    const stat = await fs.stat(p).catch(() => null);
    if (!stat || !stat.isFile()) continue;
    if (name.endsWith('.mp3') && stat.mtimeMs < cutoff) {
      await fs.unlink(p).catch(() => {});
      deleted += 1;
    } else {
      kept += 1;
    }
  }
  return { deleted, kept };
}

export function registerVoiceAudioCleanupJob(cron) {
  // Runs daily at 03:17 Africa/Nairobi (same tz the rest of the project uses in node-cron).
  cron.schedule('17 3 * * *', () => sweepVoiceAudio().catch((err) => console.warn('[voice] sweep failed', err.message)), { timezone: 'Africa/Nairobi' });
}
```

Register it in the existing jobs bootstrap (follow whatever pattern `grep -n registerJob backend/src/jobs/*.js` reveals; if there is a central `jobs/index.js`, add the registration call there; otherwise add it to `server.js` next to the existing `node-cron` setup).

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd backend && npx jest tests/unit/voiceAudioCleanup.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/jobs/voiceAudioCleanup.js backend/tests/unit/voiceAudioCleanup.test.js backend/src/jobs backend/src/server.js
git commit -m "feat(voice): nightly audio-cache retention sweep"
```

---

## Task 11: Operator documentation `docs/VOICE.md`

**Files:**
- Create: `docs/VOICE.md`

**Interfaces:** none in code; this is prose for the operator.

- [ ] **Step 1: Write the document**

Create `docs/VOICE.md` with these sections, filled from the spec and the implementation:
1. **How it works** (ASCII flow identical to spec §4; one-page).
2. **Environment variables table** — one row per variable from `.env.example` added in Task 1, with sandbox-off and live examples.
3. **Live number setup (because the AT Voice sandbox is not operational):**
   - Create AT account.
   - *Voice → Phone number settings → Request Number → Category: Test Number → Country: Tanzania.*
   - Pay the one-off fee for the number (verify current pricing on AT's dashboard).
   - Email `voice@africastalking.com` to speed up allocation if needed.
   - For the already-issued test number `+255699920003`, skip the request step and set its callbacks on the AT dashboard:
     - **Voice Callback URL** → `https://<PUBLIC_API_URL>/api/integrations/africastalking/voice?secret=<AT_CALLBACK_SECRET>`
     - **Event Callback URL** → `https://<PUBLIC_API_URL>/api/integrations/africastalking/voice/events?secret=<AT_CALLBACK_SECRET>`
4. **ngrok for development:**
   ```
   ngrok http 5000
   ```
   Copy the HTTPS URL into `PUBLIC_API_URL` in `backend/.env`. Restart `npm run dev`.
5. **Provider accounts:**
   - OpenAI (Whisper, LLM paraphrase) — key in `VOICE_OPENAI_API_KEY` or `LLM_API_KEY`.
   - Google Cloud TTS — enable Text-to-Speech API, create either an API key (`GOOGLE_TTS_API_KEY`) or a service-account JSON on disk (`GOOGLE_APPLICATION_CREDENTIALS=<abs path>`).
   - ElevenLabs (optional) — `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`.
6. **External costs (approximate, verify before enabling production):**
   - AT inbound voice minute: AT dashboard shows the live per-minute rate for Tanzania.
   - Whisper: $0.006 / audio minute.
   - Google TTS: 4 M chars/month free (standard), $4 / 1 M chars after.
   - LLM paraphrase: Haiku 4.5 or GPT-4o-mini at approximately $0.0005 / turn.
7. **Setting a voice PIN for a farmer (admin, until the UI exists):**
   ```
   # one-off from a Node REPL on the backend host
   const bcrypt = require('bcryptjs');
   const prisma = require('./src/config/prisma').default;
   await prisma.farmer.update({ where: { userId: '…' }, data: { voicePinHash: await bcrypt.hash('1234', 10), voicePinSetAt: new Date() } });
   ```
8. **Live-call checklist** (spec §12.2 copied here verbatim).
9. **What is tested locally vs what requires credentials and a live call** (verbatim from spec §12).
10. **Known limitations:** 2–5 s pauses per turn, no barge-in, 30 s max per utterance, AT voice sandbox is down (live number required), `<Say>` fallback is English-leaning (acknowledged degradation).
11. **Future upgrade: VAPI / vapi.ai over SIP** (one paragraph, verbatim from spec §13.10).

- [ ] **Step 2: Commit**

```bash
git add docs/VOICE.md
git commit -m "docs(voice): operator guide + live-call checklist"
```

---

## Task 12: Final integration — regression check, lint, update AT docs

**Files:**
- Modify: `docs/AFRICASTALKING.md` (one-line pointer to `docs/VOICE.md` under the index)
- Modify: `README.md` (one bullet under "What is built" naming the voice-call feature)

- [ ] **Step 1: Run the whole backend test suite**

```bash
cd backend && npm test
```
Expected: all tests pass, including the pre-existing unit + integration suites. If any pre-existing test fails, inspect it: do not "fix" it by changing it — determine whether the voice work regressed something and fix the regression.

- [ ] **Step 2: Run the linter**

```bash
cd backend && npm run lint
```
Expected: no new errors introduced by this feature. Fix any new errors reported in `backend/src/providers/voice/`, `backend/src/services/voice*`, `backend/src/controllers/voiceController.js`, `backend/src/routes/voice.routes.js`, `backend/src/jobs/voiceAudioCleanup.js`.

- [ ] **Step 3: Add the two cross-reference edits**

- In `docs/AFRICASTALKING.md`, under section 1 ("How it works"), add one line at the end of the ASCII block:
  > Voice calls go through `/api/integrations/africastalking/voice*` — see `docs/VOICE.md`.
- In `README.md`, inside the "What is built" bullet list, add one bullet after the "SMS & USSD" bullet:
  > **Voice:** inbound AT voice call opens a Kiswahili/English conversational seaweed assistant; grounded in a curated source-cited knowledge pack; private farm data gated by a voice PIN. See `docs/VOICE.md`.

- [ ] **Step 4: Commit the cross-references**

```bash
git add docs/AFRICASTALKING.md README.md
git commit -m "docs: cross-reference voice-call feature from AT guide and README"
```

- [ ] **Step 5: Final push + PR**

If the branch is a feature branch intended for merge: push and open a PR against the project's main development branch. Do NOT merge; the human partner reviews and merges.

```bash
git push -u origin HEAD
```

The PR body summarises the feature in three bullets, points at `docs/superpowers/specs/2026-10-03-voice-call-assistant-design.md` and `docs/VOICE.md`, and names the known limitations (no barge-in, pauses, AT voice sandbox is down).

---

## Appendix A: Live-call manual checklist (lift this into `docs/VOICE.md` in Task 11)

The following items are **not** exercised by the automated suite because they require a live AT voice number, cellular connectivity, and real STT/TTS credentials. Each is run manually against `+255699920003` once the dashboard callbacks and provider keys are set.

1. Dial → the greeting plays in Kiswahili within ~1 second of connect.
2. Say *"Mwani wangu umekuwa mweupe, nifanye nini?"* → short Kiswahili answer about ice-ice.
3. Follow-up *"Nifanye nini zaidi?"* → coherent follow-up that references turn 1.
4. Say *"Switch to English, how do I dry seaweed?"* → next turn answered in English.
5. Stay silent after beep → *"Samahani sijakusikia..."* plays, turn count does not advance.
6. Background-noise test (ambient sound only) → same silence handling.
7. Attempt to interrupt mid-answer by speaking — expected to fail (barge-in is a documented non-goal). Confirm the farmer-side UX is acceptable.
8. Say *"asante nimemaliza"* → polite goodbye + hangup.
9. Reconnect → previous turns are not shown (new session row).
10. Admin: `voice_sessions` row exists; `event_logs` has the status callback; masked caller number in server logs.
11. Dial, press `*` on the keypad during the greeting — the beep should start the recording immediately.
12. Three bad PIN attempts for a farm-specific question → `pinLocked=true`, subsequent farm-specific questions get the KB-only answer.

---

## Appendix B: Scope coverage against the spec

| Spec section | Implemented in task |
|---|---|
| §1 Intent and success criteria | 2, 9, 11 |
| §2 External facts (AT sandbox down, provider pricing) | 11 |
| §3 Where it fits (reused modules, additive files) | 1, 2, 3, 4, 6, 7, 8, 9 |
| §4 Call-flow state machine | 9 |
| §5 Turn routing (goodbye, consent, PIN, farm-specific) | 7, 8 |
| §6 Knowledge base (bilingual cards, retrieval, I-don't-know) | 5, 6 |
| §7 Prisma schema | 1 |
| §8 HTTP endpoints | 9 |
| §9 STT/TTS providers | 3, 4 |
| §10 Privacy, safety, abuse | 7, 8, 9 |
| §11 Error handling | 8, 9 |
| §12 Testing strategy | 2, 3, 4, 5, 6, 7, 8, 9, 10 + Appendix A |
| §13 Deployment and setup docs | 11 |
| §14 Explicit non-goals | observed throughout; no task adds non-goal functionality |
| §15 Open implementation questions | resolved in 1 (BM25 inline), 4 (Google TTS auth: both key and SA path supported), 11 (admin PIN seed instructions) |
| §16 Reviewer checklist | handed to human partner at plan handoff |

Every section with code impact has at least one task. The admin review UI for voice transcripts is explicitly deferred (spec §15 bullet "Admin review UI … out of scope"); it accrues in Prisma and is inspectable with `prisma studio`.
