import { useRef, useState } from 'react';
import { Link, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { getGetClassroomDashboardQueryKey, getGetClassroomPlanQueryKey, getGetLessonQueryKey, useGetClassroomPlan, useGetLesson, useGetProfile, useSubmitDiagnostic, useSubmitExplainBack, type ConceptSummary } from '@workspace/api-client-react';
import { AppShell } from '@/components/shell';
import { Citations, EmptyBlock, ErrorBlock, LoadingBlock, MasteryBar, PageButton, PageHeader, Panel } from '@/components/bits';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ReadAloud } from '@/components/read-aloud';

const nextCopy = { continue: 'You have it. Move to the next concept.', 're-explain': 'Read the lesson again with the missing points in mind, then explain once more.', revisit: 'Revisit the cited pages first, then come back and try again.' } as const;

function LessonView({ id, concept, next, onNext }: { id: string; concept: ConceptSummary; next?: ConceptSummary; onNext: (c: string) => void }) {
  const qc = useQueryClient();
  const profile = useGetProfile();
  const lq = useGetLesson(id, concept.id, { query: { queryKey: getGetLessonQueryKey(id, concept.id) } });
  const eb = useSubmitExplainBack();
  const diag = useSubmitDiagnostic();
  const questions = useRef<string[] | null>(null);
  if (lq.data && !questions.current) questions.current = lq.data.diagnosticQuestions.slice(0, 3);
  const [answers, setAnswers] = useState<string[]>([]);
  const [text, setText] = useState('');
  const base = lq.data; const l = diag.data ?? null; const fb = eb.data;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    eb.mutate({ classroomId: id, conceptId: concept.id, data: { response: text.trim() } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetClassroomDashboardQueryKey(id) });
        qc.invalidateQueries({ queryKey: getGetClassroomPlanQueryKey(id) });
      },
    });
  };
  if (lq.isLoading) return <LoadingBlock rows={4} label="Preparing your lesson" />;
  if (lq.error || !base) return <ErrorBlock title="The lesson did not load" error={lq.error} onRetry={() => lq.refetch()} />;
  const qs = questions.current ?? [];
  const submitDiag = (e: React.FormEvent) => {
    e.preventDefault();
    diag.mutate({ classroomId: id, conceptId: concept.id, data: { responses: qs.map((_, i) => (answers[i] ?? '').trim() || 'not sure') } });
  };
  if (!l) return (
    <Panel>
      <h2 className="text-2xl font-semibold">{base.concept.title}</h2>
      <p className="mb-4 text-muted-foreground">About {base.concept.estimatedMinutes} minutes. First, a quick check so the lesson fits you.</p>
      {qs.length === 0 ? <ErrorBlock title="No check questions were returned" onRetry={() => lq.refetch()} /> : (
        <form onSubmit={submitDiag} className="space-y-4">
          {qs.map((d, i) => (
            <div key={i} className="space-y-1.5">
              <label htmlFor={'diag-' + i} className="block text-lg font-bold">Question {i + 1} of {qs.length}: {d}</label>
              <Textarea id={'diag-' + i} rows={2} value={answers[i] ?? ''} onChange={(e) => setAnswers((a) => { const n = [...a]; n[i] = e.target.value; return n; })} aria-describedby="diag-hint" />
            </div>
          ))}
          <p id="diag-hint" className="text-muted-foreground">Not sure? Type &ldquo;not sure&rdquo;. Blank answers count as not sure.</p>
          {diag.isError && <ErrorBlock title="Could not adapt the lesson" error={diag.error} />}
          <Button type="submit" disabled={diag.isPending}>{diag.isPending ? 'Adapting your lesson' : 'Show my lesson'}</Button>
        </form>
      )}
    </Panel>
  );
  return (
    <div className="space-y-6">
      <Panel>
        <h2 className="text-2xl font-semibold">{l.concept.title}</h2>
        <p className="mb-4 text-muted-foreground">About {l.concept.estimatedMinutes} minutes. Pages {l.concept.pageRefs.join(', ')}.</p>
        <ReadAloud text={l.explanation} language={profile.data?.learningLanguage ?? 'en-US'} />
        {l.figurePages.length > 0 && (
          <div className="mt-5"><h3 className="mb-2 font-bold">Figures and tables in your PDF</h3>
            <div className="flex flex-wrap gap-2">{l.figurePages.map((p) => <PageButton key={p} classroomId={id} page={p} label={'Open page ' + p} />)}</div></div>
        )}
        <Citations classroomId={id} citations={l.citations} />
      </Panel>
      <Panel title="Explain it back">
        <form onSubmit={submit} className="space-y-3">
          <label htmlFor="eb" className="block text-muted-foreground">In your own words, as if teaching a friend. A few sentences is plenty.</label>
          <Textarea id="eb" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" disabled={eb.isPending || !text.trim()}>{eb.isPending ? 'Checking against your pages' : 'Check my explanation'}</Button>
        </form>
        <div aria-live="polite" className="mt-5">
          {eb.isError && <ErrorBlock title="Could not check that" error={eb.error} onRetry={() => submit(new Event('submit') as unknown as React.FormEvent)} />}
          {fb && (
            <div className="space-y-4">
              <MasteryBar value={fb.score} label="Explanation score" />
              <p className="text-lg">{fb.feedback}</p>
              {fb.missingPoints.length > 0 && <div><h3 className="font-bold">Still missing</h3><ul className="list-disc pl-5">{fb.missingPoints.map((m, i) => <li key={i}>{m}</li>)}</ul></div>}
              {fb.reExplanation && <div className="rounded-md bg-accent p-4 text-accent-foreground"><h3 className="mb-1 font-bold">Explained another way</h3><p className="whitespace-pre-line">{fb.reExplanation}</p></div>}
              <Citations classroomId={id} citations={fb.citations} />
              <p className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-5 w-5 text-primary" aria-hidden />{nextCopy[fb.nextAction]}</p>
              <div className="flex flex-wrap gap-2">
                {fb.nextAction === 'continue' && next && <Button onClick={() => { setText(''); eb.reset(); onNext(next.id); }}>Next: {next.title}</Button>}
                {fb.nextAction === 'continue' && !next && <Button asChild><Link href={'/classrooms/' + id + '/practice'}>Go to Practice Arena</Link></Button>}
                {fb.nextAction !== 'continue' && <Button variant="outline" onClick={() => { setText(''); eb.reset(); }}>Try again</Button>}
              </div>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

export default function Teach() {
  const { id = '' } = useParams<{ id: string }>();
  const plan = useGetClassroomPlan(id);
  const [sel, setSel] = useState<string | null>(() => new URLSearchParams(window.location.search).get('concept'));
  const concepts = plan.data?.concepts ?? [];
  const idx = Math.max(0, concepts.findIndex((c) => c.id === sel));
  const current = concepts[idx];
  return (
    <AppShell classroomId={id}>
      <PageHeader eyebrow="Teaching" title="One concept at a time">{plan.data ? 'About ' + plan.data.estimatedMinutes + ' minutes in total, ordered for you.' : 'Your personalised plan.'}</PageHeader>
      {plan.isLoading ? <LoadingBlock rows={4} /> : plan.error ? <ErrorBlock error={plan.error} onRetry={() => plan.refetch()} /> :
        !current ? <EmptyBlock title="No lessons yet" action={<Button asChild variant="outline"><Link href={'/classrooms/' + id}>Check processing status</Link></Button>}>Lessons appear once your PDFs have been read and mapped to concepts.</EmptyBlock> : (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <nav aria-label="Teaching plan" className="lg:sticky lg:top-4 lg:self-start">
            <ol className="space-y-2">
              {concepts.map((c, i) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setSel(c.id)} aria-current={i === idx ? 'step' : undefined}
                    className={cn('w-full rounded-md border-2 p-3 text-left', i === idx ? 'border-primary bg-accent/40' : 'border-border bg-card hover:border-primary/50')}>
                    <span className="block font-bold">{i + 1}. {c.title}</span>
                    <span className="mb-1 block text-sm text-muted-foreground">{c.estimatedMinutes} min{c.reviewDue ? ' \u00b7 review due' : ''}</span>
                    <MasteryBar value={c.mastery} label={'Mastery of ' + c.title} />
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <LessonView key={current.id} id={id} concept={current} next={concepts[idx + 1]} onNext={setSel} />
        </div>
      )}
    </AppShell>
  );
}
