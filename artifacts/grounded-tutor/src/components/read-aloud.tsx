import { useEffect, useRef, useState } from 'react';
import type { SpeechInput } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';

const languageNames: Record<string, string> = {
  'en-US': 'English', 'hi-IN': 'Hindi', 'bn-IN': 'Bengali', 'es-ES': 'Spanish',
  'fr-FR': 'French', 'de-DE': 'German', 'pt-BR': 'Portuguese',
  'ja-JP': 'Japanese', 'ar-XA': 'Arabic',
};

const preferencesKey = 'studybuddy:read-aloud-preferences';
const minRate = 0.7;
const maxRate = 1.4;

type ReadAloudPreferences = {
  voiceByLanguage: Record<string, string>;
  rate: number;
};

function loadPreferences(): ReadAloudPreferences {
  const defaults: ReadAloudPreferences = { voiceByLanguage: {}, rate: 1 };
  if (typeof window === 'undefined') return defaults;
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(preferencesKey) ?? 'null');
    if (!stored || typeof stored !== 'object') return defaults;
    const value = stored as Partial<ReadAloudPreferences>;
    const voiceByLanguage = value.voiceByLanguage && typeof value.voiceByLanguage === 'object'
      ? Object.fromEntries(Object.entries(value.voiceByLanguage).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      : {};
    const rate = typeof value.rate === 'number' && Number.isFinite(value.rate)
      ? Math.min(maxRate, Math.max(minRate, value.rate))
      : defaults.rate;
    return { voiceByLanguage, rate };
  } catch {
    return defaults;
  }
}

function voiceId(voice: SpeechSynthesisVoice) {
  return voice.voiceURI || `${voice.name}:${voice.lang}`;
}

function voiceMatchesLanguage(voice: SpeechSynthesisVoice, language: string) {
  const voiceLanguage = voice.lang.toLowerCase().replaceAll('_', '-');
  const requestedLanguage = language.toLowerCase().replaceAll('_', '-');
  return voiceLanguage === requestedLanguage || voiceLanguage.startsWith(`${requestedLanguage.split('-')[0]}-`);
}

type SpeechSegment = { text: string; start: number; end: number };

