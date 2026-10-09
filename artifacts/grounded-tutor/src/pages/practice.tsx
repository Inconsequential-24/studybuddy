import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getGetClassroomDashboardQueryKey, getGetClassroomPlanQueryKey, useGetPracticePack, useSubmitPracticeAttempt, type PracticeAttemptInputActivity, type PracticePackQuestionsItem } from '@workspace/api-client-react';
import { AppShell } from '@/components/shell';
import { Citations, SourceViewer, EmptyBlock, ErrorBlock, LoadingBlock, MasteryBar, PageButton, PageHeader, Panel } from '@/components/bits';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const names: Record<string, [string, string]> = {
  'free-recall': ['Free recall', 'Write what you remember, no prompts.'],
  'quick-quiz': ['Quick quiz', 'Short questions, fast feedback.'],
  'figure-labels': ['Figure labels', 'Name the parts of a figure from your PDF.'],
  'apply-it': ['Apply it', 'Use an idea on a new situation.'],
};
const typesFor: Record<string, string[]> = { 'free-recall': ['free-recall'], 'quick-quiz': ['multiple-choice', 'short-answer'], 'figure-labels': ['figure-labels'], 'apply-it': ['apply-it'] };

function Runner({ id, activity, questions, onExit }: { id: string; activity: PracticeAttemptInputActivity; questions: PracticePackQuestionsItem[]; onExit: () => void }) {
  const qc = useQueryClient();
  const submit = useSubmitPracticeAttempt();
  const [i, setI] = useState(0);
  const [resp, setResp] = useState('');
  const started = useRef(Date.now());
  const [hints, setHints] = useState(0);
  const [viewer, setViewer] = useState(false);
  const q = questions[i];
  const r = submit.data;
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    submit.mutate({ classroomId: id, data: { questionId: q.id, conceptId: q.conceptId, activity, response: resp.trim(), elapsedSeconds: Math.round((Date.now() - started.current) / 1000), hintsUsed: hints, assisted: hints > 0 } }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetClassroomDashboardQueryKey(id) }); qc.invalidateQueries({ queryKey: getGetClassroomPlanQueryKey(id) }); },
    });
  };
  if (!q) return (
    <Panel title="Set complete"><p className="mb-4 text-lg">You finished all {questions.length} questions in this set.</p>
      <div className="flex gap-2"><Button onClick={onExit}>Pick another activity</Button><Button asChild variant="outline"><Link href={'/classrooms/' + id + '/dashboard'}>See progress</Link></Button></div></Panel>
  );
  return (
    <Panel>
      <p className="mb-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">{names[activity][0]} &middot; Question {i + 1} of {questions.length}</p>
      <form onSubmit={send} className="space-y-4">
        <fieldset disabled={!!r || submit.isPending} className="space-y-3">
          <legend className="text-xl font-semibold leading-snug">{q.prompt}</legend>
          {q.figurePage != null && <PageButton classroomId={id} page={q.figurePage} label={'Open figure on page ' + q.figurePage} />}
          {q.options.length > 0 ? q.options.map((o) => (
            <label key={o} className={cn('flex cursor-pointer items-start gap-3 rounded-md border-2 bg-background p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-ring', resp === o ? 'border-primary bg-accent/40' : 'border-border')}>
              <input type="radio" name="opt" className="mt-1.5 h-4 w-4 accent-[hsl(var(--primary))]" checked={resp === o} onChange={() => setResp(o)} /><span>{o}</span>
            </label>
          )) : (<><label htmlFor="ans" className="sr-only">Your answer</label><Textarea id="ans" rows={5} value={resp} onChange={(e) => setResp(e.target.value)} placeholder="Type your answer" /></>)}
        </fieldset>
        {!r && q.citations.length > 0 && (
          <div className="rounded-md border bg-muted p-3">
            <p className="font-bold">Hints used: {hints} of 2 <span className="font-normal text-muted-foreground">(using hints marks this answer as assisted)</span></p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={hints >= 2} onClick={() => { setHints((h) => Math.min(2, h + 1)); if (hints === 0) setViewer(true); }}>{hints === 0 ? 'Hint 1: show me where to look' : hints === 1 ? 'Hint 2: show the exact quote' : 'No more hints'}</Button>
              {hints >= 1 && <Button type="button" variant="ghost" size="sm" onClick={() => setViewer(true)}>Reopen page {q.citations[0].page}</Button>}
            </div>
            <div aria-live="polite">
              {hints >= 1 && <p className="mt-2">Look on page {q.citations[0].page}{q.citations[0].label ? ' (' + q.citations[0].label + ')' : ''}.</p>}
              {hints >= 2 && <blockquote className="mt-2 border-l-4 border-accent-foreground/40 pl-3 italic">{q.citations[0].quote}</blockquote>}
            </div>
            {viewer && <SourceViewer classroomId={id} open={viewer} onOpenChange={setViewer} page={q.citations[0].page} />}
          </div>
        )}
        {!r && <Button type="submit" disabled={submit.isPending || !resp.trim()}>{submit.isPending ? 'Grading' : 'Submit answer'}</Button>}
      </form>
      <div aria-live="polite" className="mt-5">
        {submit.isError && <ErrorBlock title="Could not grade that" error={submit.error} />}
        {r && (
          <div className="space-y-4">
            <MasteryBar value={r.score} label="Score" />
            <p className="text-lg">{r.feedback}</p>
            {[['What you got right', r.correctPoints], ['Missing', r.missingPoints], ['Not quite right', r.incorrectPoints]].map(([t, l]) => (l as string[]).length > 0 && (
              <div key={t as string}><h3 className="font-bold">{t as string}</h3><ul className="list-disc pl-5">{(l as string[]).map((x, k) => <li key={k}>{x}</li>)}</ul></div>))}
            <Citations classroomId={id} citations={r.citations} />
            <Button onClick={() => { submit.reset(); setResp(''); setI(i + 1); setHints(0); setViewer(false); started.current = Date.now(); }}>{i + 1 < questions.length ? 'Next question' : 'Finish set'}</Button>
          </div>
        )}
      </div>
    </Panel>
  );
}

