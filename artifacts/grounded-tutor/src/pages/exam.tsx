import { useState } from 'react';
import { Link, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getGetClassroomDashboardQueryKey, getGetClassroomPlanQueryKey, useGetClassroom, useStartExam, useSubmitExamAnswer, type ConceptSummary, type ExamQuestion } from '@workspace/api-client-react';
import { AppShell } from '@/components/shell';
import { Citations, ErrorBlock, LoadingBlock, MasteryBar, Notice, PageHeader, Panel } from '@/components/bits';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export default function Exam() {
  const { id = '' } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const room = useGetClassroom(id);
  const start = useStartExam();
  const answer = useSubmitExamAnswer();
  const [ready, setReady] = useState(false);
  const [examId, setExamId] = useState('');
  const [q, setQ] = useState<ExamQuestion | null>(null);
  const [n, setN] = useState({ num: 0, total: 0 });
  const [resp, setResp] = useState('');
  const [results, setResults] = useState<ConceptSummary[] | null>(null);
  const [fbDone, setFbDone] = useState(false);

  const begin = () => start.mutate({ classroomId: id, data: { ready: true } }, {
    onSuccess: (s) => { setExamId(s.id); setQ(s.currentQuestion); setN({ num: s.questionNumber, total: s.totalQuestions }); if (s.complete) setResults(s.results ?? []); },
  });
  const send = (e: React.FormEvent) => {
    e.preventDefault(); if (!q) return;
    answer.mutate({ classroomId: id, examId, data: { questionId: q.id, response: resp.trim() } }, {
      onSuccess: (r) => {
        setFbDone(true);
        if (r.complete) { setResults(r.results); qc.invalidateQueries({ queryKey: getGetClassroomDashboardQueryKey(id) }); qc.invalidateQueries({ queryKey: getGetClassroomPlanQueryKey(id) }); }
      },
    });
  };
  const advance = () => { const r = answer.data; if (!r) return; if (r.complete) { setQ(null); } else { setQ(r.nextQuestion); setN((x) => ({ ...x, num: x.num + 1 })); } setResp(''); setFbDone(false); answer.reset(); };

  const r = answer.data;
  const ready100 = room.data?.status === 'ready';
  return (
    <AppShell classroomId={id}>
      <PageHeader eyebrow="Examination" title="Show what you know">Questions adapt to your answers. Citations appear after each answer, not before.</PageHeader>
      {results ? (
        <Panel title="Exam results">
          <p className="mb-4 text-lg">Here is where each concept stands now.</p>
          <ul className="divide-y">{results.map((c) => (<li key={c.id} className="py-3"><p className="font-bold">{c.title}</p><MasteryBar value={c.mastery} label={'Result for ' + c.title} /></li>))}</ul>
          <div className="mt-5 flex flex-wrap gap-2"><Button asChild><Link href={'/classrooms/' + id + '/dashboard'}>Open progress</Link></Button>
            <Button variant="outline" onClick={() => { setResults(null); setQ(null); setReady(false); start.reset(); }}>Back to start</Button></div>
        </Panel>
      ) : q ? (
        <Panel>
          <p className="mb-1 text-sm font-bold uppercase tracking-widest text-muted-foreground">Question {n.num} of {n.total} &middot; Difficulty {q.difficulty} of 3</p>
          <MasteryBar value={n.total ? ((n.num - (fbDone ? 0 : 1)) / n.total) * 100 : 0} label="Exam progress" />
          <form onSubmit={send} className="mt-5 space-y-4">
            <fieldset disabled={fbDone || answer.isPending} className="space-y-3">
              <legend className="text-xl font-semibold leading-snug">{q.prompt}</legend>
              {q.options.length > 0 ? q.options.map((o) => (
                <label key={o} className={cn('flex cursor-pointer items-start gap-3 rounded-md border-2 bg-background p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-ring', resp === o ? 'border-primary bg-accent/40' : 'border-border')}>
                  <input type="radio" name="eo" className="mt-1.5 h-4 w-4 accent-[hsl(var(--primary))]" checked={resp === o} onChange={() => setResp(o)} /><span>{o}</span>
                </label>
              )) : (<><label htmlFor="ea" className="sr-only">Your answer</label><Textarea id="ea" rows={5} value={resp} onChange={(e) => setResp(e.target.value)} /></>)}
            </fieldset>
            {!fbDone && <Button type="submit" disabled={answer.isPending || !resp.trim()}>{answer.isPending ? 'Grading' : 'Submit answer'}</Button>}
          </form>
          <div aria-live="polite" className="mt-5">
            {answer.isError && <ErrorBlock title="Could not grade that" error={answer.error} />}
            {r && (<div className="space-y-4"><MasteryBar value={r.score} label="Answer score" /><p className="text-lg">{r.feedback}</p><Citations classroomId={id} citations={q.citations} />
              <Button onClick={advance}>{r.complete ? 'See results' : 'Next question'}</Button></div>)}
          </div>
        </Panel>
      ) : (
        <Panel title="Before you begin">
          {room.isLoading ? <LoadingBlock rows={2} /> : room.error ? <ErrorBlock error={room.error} onRetry={() => room.refetch()} /> : !ready100 ? <Notice>This classroom is not ready yet. Exams open once your PDFs have been read.</Notice> : (
            <>
              <ul className="mb-5 list-disc space-y-1 pl-5 text-lg"><li>Set aside a quiet stretch of time. There is no timer.</li><li>No notes during the exam. You review pages afterwards.</li><li>Your results update your mastery and review schedule.</li></ul>
              <label className="mb-5 flex cursor-pointer items-start gap-3"><input type="checkbox" checked={ready} onChange={(e) => setReady(e.target.checked)} className="mt-1.5 h-5 w-5 accent-[hsl(var(--primary))]" /><span className="font-bold">I am ready to start.</span></label>
              {start.isError && <div className="mb-4"><ErrorBlock title="Could not start the exam" error={start.error} /></div>}
              <Button size="lg" disabled={!ready || start.isPending} onClick={begin}>{start.isPending ? 'Preparing questions' : 'Start examination'}</Button>
            </>
          )}
        </Panel>
      )}
    </AppShell>
  );
}