function splitText(text: string): SpeechSegment[] {
  const ranges: Array<{ start: number; end: number }> = [];
  const boundaries = /[.!?。！？]+(?:["'’”)\]]+)?(?=\s|$)|\n+/gu;
  let start = 0;

  for (const boundary of text.matchAll(boundaries)) {
    const end = (boundary.index ?? 0) + boundary[0].length;
    const segmentStart = start + (text.slice(start, end).match(/^\s*/u)?.[0].length ?? 0);
    const segmentEnd = end - (text.slice(start, end).match(/\s*$/u)?.[0].length ?? 0);
    if (segmentEnd > segmentStart) ranges.push({ start: segmentStart, end: segmentEnd });
    start = end;
  }

  const finalStart = start + (text.slice(start).match(/^\s*/u)?.[0].length ?? 0);
  const finalEnd = text.length - (text.match(/\s*$/u)?.[0].length ?? 0);
  if (finalEnd > finalStart) ranges.push({ start: finalStart, end: finalEnd });

  const segments: SpeechSegment[] = [];
  for (const range of ranges) {
    let chunkStart = range.start;
    while (chunkStart < range.end) {
      let chunkEnd = Math.min(chunkStart + 4200, range.end);
      if (chunkEnd < range.end) {
        const lastSpace = text.lastIndexOf(' ', chunkEnd);
        const lastNewline = text.lastIndexOf('\n', chunkEnd);
        const breakAt = Math.max(lastSpace, lastNewline);
        if (breakAt > chunkStart) chunkEnd = breakAt;
      }
      // Avoid splitting a UTF-16 surrogate pair at the hard character limit.
      if (chunkEnd < range.end && /[\uD800-\uDBFF]/u.test(text[chunkEnd - 1])) chunkEnd--;
      segments.push({
        text: text.slice(chunkStart, chunkEnd).trim(),
        start: chunkStart,
        end: chunkEnd,
      });
      chunkStart = chunkEnd;
      while (chunkStart < range.end && /\s/u.test(text[chunkStart])) chunkStart++;
    }
  }
  return segments.filter((segment) => segment.text.length > 0);
}

export function ReadAloud({ text, language }: { text: string; language: SpeechInput['language'] }) {
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [preferences, setPreferences] = useState<ReadAloudPreferences>(loadPreferences);
  const [activeRange, setActiveRange] = useState<{ start: number; end: number } | null>(null);
  const resolveChunk = useRef<(() => void) | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const speech = window.speechSynthesis;
    const updateVoices = () => setVoices(speech.getVoices());
    updateVoices();
    speech.addEventListener('voiceschanged', updateVoices);
    return () => speech.removeEventListener('voiceschanged', updateVoices);
  }, []);

  useEffect(() => () => {
    stopped.current = true;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    resolveChunk.current?.();
    resolveChunk.current = null;
  }, [text, language]);

  const matchingVoices = voices.filter((voice) => voiceMatchesLanguage(voice, language));
  const savedVoiceId = preferences.voiceByLanguage[language];
  const selectedVoice = matchingVoices.find((voice) => voiceId(voice) === savedVoiceId)
    ?? matchingVoices.find((voice) => voice.default)
    ?? matchingVoices[0];
  const selectedVoiceId = selectedVoice ? voiceId(selectedVoice) : savedVoiceId;

  const savePreferences = (next: ReadAloudPreferences, savedMessage: string) => {
    setPreferences(next);
    try {
      window.localStorage.setItem(preferencesKey, JSON.stringify(next));
      setStatus(savedMessage);
    } catch {
      setStatus('Your choice applies for this session, but could not be saved on this device.');
    }
  };

  const chooseVoice = (id: string) => {
    const voiceByLanguage = { ...preferences.voiceByLanguage };
    if (id) voiceByLanguage[language] = id;
    else delete voiceByLanguage[language];
    const next = { ...preferences, voiceByLanguage };
    savePreferences(next, id ? 'Voice preference saved on this device.' : 'Using your browser’s default voice.');
  };

  const chooseRate = (rate: number) => {
    const roundedRate = Math.round(rate * 10) / 10;
    savePreferences({ ...preferences, rate: roundedRate }, `Speaking speed set to ${roundedRate.toFixed(1)}×.`);
  };

  const stop = () => {
    stopped.current = true;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    resolveChunk.current?.();
    resolveChunk.current = null;
    setBusy(false);
    setPaused(false);
    setActiveRange(null);
    setStatus('Playback stopped.');
  };

  const play = async () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      setStatus('Read-aloud is unavailable because this browser does not support built-in speech. Try another browser or device.');
      return;
    }
    const speech = window.speechSynthesis;

    if (paused) {
      speech.resume();
      setPaused(false);
      setStatus(`Speaking in ${languageNames[language] ?? language}.`);
      return;
    }

    stopped.current = false;
    setBusy(true);
    setStatus(`Preparing a ${languageNames[language] ?? language} browser voice…`);
    try {
      const parts = splitText(text);
      for (let i = 0; i < parts.length && !stopped.current; i++) {
        let voices = speech.getVoices();
        if (!voices.length) {
          setStatus(`Loading ${languageNames[language] ?? language} browser voices…`);
          await new Promise<void>((resolve) => {
            let timeout = 0;
            const onVoicesChanged = () => {
              window.clearTimeout(timeout);
              speech.removeEventListener('voiceschanged', onVoicesChanged);
              resolve();
            };
            speech.addEventListener('voiceschanged', onVoicesChanged);
            timeout = window.setTimeout(() => {
              speech.removeEventListener('voiceschanged', onVoicesChanged);
              resolve();
            }, 1200);
          });
          voices = speech.getVoices();
        }
        if (stopped.current) break;

        const normalizedLanguage = language.toLowerCase();
        const voice = voices.find((candidate) => voiceId(candidate) === selectedVoiceId)
          ?? voices.find((candidate) => candidate.lang.toLowerCase() === normalizedLanguage)
          ?? voices.find((candidate) => candidate.lang.toLowerCase().startsWith(normalizedLanguage.split('-')[0]));
        const utterance = new SpeechSynthesisUtterance(parts[i].text);
        utterance.lang = language;
        if (voice) utterance.voice = voice;
        setActiveRange({ start: parts[i].start, end: parts[i].end });
        setStatus(`Speaking in ${languageNames[language] ?? language} with a browser voice…`);
        await new Promise<void>((resolve, reject) => {
          const finish = () => {
            utterance.onend = null;
            utterance.onerror = null;
            resolveChunk.current = null;
            resolve();
          };
          resolveChunk.current = finish;
          utterance.onend = finish;
          utterance.onerror = () => {
            if (stopped.current) finish();
            else reject(new Error('The browser could not play a speech voice. Check your device voices and try again.'));
          };
          speech.speak(utterance);
        });
      }
      if (!stopped.current) setStatus('Playback finished.');
    } catch (error) {
      if (!stopped.current) setStatus(error instanceof Error ? error.message : 'Read-aloud is unavailable. Please try again.');
    } finally {
      setBusy(false);
      setPaused(false);
      resolveChunk.current = null;
    }
  };

  return (
    <div className="mb-5">
      <div className="rounded-md border bg-muted/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 font-semibold">Read aloud · {languageNames[language] ?? language}</span>
          {busy && !paused ? (
            <Button type="button" size="sm" variant="outline" onClick={() => { window.speechSynthesis.pause(); setPaused(true); setStatus('Playback paused.'); }}>Pause</Button>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => void play()} disabled={!text.trim()}>Play</Button>
          )}
          <Button type="button" size="sm" variant="outline" onClick={stop} disabled={!busy}>Stop</Button>
        </div>
        <p aria-live="polite" role="status" className="mt-2 text-sm text-muted-foreground">{status || 'Read-aloud uses voices available in your browser or device; voice choices may vary.'}</p>
      </div>
      <div className="mt-4 whitespace-pre-wrap text-lg leading-relaxed" aria-label="Lesson text">
        {activeRange ? (
          <>
            {text.slice(0, activeRange.start)}
            <mark aria-current="true" className="rounded-sm bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-300/30">
              {text.slice(activeRange.start, activeRange.end)}
            </mark>
            {text.slice(activeRange.end)}
          </>
        ) : text}
      </div>
    </div>
  );
}
