import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'wouter';
import { AlertTriangle, Mic, Square } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetClassroomQueryKey, getListClassroomsQueryKey, transcribeSpeech, useAskClassroomQuestion, useGetClassroom, useRetryFailedPages } from '@workspace/api-client-react';
import { AppShell } from '@/components/shell';
import { Citations, ErrorBlock, LoadingBlock, MasteryBar, Notice, PageButton, PageHeader, Panel } from '@/components/bits';
import { StatusPill } from '@/pages/classrooms';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ReviewProgress } from '@/components/review-progress';
import { reviewStageLabel } from '@/components/review-stage-label';

function VoiceQuestionInput({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [status, setStatus] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const disposedRef = useRef(false);

  useEffect(() => () => {
    disposedRef.current = true;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setStatus('Voice recording is not supported in this browser. You can type your question instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setStatus('Recording stopped unexpectedly. Please try again or type your question.');
      };
      recorder.onstop = () => {
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecording(false);
        if (disposedRef.current) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (!blob.size) { setStatus('No audio was recorded. Try again or type your question.'); return; }
        if (blob.size > 25 * 1024 * 1024) { setStatus('That recording is too large. Please record a shorter question.'); return; }
        setTranscribing(true);
        setStatus('Transcribing your recording…');
        void transcribeSpeech(blob, { headers: { 'Content-Type': blob.type || 'application/octet-stream' } })
          .then(({ text }) => {
            if (disposedRef.current) return;
            if (!text.trim()) { setStatus('No speech was detected. Try again or type your question.'); return; }
            onTranscript(text);
            setStatus('Transcription added. Review it, then select Ask.');
          })
          .catch((error: unknown) => {
            if (!disposedRef.current) setStatus(error instanceof Error ? error.message : 'Could not transcribe that recording. Please try again.');
          })
          .finally(() => { if (!disposedRef.current) setTranscribing(false); });
      };
      recorder.start();
      setRecording(true);
      setStatus('Recording. Speak your question, then select Stop recording. Audio is sent to Groq for transcription.');
      timerRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') {
          setStatus('One-minute limit reached. Transcribing your recording…');
          recorder.stop();
        }
      }, 60_000);
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStatus('Microphone access was not available. Allow microphone access or type your question.');
    }
  };

  const stop = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" onClick={recording ? stop : () => void start()} disabled={transcribing} aria-pressed={recording}>
        {recording ? <Square className="mr-2 h-4 w-4" aria-hidden /> : <Mic className="mr-2 h-4 w-4" aria-hidden />}
        {recording ? 'Stop recording' : transcribing ? 'Transcribing…' : 'Record a question'}
      </Button>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {status || 'Record up to one minute. Audio is sent to Groq to transcribe; review the text before asking.'}
      </p>
    </div>
  );
}

function Ask({ id }: { id: string }) {
  const [question, setQ] = useState('');
  const ask = useAskClassroomQuestion();
  const a = ask.data;
  return (
    <Panel title="Ask your PDFs">
      <form onSubmit={(e) => { e.preventDefault(); if (question.trim()) ask.mutate({ classroomId: id, data: { question: question.trim() } }); }} className="space-y-3">
        <label htmlFor="q" className="block text-muted-foreground">Answers use only this classroom's pages.</label>
        <Textarea id="q" rows={2} value={question} onChange={(e) => setQ(e.target.value)} placeholder="e.g. What is the difference between osmosis and diffusion?" />
        <VoiceQuestionInput onTranscript={(text) => setQ((current) => current.trim() ? `${current.trimEnd()} ${text}` : text)} />
        <Button type="submit" disabled={ask.isPending || !question.trim()}>{ask.isPending ? 'Searching your pages' : 'Ask'}</Button>
      </form>
      <div aria-live="polite" className="mt-4">
        {ask.isError && <ErrorBlock title="Could not answer" error={ask.error} />}
        {a && (a.abstained ? <Notice>Your pages do not cover this, so there is no answer to give. {a.answer}</Notice> : (
          <div><p className="whitespace-pre-line text-lg">{a.answer}</p><Citations classroomId={id} citations={a.citations} /></div>))}
      </div>
    </Panel>
  );
}

