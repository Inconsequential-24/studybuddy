import { createContext, useContext, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { GripHorizontal } from 'lucide-react';

export type DisplayTheme = 'bright' | 'dark' | 'enchanted' | 'soft-pink';
export interface DisplaySettings {
  theme: DisplayTheme;
  accessibilityMode: boolean;
  largeText: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
  dyslexiaFont: boolean;
  readingRuler: boolean;
}
const KEY = 'grounded-tutor:display';
const DEFAULTS: DisplaySettings = {
  theme: 'bright',
  accessibilityMode: false,
  largeText: false,
  highContrast: false,
  reduceMotion: false,
  dyslexiaFont: false,
  readingRuler: false,
};
const THEMES: DisplayTheme[] = ['bright', 'dark', 'enchanted', 'soft-pink'];

function load(): DisplaySettings {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULTS;
    const stored = value as Record<string, unknown>;
    return {
      theme: THEMES.includes(stored.theme as DisplayTheme) ? stored.theme as DisplayTheme : DEFAULTS.theme,
      accessibilityMode: typeof stored.accessibilityMode === 'boolean' ? stored.accessibilityMode : false,
      largeText: typeof stored.largeText === 'boolean' ? stored.largeText : false,
      highContrast: typeof stored.highContrast === 'boolean' ? stored.highContrast : false,
      reduceMotion: typeof stored.reduceMotion === 'boolean' ? stored.reduceMotion : false,
      dyslexiaFont: typeof stored.dyslexiaFont === 'boolean' ? stored.dyslexiaFont : false,
      readingRuler: typeof stored.readingRuler === 'boolean' ? stored.readingRuler : false,
    };
  } catch {
    return DEFAULTS;
  }
}

const Ctx = createContext<{
  settings: DisplaySettings;
  update: (p: Partial<DisplaySettings>) => void;
  applyAccessibilityMode: (enabled: boolean) => void;
}>({
  settings: DEFAULTS,
  update: () => {},
  applyAccessibilityMode: () => {},
});
export const useDisplaySettings = () => useContext(Ctx);

function ReadingRuler() {
  const [position, setPosition] = useState(() => Math.round(window.innerHeight / 2));
  const min = 36;
  const max = Math.max(min, window.innerHeight - min);
  const moveTo = (value: number) => setPosition(Math.max(min, Math.min(max, value)));
  useEffect(() => {
    const clampToViewport = () => setPosition((current) => Math.max(min, Math.min(Math.max(min, window.innerHeight - min), current)));
    window.addEventListener('resize', clampToViewport);
    return () => window.removeEventListener('resize', clampToViewport);
  }, []);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const increments: Record<string, number> = { ArrowUp: -16, ArrowDown: 16, PageUp: -80, PageDown: 80 };
    if (event.key in increments) {
      event.preventDefault();
      moveTo(position + increments[event.key]);
    } else if (event.key === 'Home') {
      event.preventDefault();
      moveTo(min);
    } else if (event.key === 'End') {
      event.preventDefault();
      moveTo(max);
    }
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) moveTo(event.clientY);
  };

  return (
    <div className="studybuddy-reading-ruler" data-testid="reading-ruler-overlay">
      <div className="studybuddy-reading-ruler-band" style={{ top: position - 18 }} aria-hidden="true" />
      <button
        type="button"
        role="slider"
        aria-label="Reading ruler position"
        aria-orientation="vertical"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={position}
        aria-valuetext="Use arrow keys or drag to move the reading ruler"
        className="studybuddy-reading-ruler-handle"
        style={{ top: position }}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        data-testid="slider-reading-ruler-position"
      >
        <GripHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}

export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DisplaySettings>(load);
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = settings.theme;
    r.classList.toggle('large-text', settings.largeText);
    r.classList.toggle('high-contrast', settings.highContrast);
    r.classList.toggle('reduce-motion', settings.reduceMotion);
    r.classList.toggle('dyslexia-font', settings.dyslexiaFont);
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  }, [settings]);
  const update = (p: Partial<DisplaySettings>) => setSettings((s) => ({
    ...s,
    ...p,
    ...(p.largeText !== undefined || p.highContrast !== undefined || p.reduceMotion !== undefined
      ? { accessibilityMode: false }
      : {}),
  }));
  const applyAccessibilityMode = (enabled: boolean) => setSettings((s) => ({
    ...s,
    accessibilityMode: enabled,
    ...(enabled
      ? { largeText: true, highContrast: true, reduceMotion: true }
      : { largeText: false, highContrast: false, reduceMotion: false }),
  }));
  return <Ctx.Provider value={{ settings, update, applyAccessibilityMode }}>{children}{settings.readingRuler && <ReadingRuler />}</Ctx.Provider>;
}
