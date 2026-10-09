import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface DisplaySettings { largeText: boolean; highContrast: boolean; reduceMotion: boolean }
const KEY = 'grounded-tutor:display';
const DEFAULTS: DisplaySettings = { largeText: false, highContrast: false, reduceMotion: false };

function load(): DisplaySettings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return DEFAULTS; }
}

const Ctx = createContext<{ settings: DisplaySettings; update: (p: Partial<DisplaySettings>) => void }>({ settings: DEFAULTS, update: () => {} });
export const useDisplaySettings = () => useContext(Ctx);

export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DisplaySettings>(load);
  useEffect(() => {
    const r = document.documentElement;
    r.classList.toggle('large-text', settings.largeText);
    r.classList.toggle('high-contrast', settings.highContrast);
    r.classList.toggle('reduce-motion', settings.reduceMotion);
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  }, [settings]);
  const update = (p: Partial<DisplaySettings>) => setSettings((s) => ({ ...s, ...p }));
  return <Ctx.Provider value={{ settings, update }}>{children}</Ctx.Provider>;
}
