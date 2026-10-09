import { useGetProfile } from '@workspace/api-client-react';
import { ProfileForm } from '@/components/profile-form';
import { AppShell } from '@/components/shell';
import { ErrorBlock, LoadingBlock, PageHeader, Panel } from '@/components/bits';
import { useDisplaySettings } from '@/lib/a11y';

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-md border bg-background p-3">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1.5 h-5 w-5 accent-[hsl(var(--primary))]" />
      <span><span className="block font-bold">{label}</span><span className="text-muted-foreground">{hint}</span></span>
    </label>
  );
}

export default function Settings() {
  const q = useGetProfile();
  const { settings, update } = useDisplaySettings();
  return (
    <AppShell>
      <PageHeader eyebrow="Settings" title="Your preferences" />
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <Panel title="Learning preferences">
          {q.isLoading ? <LoadingBlock rows={4} /> : q.error ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> : <ProfileForm initial={q.data} submitLabel="Save preferences" />}
        </Panel>
        <Panel title="Display" className="h-fit">
          <p className="mb-4 text-muted-foreground">Saved on this device only and applied immediately.</p>
          <div className="space-y-3">
            <Toggle id="lt" label="Larger text" hint="Increase text size by a quarter." checked={settings.largeText} onChange={(v) => update({ largeText: v })} />
            <Toggle id="hc" label="High contrast" hint="Stronger text and border contrast." checked={settings.highContrast} onChange={(v) => update({ highContrast: v })} />
            <Toggle id="rm" label="Reduce motion" hint="Turn off animation and transitions." checked={settings.reduceMotion} onChange={(v) => update({ reduceMotion: v })} />
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
