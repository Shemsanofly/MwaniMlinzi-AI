import { jest } from '@jest/globals';

describe('env.voice', () => {
  const ORIG = { ...process.env };
  afterEach(() => { process.env = { ...ORIG }; jest.resetModules(); });

  it('defaults stt to openai, tts to google, audio retention 7d, lang hint sw', async () => {
    process.env.JWT_SECRET = 'x'.repeat(48);
    delete process.env.VOICE_STT_PROVIDER;
    delete process.env.VOICE_STT_LANG_HINT;
    delete process.env.VOICE_STT_MAX_SECONDS;
    delete process.env.VOICE_TTS_PROVIDER;
    delete process.env.VOICE_TTS_VOICE_SW;
    delete process.env.VOICE_TTS_VOICE_EN;
    delete process.env.VOICE_AUDIO_RETENTION_DAYS;
    jest.resetModules();
    const { env } = await import('../../src/server/config/env.js');
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
    const { env } = await import('../../src/server/config/env.js');
    expect(env.voice.stt.provider).toBe('google');
    expect(env.voice.tts.provider).toBe('elevenlabs');
    expect(env.voice.audio.retentionDays).toBe(14);
  });
});