export default function Practice() {
  const { id = '' } = useParams<{ id: string }>();
  const pack = useGetPracticePack(id);
  const [act, setAct] = useState<PracticeAttemptInputActivity | null>(null);
  const qs = useMemo(() => (act ? (pack.data?.questions ?? []).filter((q) => typesFor[act].includes(q.type)) : []), [act, pack.data]);
  return (
    <AppShell classroomId={id}>
      <PageHeader eyebrow="Practice Arena" title="Pick an activity">Short sets, graded against your own pages.</PageHeader>
      {pack.isLoading ? <LoadingBlock rows={3} label="Building your practice set" /> : pack.error ? <ErrorBlock error={pack.error} onRetry={() => pack.refetch()} /> :
        !pack.data?.questions.length ? <EmptyBlock title="Nothing to practise yet" action={<Button asChild variant="outline"><Link href={'/classrooms/' + id}>Check processing status</Link></Button>}>Practice questions are created after your PDFs are read.</EmptyBlock> :
        act ? <div><Button variant="ghost" className="mb-3" onClick={() => setAct(null)}>Back to activities</Button><Runner key={act} id={id} activity={act} questions={qs} onExit={() => setAct(null)} /></div> : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {pack.data.activities.map((a) => {
            const n = pack.data!.questions.filter((q) => typesFor[a].includes(q.type)).length;
            return (
              <li key={a}>
                <button type="button" disabled={!n} onClick={() => setAct(a)} className="h-full w-full rounded-lg border-2 bg-card p-5 text-left hover:border-primary disabled:opacity-60">
                  <span className="block font-display text-2xl font-semibold">{names[a][0]}</span>
                  <span className="mt-1 block text-muted-foreground">{names[a][1]}</span>
                  <span className="mt-3 block font-bold text-primary">{n ? n + ' question' + (n === 1 ? '' : 's') : 'No questions available'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
