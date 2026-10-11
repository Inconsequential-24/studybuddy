import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetProfileQueryKey, useUpdateProfile, type ProfileInput, type StudentProfile } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const empty: ProfileInput = { gradeLevel: '', goal: '', explanationStyle: 'step-by-step', pace: 'steady', sessionMinutes: 20, vocabularySupport: false, accessibilityNeeds: '', confidence: 'building', interests: '', learningLanguage: 'en-US', interestTerminology: false };
const languages = [['en-US', 'English'], ['hi-IN', 'Hindi'], ['bn-IN', 'Bengali'], ['es-ES', 'Spanish'], ['fr-FR', 'French'], ['de-DE', 'German'], ['pt-BR', 'Portuguese'], ['ja-JP', 'Japanese'], ['ar-XA', 'Arabic']] as const;

function Choice<T extends string>({ legend, name, value, options, onChange }: { legend: string; name: string; value: T; options: [T, string, string][]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-base font-bold">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map(([v, label, hint]) => (
          <label key={v} className={cn('flex cursor-pointer items-start gap-3 rounded-md border-2 bg-card p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-ring', value === v ? 'border-primary bg-accent/40' : 'border-border')}>
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="mt-1.5 h-4 w-4 accent-[hsl(var(--primary))]" />
            <span><span className="block font-bold">{label}</span><span className="text-sm text-muted-foreground">{hint}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ProfileForm({ initial, submitLabel, onSaved, showAccessibilityPrompt = false }: { initial?: StudentProfile; submitLabel: string; onSaved?: () => void; showAccessibilityPrompt?: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const save = useUpdateProfile();
  const [f, setF] = useState<ProfileInput>(initial ? {
    gradeLevel: initial.gradeLevel, goal: initial.goal, explanationStyle: initial.explanationStyle, pace: initial.pace, sessionMinutes: initial.sessionMinutes,
    vocabularySupport: initial.vocabularySupport, accessibilityNeeds: initial.accessibilityNeeds, confidence: initial.confidence, interests: initial.interests, learningLanguage: initial.learningLanguage ?? 'en-US', interestTerminology: initial.interestTerminology ?? false } : empty);
  const [err, setErr] = useState('');
  const set = <K extends keyof ProfileInput>(k: K, v: ProfileInput[K]) => setF((s) => ({ ...s, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.gradeLevel.trim() || !f.goal.trim()) { setErr('Please fill in your grade or level and your goal.'); return; }
    if (f.sessionMinutes < 5 || f.sessionMinutes > 90) { setErr('Session length must be between 5 and 90 minutes.'); return; }
    setErr('');
    save.mutate({ data: { ...f, sessionMinutes: Number(f.sessionMinutes) } }, {
      onSuccess: (p) => { qc.setQueryData(getGetProfileQueryKey(), p); toast({ title: 'Preferences saved' }); onSaved?.(); },
      onError: (er) => setErr(er instanceof Error ? er.message : 'Could not save. Please try again.'),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-7" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5"><label htmlFor="grade" className="font-bold">Grade or level</label>
          <Input id="grade" value={f.gradeLevel} onChange={(e) => set('gradeLevel', e.target.value)} placeholder="e.g. Year 10, first-year nursing" required aria-required /></div>
        <div className="space-y-1.5"><label htmlFor="goal" className="font-bold">What are you studying for?</label>
          <Input id="goal" value={f.goal} onChange={(e) => set('goal', e.target.value)} placeholder="e.g. Pass the March biology exam" required aria-required /></div>
      </div>
      <Choice legend="How should explanations be shaped?" name="style" value={f.explanationStyle} onChange={(v) => set('explanationStyle', v)} options={[
        ['step-by-step', 'Step by step', 'Small ordered moves'], ['examples', 'Examples first', 'Worked cases, then the rule'],
        ['visual-first', 'Visual first', 'Point me to figures and tables'], ['short-bullets', 'Short bullets', 'Brief and scannable']]} />
      <Choice legend="Pace" name="pace" value={f.pace} onChange={(v) => set('pace', v)} options={[
        ['gentle', 'Gentle', 'More repetition'], ['steady', 'Steady', 'Balanced'], ['fast', 'Fast', 'Move quickly']]} />
      <Choice legend="Where is your confidence right now?" name="conf" value={f.confidence} onChange={(v) => set('confidence', v)} options={[
        ['starting-out', 'Starting out', 'This is new to me'], ['building', 'Building', 'I know some of it'], ['confident', 'Confident', 'I mostly need review']]} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5"><label htmlFor="learning-language" className="font-bold">Learning language</label>
          <select id="learning-language" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={f.learningLanguage} onChange={(e) => set('learningLanguage', e.target.value as ProfileInput['learningLanguage'])}>
            {languages.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
          <p className="text-sm text-muted-foreground">Generated explanations and practice use this language. Source quotations stay unchanged.</p>
        </div>
        <div className="space-y-1.5"><label htmlFor="mins" className="font-bold">Typical session (minutes)</label>
          <Input id="mins" type="number" min={5} max={90} value={f.sessionMinutes} onChange={(e) => set('sessionMinutes', Number(e.target.value))} aria-describedby="mins-h" />
          <p id="mins-h" className="text-sm text-muted-foreground">Between 5 and 90. Lessons are kept short.</p></div>
        <label className="flex cursor-pointer items-start gap-3 self-end rounded-md border bg-card p-3">
          <input type="checkbox" checked={f.vocabularySupport} onChange={(e) => set('vocabularySupport', e.target.checked)} className="mt-1.5 h-4 w-4 accent-[hsl(var(--primary))]" />
          <span><span className="block font-bold">Vocabulary support</span><span className="text-sm text-muted-foreground">Define hard terms as they appear</span></span>
        </label>
      </div>
      <div className="space-y-1.5"><label htmlFor="interests" className="font-bold">Interests <span className="font-normal text-muted-foreground">(used for examples)</span></label>
        <Input id="interests" value={f.interests} onChange={(e) => set('interests', e.target.value)} placeholder="e.g. football, cooking, music" />
        <label className="flex cursor-pointer items-start gap-3 rounded-md border bg-card p-3">
          <input type="checkbox" checked={f.interestTerminology} onChange={(e) => set('interestTerminology', e.target.checked)} className="mt-1.5 h-4 w-4 accent-[hsl(var(--primary))]" />
          <span><span className="block font-bold">Use interest-based terminology</span><span className="text-sm text-muted-foreground">Interests shape examples only, never source facts.</span></span>
        </label>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="acc" className="font-bold">{showAccessibilityPrompt ? 'What learning support would help you?' : 'Learning access needs'} <span className="font-normal text-muted-foreground">(optional)</span></label>
        {showAccessibilityPrompt && <p className="text-sm text-muted-foreground">Share any study support you would find useful. No diagnosis is needed. You can review or change this any time.</p>}
        <Textarea id="acc" rows={3} value={f.accessibilityNeeds} onChange={(e) => set('accessibilityNeeds', e.target.value)} placeholder="e.g. shorter paragraphs, one task at a time, or no additional support" />
      </div>
      {err && <p role="alert" className="font-bold text-destructive">{err}</p>}
      <Button type="submit" size="lg" disabled={save.isPending}>{save.isPending ? 'Saving' : submitLabel}</Button>
    </form>
  );
}
