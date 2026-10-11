import { useGetProfile } from '@workspace/api-client-react';
import { ProfileForm } from '@/components/profile-form';
import { AppShell } from '@/components/shell';
import { ErrorBlock, LoadingBlock, PageHeader, Panel } from '@/components/bits';
import { Button } from '@/components/ui/button';
import { useDisplaySettings, type DisplayTheme } from '@/lib/a11y';
import { ExternalLink, Github, Heart, Linkedin, Mail } from 'lucide-react';

const themes: { value: DisplayTheme; label: string; description: string; swatches: [string, string, string] }[] = [
  { value: 'bright', label: 'Bright', description: 'Warm paper and teal', swatches: ['#F8F6F1', '#144E57', '#EEEAE2'] },
  { value: 'dark', label: 'Dark', description: 'Deep slate and soft teal', swatches: ['#141820', '#88D9C8', '#292E39'] },
  { value: 'enchanted', label: 'Enchanted', description: 'Ink, evergreen, and muted gold', swatches: ['#171426', '#D9B65C', '#123126'] },
  { value: 'soft-pink', label: 'Soft Pink', description: 'Blush and plum', swatches: ['#FCF3F6', '#96305E', '#F4DCE5'] },
];

function ThemePicker({ value, onChange }: { value: DisplayTheme; onChange: (theme: DisplayTheme) => void }) {
  const selectedLabel = themes.find((theme) => theme.value === value)?.label ?? 'Bright';
  return (
    <fieldset className="mb-6">
      <legend className="sr-only">Choose a theme</legend>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold" aria-hidden="true">Choose a theme</p>
        <span role="status" aria-live="polite" className="text-sm text-muted-foreground">{selectedLabel} theme selected</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {themes.map((theme) => (
          <label key={theme.value} className="min-w-0 cursor-pointer rounded-lg">
            <input
              className="theme-choice peer sr-only"
              type="radio"
              name="display-theme"
              value={theme.value}
              checked={value === theme.value}
              onChange={() => onChange(theme.value)}
              data-testid={`radio-theme-${theme.value}`}
            />
            <span className="theme-preview block h-full min-h-28 rounded-lg border-2 border-border bg-card p-3 text-card-foreground hover:border-primary">
              <span className="mb-2 flex gap-1.5" aria-hidden="true">
                {theme.swatches.map((color) => (
                  <span key={color} className="h-5 w-5 rounded-full border border-black/15" style={{ backgroundColor: color }} />
                ))}
              </span>
              <span className="block font-bold">{theme.label}</span>
              <span className="block text-sm text-muted-foreground">{theme.description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-md border bg-background p-3">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1.5 h-5 w-5 accent-[hsl(var(--primary))]" data-testid={`toggle-${id}`} />
      <span><span className="block font-bold">{label}</span><span className="text-muted-foreground">{hint}</span></span>
    </label>
  );
}

export default function Settings() {
  const q = useGetProfile();
  const { settings, update, applyAccessibilityMode } = useDisplaySettings();
  return (
    <AppShell>
      <PageHeader eyebrow="Settings" title="Your preferences" />
      <div className="grid gap-8 lg:grid-cols-[1fr_25rem]">
        <Panel title="Learning preferences">
          {q.isLoading ? <LoadingBlock rows={4} /> : q.error ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> : <ProfileForm initial={q.data} submitLabel="Save preferences" showAccessibilityPrompt={settings.accessibilityMode} />}
        </Panel>
        <Panel title="Display" className="h-fit">
          <p className="mb-4 text-muted-foreground">Saved on this device only and applied immediately.</p>
          <ThemePicker value={settings.theme} onChange={(theme) => update({ theme })} />
          <div className="mb-4 rounded-lg border bg-muted/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold">Accessibility mode</p>
                <p className="text-sm text-muted-foreground">Apply high contrast, larger text, and reduced motion together.</p>
              </div>
              <Button
                type="button"
                variant={settings.accessibilityMode ? 'default' : 'outline'}
                aria-pressed={settings.accessibilityMode}
                aria-label={`Accessibility mode ${settings.accessibilityMode ? 'on' : 'off'}`}
                onClick={() => applyAccessibilityMode(!settings.accessibilityMode)}
                data-testid="button-accessibility-mode"
              >
                <Heart aria-hidden="true" className="fill-current" />
                {settings.accessibilityMode ? 'On' : 'Apply accessibility mode'}
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            <Toggle id="lt" label="Larger text" hint="Increase text size by a quarter." checked={settings.largeText} onChange={(v) => update({ largeText: v })} />
            <Toggle id="hc" label="High contrast" hint="Stronger text and border contrast." checked={settings.highContrast} onChange={(v) => update({ highContrast: v })} />
            <Toggle id="rm" label="Reduce motion" hint="Turn off animation and transitions." checked={settings.reduceMotion} onChange={(v) => update({ reduceMotion: v })} />
            <Toggle id="dyslexia-font" label="Dyslexia-friendly font" hint="Use OpenDyslexic only when you turn this on. Font preferences vary." checked={settings.dyslexiaFont} onChange={(v) => update({ dyslexiaFont: v })} />
            <Toggle id="reading-ruler" label="Reading ruler" hint="Show an optional movable guide. Focus it and use arrow keys, or drag its handle." checked={settings.readingRuler} onChange={(v) => update({ readingRuler: v })} />
          </div>
        </Panel>
      </div>
      <Panel title="Feedback & contact" className="mt-8">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="font-bold">Share feedback</h2>
            <Button asChild variant="outline" className="mt-4" data-testid="link-feedback-email">
              <a href="mailto:juhidwivedi73@gmail.com">
                <Mail aria-hidden="true" />
                Contact by email
              </a>
            </Button>
          </div>
          <div>
            <h2 className="font-bold">Community & contact</h2>
            <ul className="mt-2 space-y-2">
              <li>
                <a
                  href="https://github.com/Inconsequential-24/studybuddy"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="StudyBuddy source code on GitHub (opens in a new tab)"
                  data-testid="link-community-github"
                  className="inline-flex min-h-10 items-center gap-2 rounded-sm text-primary underline underline-offset-4 hover:text-foreground"
                >
                  <Github aria-hidden="true" className="h-4 w-4" />
                  GitHub — view the source and contribute
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                </a>
              </li>
              <li>
                <a
                  href="https://www.linkedin.com/in/juhi-dwivedi/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="juhi-dwivedi on LinkedIn (opens in a new tab)"
                  data-testid="link-contact-linkedin"
                  className="inline-flex min-h-10 items-center gap-2 rounded-sm text-primary underline underline-offset-4 hover:text-foreground"
                >
                  <Linkedin aria-hidden="true" className="h-4 w-4" />
                  juhi-dwivedi
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                </a>
              </li>
              <li>
                <a
                  href="https://x.com/JuhiDwivedi24"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="JuhiDwivedi24 on X (opens in a new tab)"
                  data-testid="link-contact-x"
                  className="inline-flex min-h-10 items-center gap-2 rounded-sm text-primary underline underline-offset-4 hover:text-foreground"
                >
                  <span aria-hidden="true" className="w-4 text-center font-bold">𝕏</span>
                  JuhiDwivedi24
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                </a>
              </li>
              <li>
                <a
                  href="mailto:dwivedijuhi01@gmail.com"
                  aria-label="Email the creator at dwivedijuhi01@gmail.com"
                  data-testid="link-contact-email"
                  className="inline-flex min-h-10 items-center gap-2 rounded-sm text-primary underline underline-offset-4 hover:text-foreground"
                >
                  <Mail aria-hidden="true" className="h-4 w-4" />
                  Contact by email
                </a>
              </li>
            </ul>
          </div>
        </div>
      </Panel>
    </AppShell>
  );
}