export default function Overview() {
  const { id = '' } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const retry = useRetryFailedPages({ mutation: { onSuccess: (room) => {
    queryClient.setQueryData(getGetClassroomQueryKey(id), room);
    void queryClient.invalidateQueries({ queryKey: getListClassroomsQueryKey() });
  } } });
  const q = useGetClassroom(id, { query: { queryKey: getGetClassroomQueryKey(id), refetchInterval: (query) => (query.state.data?.status === 'processing' ? 4000 : false) } });
  const c = q.data;
  return (
    <AppShell classroomId={id}>
      {q.isLoading ? <LoadingBlock rows={4} /> : q.error || !c ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <PageHeader eyebrow={c.subject || 'Classroom'} title={c.name} actions={<StatusPill status={c.status} />} />
          {c.status === 'processing' && <div role="status" aria-live="polite" className="mb-6 space-y-3"><Notice>Your PDFs are being verified one page at a time. Saved pages will not be re-read after a restart. This page refreshes automatically. Lessons unlock only when every page is verified.</Notice><ReviewProgress /></div>}
          {c.status === 'needs-attention' && <div role="alert" className="mb-6"><Notice>{c.coverage.flaggedPages.length ? 'Some pages could not be verified after three attempts. Retry those pages below; verified pages are kept.' : 'No teachable concepts could be verified in these documents.'} Teaching, practice, and exams remain locked until coverage is complete.</Notice></div>}
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <div className="space-y-6">
              <Panel title="Source coverage">
                <MasteryBar value={c.coverage.pages ? (c.coverage.mappedPages / c.coverage.pages) * 100 : 0} label="Pages verified" />
                <p className="mt-2" aria-live="polite">{c.coverage.mappedPages} of {c.coverage.pages} pages verified.
                  {c.status === 'processing' && ` ${c.coverage.processingPages ?? 0} being read, ${c.coverage.pendingPages ?? (c.coverage.pages - c.coverage.mappedPages)} waiting or scheduled for automatic retry.`}
                </p>
                {!!c.coverage.failures?.length && <ul className="mt-3 space-y-1 text-sm" aria-label="Page analysis errors">
                  {c.coverage.failures.map((failure) => <li key={failure.page}>Page {failure.page}: {failure.message} (attempt {failure.attempts} of 3){!c.coverage.flaggedPages.includes(failure.page) ? ' — retrying automatically' : ''}</li>)}
                </ul>}
                <dl className="mt-4 grid grid-cols-3 gap-3">
                  {[['Concepts', c.coverage.concepts], ['Figures found', c.coverage.figures], ['Tables found', c.coverage.tables]].map(([k, v]) => (
                    <div key={k as string} className="rounded-md bg-muted p-3"><dt className="text-sm text-muted-foreground">{k}</dt><dd className="text-2xl font-bold">{v}</dd></div>
                  ))}
                </dl>
                {c.coverage.flaggedPages.length > 0 ? (
                  <div className="mt-4 rounded-md border-2 border-accent-foreground/40 bg-accent p-4 text-accent-foreground">
                    <p className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" aria-hidden />{c.coverage.flaggedPages.length} page{c.coverage.flaggedPages.length === 1 ? '' : 's'} may be incomplete</p>
                    <p className="mt-1">Check these pages in your original PDF. A retry makes up to three new attempts per failed page.</p>
                    <div className="mt-3 flex flex-wrap gap-2">{c.coverage.flaggedPages.map((p) => <PageButton key={p} classroomId={id} page={p} />)}</div>
                    <Button className="mt-3" size="sm" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate({ classroomId: id })}>{retry.isPending ? 'Scheduling retry…' : 'Retry failed pages'}</Button>
                  </div>
                ) : c.status === 'ready' ? <p className="mt-4 font-bold text-primary">No flagged pages.</p> : null}
                {retry.isError && <ErrorBlock title="Could not retry pages" error={retry.error} />}
              </Panel>
              <Panel title="Concepts">
                {c.concepts.length === 0 ? <p className="text-muted-foreground">No concepts yet.</p> : (
                  <ul className="divide-y">
                    {c.concepts.map((k) => (
                      <li key={k.id} className="py-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          {c.status === 'ready' ? <Link href={'/classrooms/' + id + '/teach?concept=' + k.id} className="text-lg font-bold underline-offset-4 hover:underline">{k.title}</Link> : <span className="text-lg font-bold">{k.title}</span>}
                          <span className="text-sm text-muted-foreground">{k.estimatedMinutes} min{k.reviewDue ? ' \u00b7 review due' : ''} \u00b7 pages {k.pageRefs.join(', ')}</span>
                        </div>
                        <p className="text-muted-foreground">{k.summary}</p>
                        <div className="mt-2 max-w-sm"><MasteryBar value={k.mastery} label={'Mastery of ' + k.title} /></div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              {c.status === 'ready' && <Ask id={id} />}
            </div>
            <aside className="space-y-6">
              <Panel title="Next step">
                {c.status !== 'ready' ? <p>Learning activities unlock after every page is verified and concepts are found.</p> : <>
                <Button asChild className="w-full"><Link href={'/classrooms/' + id + '/teach'}>Start teaching</Link></Button>
                <div className="mt-2 grid gap-2"><Button asChild variant="outline"><Link href={'/classrooms/' + id + '/practice'}>Practice Arena</Link></Button>
                  <Button asChild variant="outline"><Link href={'/classrooms/' + id + '/exam'}>Examination</Link></Button></div>
                </>}
              </Panel>
              <Panel title="Original PDFs">
                <ul className="space-y-3">
                  {c.documents.map((d) => (
                    <li key={d.id}>
                      <p className="break-words font-bold">{d.name}</p>
                      <p className="mb-1 text-sm text-muted-foreground">{d.pageCount} pages</p>
                      {c.status === 'processing' && d.currentStages?.length ? <p className="mb-2 text-sm font-semibold text-primary">Current stages: {d.currentStages.map(reviewStageLabel).join(' · ')}</p> : null}
                      <PageButton classroomId={id} page={1} label="Open viewer" />
                    </li>
                  ))}
                </ul>
              </Panel>
            </aside>
          </div>
        </>
      )}
    </AppShell>
  );
}
