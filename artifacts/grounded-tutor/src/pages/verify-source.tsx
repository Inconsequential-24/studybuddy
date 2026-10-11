import { useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  Info,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  getGetSourceCheckQueryKey,
  getListPdfActivityQueryKey,
  useDeleteSourceCheck,
  useGetSourceCheck,
  useRequestSourceCheckUpload,
  useStartSourceCheck,
  type SourceCheckStatus,
  useListPdfActivity,
} from '@workspace/api-client-react';
import { AppShell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { ReviewProgress } from '@/components/review-progress';
import { reviewStageLabel } from '@/components/review-stage-label';

const MAX_BYTES = 25 * 1024 * 1024;
const mb = (bytes: number) => (bytes / 1048576).toFixed(1) + ' MB';

function readCheckId(location: string) {
  const query = location.includes('?') ? location.slice(location.indexOf('?') + 1) : '';
  return new URLSearchParams(query.split('#')[0]).get('check') || '';
}

function ModeDescription({ mode }: { mode: 'skim' | 'thorough' }) {
  if (mode === 'skim') {
    return <p className="mt-2 text-sm leading-6 text-muted-foreground">Checks extracted text against web sources. Figures, diagrams, and tables are not reviewed. Up to 30 pages.</p>;
  }
  return <p className="mt-2 text-sm leading-6 text-muted-foreground">Also checks page images, diagrams, and tables against web sources. Up to 8 pages; takes longer.</p>;
}

function FindingCard({ finding, index }: { finding: NonNullable<SourceCheckStatus['report']>['findings'][number]; index: number }) {
  const conflict = finding.status === 'confirmed-conflict';
  const evidenceName = finding.evidenceKind === 'text' ? 'Text' : finding.evidenceKind === 'figure' ? 'Figure' : 'Table';
  return (
    <article className="overflow-hidden rounded-xl border bg-card shadow-sm" data-testid={'card-source-finding-' + index}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/50 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border bg-background px-3 py-1 text-sm font-bold">PDF page {finding.page}</span>
          <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-bold text-primary">{evidenceName} evidence</span>
          {finding.sourceId && <span className="rounded-full border bg-background px-3 py-1 font-mono text-xs text-muted-foreground">Figure/table ID: {finding.sourceId}</span>}
        </div>
        <span className={'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ' + (conflict ? 'bg-destructive/10 text-destructive' : 'bg-accent text-accent-foreground')} data-testid={'status-finding-' + index}>
          {conflict ? <AlertTriangle className="h-4 w-4" aria-hidden /> : <Info className="h-4 w-4" aria-hidden />}
          {conflict ? 'Confirmed conflict' : 'Possible conflict'}
        </span>
      </div>
      <div className="space-y-5 p-5">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Exact quote from your PDF</p>
          <blockquote className="border-l-2 border-primary/50 pl-4 font-serif text-lg leading-7 text-foreground">“{finding.pdfQuote}”</blockquote>
        </div>
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Why it was flagged</p>
          <p className="leading-7">{finding.explanation}</p>
        </div>
        <a href={finding.sourceUrl} target="_blank" rel="noreferrer" data-testid={'link-source-' + index}
          className="group inline-flex max-w-full items-start gap-2 rounded-md text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary">
          <span className="min-w-0 break-words font-bold">{finding.sourceName}</span>
          <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    </article>
  );
}

function Report({ status, onDelete, deleting, deleteError }: {
  status: SourceCheckStatus;
  onDelete: () => void;
  deleting: boolean;
  deleteError: string;
}) {
  const report = status.report;
  if (!report) return null;
  const isSkim = report.mode === 'skim';
  return (
    <section className="mt-8 space-y-6" aria-labelledby="report-title">
      <div className="rounded-2xl border border-primary/20 bg-primary/[0.045] p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><FileCheck2 className="h-6 w-6" aria-hidden /></span>
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.13em] text-primary">Independent source check</p>
              <h2 id="report-title" className="mt-1 font-display text-3xl font-semibold">Review the findings</h2>
              <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">This is a factual cross-check of one PDF, separate from your classrooms and tutoring.</p>
            </div>
          </div>
          <div className="rounded-lg border bg-card px-4 py-3 text-sm">
            <span className="font-bold">{report.reviewedPages} of {report.totalPages} pages reviewed</span>
            <span className="mt-0.5 block text-muted-foreground">{isSkim ? 'Skim review' : 'Thorough review'}</span>
          </div>
        </div>
        <div className="mt-5 flex gap-3 rounded-lg border border-accent-foreground/10 bg-accent/45 p-4 text-sm leading-6">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <p><strong>This report is not a guarantee of accuracy.</strong> Sources can change, the review may miss context, and a reported discrepancy needs your judgment.</p>
        </div>
        <div className="mt-4 rounded-lg bg-background/75 px-4 py-3 text-sm leading-6">
          <p className="font-bold">Limits of this {isSkim ? 'skim' : 'thorough'} review</p>
          <p className="mt-1 text-muted-foreground">{report.limitations || (isSkim
            ? 'Skim checks extracted text only and can miss errors in diagrams, figures, tables, and scanned content. It reviews at most 30 pages.'
            : 'Thorough review checks page images, diagrams, and tables alongside text, but can still miss details or context. It reviews at most 8 pages.')}</p>
        </div>
      </div>

      {report.findings.length > 0 ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h3 className="font-display text-2xl font-semibold">Discrepancies to inspect</h3><p className="text-sm text-muted-foreground">Open each source and compare it with the quoted PDF evidence.</p></div>
            <span className="rounded-full bg-muted px-3 py-1 text-sm font-bold" data-testid="text-finding-count">{report.findings.length} {report.findings.length === 1 ? 'finding' : 'findings'}</span>
          </div>
          {report.findings.map((finding, index) => <FindingCard key={index} finding={finding} index={index} />)}
        </div>
      ) : (
        <div className="rounded-xl border border-primary/20 bg-card p-6" data-testid="status-no-findings">
          <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden /><div><h3 className="font-display text-xl font-semibold">No discrepancies surfaced</h3><p className="mt-1 leading-6 text-muted-foreground">That is not proof that every claim is correct. Use the review limits and unchecked claims to guide any further checking.</p></div></div>
        </div>
      )}
      {report.uncheckedClaims.length > 0 && (
        <section className="rounded-xl border bg-card p-5" aria-labelledby="unchecked-title">
          <h3 id="unchecked-title" className="font-display text-xl font-semibold">Claims not checked</h3>
          <p className="mb-3 mt-1 text-sm text-muted-foreground">These claims could not be confidently cross-checked.</p>
          <ul className="list-disc space-y-2 pl-5 leading-6">
            {report.uncheckedClaims.map((claim, i) => <li key={i} data-testid={'text-unchecked-claim-' + i}>{claim}</li>)}
          </ul>
        </section>
      )}
      <div className="flex flex-col justify-between gap-3 border-t pt-5 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground">This one-time report expires {new Date(status.expiresAt).toLocaleString()}.</p>
        <Button variant="outline" onClick={onDelete} disabled={deleting} data-testid="button-delete-report" className="gap-2 text-destructive hover:text-destructive">
          {deleting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
          Delete report and start over
        </Button>
      </div>
      {deleteError && <p role="alert" className="text-sm font-bold text-destructive" data-testid="status-delete-error">{deleteError}</p>}
    </section>
  );
}

export default function VerifySource() {
  const [location, setLocation] = useLocation();
  const checkId = readCheckId(location);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'skim' | 'thorough'>('skim');
  const [busyLabel, setBusyLabel] = useState('');
  const [localError, setLocalError] = useState('');
  const [uploadFailed, setUploadFailed] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [cancelTarget, setCancelTarget] = useState<{ id: string; fileName: string; status: string } | null>(null);
  const [cancelError, setCancelError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const activeUploadRef = useRef<{ id: string; controller: AbortController } | null>(null);
  const historyQuery = useListPdfActivity({
    query: {
      queryKey: getListPdfActivityQueryKey(),
      refetchInterval: (query) => query.state.data?.items.some((item) =>
        item.kind === 'source-check'
          ? item.status === 'uploading' || item.status === 'processing'
          : item.status === 'processing',
      ) ? 2500 : false,
    },
  });

  const requestUpload = useRequestSourceCheckUpload();
  const startCheck = useStartSourceCheck();
  const deleteCheck = useDeleteSourceCheck();
  const checkQuery = useGetSourceCheck(checkId, {
    query: {
      enabled: !!checkId,
      queryKey: getGetSourceCheckQueryKey(checkId),
      refetchInterval: (query) => query.state.data?.status === 'processing' ? 1500 : false,
    },
  });
  const saved = checkQuery.data;
  const status = saved?.status;
  const isBusy = !!busyLabel || requestUpload.isPending || startCheck.isPending || deleteCheck.isPending;

  const updateCheckInUrl = (id: string) => {
    setLocation(id ? '/verify-source?check=' + encodeURIComponent(id) : '/verify-source', { replace: true });
  };

  const selectFile = (candidate?: File) => {
    setLocalError('');
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith('.pdf') && candidate.type !== 'application/pdf') {
      setLocalError('Choose a PDF file to continue.');
    } else if (candidate.size === 0) {
      setLocalError('This file is empty. Choose another PDF.');
    } else if (candidate.size > MAX_BYTES) {
      setLocalError('This PDF is ' + mb(candidate.size) + '. The maximum file size is 25 MB.');
    } else {
      setFile(candidate);
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const upload = async () => {
    if (!file) return;
    setLocalError('');
    setUploadFailed(false);
    let reservedCheck = false;
    let uploadController: AbortController | null = null;
    let uploadId: string | null = null;
    try {
      setBusyLabel('Preparing a private upload');
      const uploadResult = await requestUpload.mutateAsync({
        data: { name: file.name, size: file.size, mode },
      });
      reservedCheck = true;
      uploadId = uploadResult.id;
      updateCheckInUrl(uploadResult.id);
      void historyQuery.refetch();
      setBusyLabel('Uploading your PDF');
      uploadController = new AbortController();
      activeUploadRef.current = { id: uploadResult.id, controller: uploadController };
      const response = await fetch(uploadResult.uploadURL, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': 'application/pdf' },
        signal: uploadController.signal,
      });
      if (!response.ok) throw new Error('The PDF upload did not finish. Delete this check and start over with the PDF.');
      setBusyLabel('');
      setFile(null);
    } catch (error) {
      setBusyLabel('');
      if (uploadController?.signal.aborted) return;
      setUploadFailed(reservedCheck);
      setLocalError(error instanceof Error ? error.message : 'The PDF could not be uploaded. Please try again.');
    } finally {
      if (activeUploadRef.current?.id === uploadId) activeUploadRef.current = null;
    }
  };

  const start = async () => {
    if (!checkId) return;
    setLocalError('');
    setBusyLabel('Starting the source review');
    try {
      await startCheck.mutateAsync({ checkId });
      await checkQuery.refetch();
      void historyQuery.refetch();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'The review could not be started. Please try again.');
    } finally {
      setBusyLabel('');
    }
  };

  const reset = async () => {
    if (!checkId) {
      setFile(null); setMode('skim'); setLocalError(''); setDeleteConfirm(false); return;
    }
    setDeleteError('');
    try {
      await deleteCheck.mutateAsync({ checkId });
      void historyQuery.refetch();
      updateCheckInUrl('');
      setFile(null); setMode('skim'); setLocalError(''); setDeleteConfirm(false);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'The report could not be deleted. Please try again.');
    }
  };

  const cancelOne = async () => {
    if (!cancelTarget) return;
    const target = cancelTarget;
    setCancelError('');
    const currentUpload = activeUploadRef.current;
    if (currentUpload?.id === target.id) currentUpload.controller.abort();
    try {
      await deleteCheck.mutateAsync({ checkId: target.id });
      if (activeUploadRef.current?.id === target.id) activeUploadRef.current = null;
      void historyQuery.refetch();
      if (target.id === checkId) {
        updateCheckInUrl('');
        setFile(null);
        setUploadFailed(false);
        setLocalError('');
      }
      setBusyLabel('');
      setCancelTarget(null);
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : 'This PDF could not be cancelled. Please try again.');
    }
  };

  const acceptDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    selectFile(event.dataTransfer.files[0]);
  };

  const readyToStart = !!checkId && (status === 'uploading' || (!status && !checkQuery.isLoading && !checkQuery.error));
  const processing = status === 'processing';
  const complete = status === 'complete' && !!saved?.report;
  const failed = status === 'failed';
  const showUpload = !checkId;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 border-b pb-7 sm:mb-10">
          <p className="mb-2 text-sm font-bold uppercase tracking-[0.16em] text-primary">Optional · one-time check</p>
          <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">Check a PDF against sources</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">A separate factual cross-check for a document you already have. It does not add the PDF to a classroom or provide tutoring.</p>
        </header>

        <section className="mb-8 rounded-2xl border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="source-history-heading" data-testid="pdf-activity-history">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.13em] text-primary">Recent activity</p>
              <h2 id="source-history-heading" className="mt-1 font-display text-2xl font-semibold">PDF activity</h2>
              <p className="mt-1 text-sm text-muted-foreground">Classroom uploads and one-time source checks, newest first. Source checks remain here until they expire.</p>
            </div>
            {!historyQuery.isLoading && !historyQuery.error && historyQuery.data && (
              <p className="rounded-full bg-muted px-3 py-1 text-sm font-bold" data-testid="text-pdf-activity-count">
                {historyQuery.data.totalCount} {historyQuery.data.totalCount === 1 ? 'PDF' : 'PDFs'}
              </p>
            )}
          </div>
          {historyQuery.isLoading ? (
            <p className="mt-4 text-sm text-muted-foreground" role="status">Loading recent PDF activity…</p>
          ) : historyQuery.error ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <p role="alert" className="text-muted-foreground">Recent activity could not be loaded.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void historyQuery.refetch()}>Try again</Button>
            </div>
          ) : !historyQuery.data || historyQuery.data.items.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No PDF activity yet. Classroom uploads and active source checks will appear here.</p>
          ) : (
            <ul className="mt-4 divide-y rounded-xl border" data-testid="list-pdf-activity">
              {historyQuery.data.items.map((item) => {
                const isSourceCheck = item.kind === 'source-check';
                const active = isSourceCheck
                  ? item.status === 'uploading' || item.status === 'processing'
                  : item.status === 'processing';
                const statusLabel = isSourceCheck
                  ? ({ uploading: 'Upload in progress', processing: 'Review in progress', complete: 'Complete', failed: 'Needs attention' } as const)[item.status]
                  : ({ processing: 'Processing', ready: 'Ready for tutoring', 'needs-attention': 'Needs attention' } as const)[item.status];
                return (
                  <li key={item.id}>
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <Link href={isSourceCheck
                        ? '/verify-source?check=' + encodeURIComponent(item.id)
                        : '/classrooms/' + encodeURIComponent(item.classroomId)}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-md hover:underline focus-visible:outline"
                        aria-current={isSourceCheck && item.id === checkId ? 'page' : undefined}>
                        {isSourceCheck
                          ? <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                          : <BookOpen className="h-5 w-5 shrink-0 text-primary" aria-hidden />}
                        <span className="min-w-0">
                          <span className="block truncate font-bold">{item.fileName}</span>
                          <span className="block text-sm text-muted-foreground">
                            {isSourceCheck
                              ? (item.mode === 'thorough' ? 'Thorough source check' : 'Skim source check')
                              : 'Classroom · ' + item.classroomName}
                            {' · '}{new Date(item.createdAt).toLocaleString()}
                          </span>
                          {isSourceCheck
                            ? item.status === 'processing' && item.stage && <span className="mt-1 block text-sm font-semibold text-primary">Current stage: {reviewStageLabel(item.stage)}</span>
                            : item.status === 'processing' && item.currentStages.length > 0 && <span className="mt-1 block text-sm font-semibold text-primary">Current stages: {item.currentStages.map(reviewStageLabel).join(' · ')}</span>}
                        </span>
                      </Link>
                      <span className="flex items-center gap-2">
                      <span className={'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ' + (statusLabel === 'Needs attention' ? 'bg-destructive/10 text-destructive' : active ? 'bg-accent text-accent-foreground' : 'bg-muted text-foreground')}>
                        {active && <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden="true" />}
                        {statusLabel}
                      </span>
                      {isSourceCheck && active && <Button type="button" variant="outline" size="sm" aria-label={(item.status === 'processing' ? 'Stop review of ' : 'Cancel upload of ') + item.fileName} onClick={() => { setCancelError(''); setCancelTarget({ id: item.id, fileName: item.fileName, status: item.status }); }} disabled={deleteCheck.isPending} data-testid={'button-cancel-source-check-' + item.id}>{item.status === 'processing' ? 'Stop review' : 'Cancel upload'}</Button>}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {showUpload && (
          <section className="space-y-6" aria-labelledby="upload-heading">
            <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
              <div className="mb-5 flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"><FileText className="h-5 w-5" aria-hidden /></span>
                <div><h2 id="upload-heading" className="font-display text-2xl font-semibold">Choose a PDF and review depth</h2><p className="mt-1 text-muted-foreground">PDF only · maximum 25 MB · one file per check</p></div>
              </div>
              <input ref={inputRef} id="source-pdf" type="file" accept="application/pdf,.pdf" className="sr-only"
                data-testid="input-source-pdf" aria-label="Choose a PDF to check" onChange={(event) => selectFile(event.target.files?.[0])} />
              <div onDragOver={(event) => event.preventDefault()} onDrop={acceptDrop}
                className="rounded-xl border-2 border-dashed border-border bg-background/70 px-5 py-8 text-center transition-colors hover:border-primary/50 sm:py-10"
                data-testid="dropzone-source-pdf">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted text-primary"><UploadCloud className="h-6 w-6" aria-hidden /></span>
                {file ? (
                  <div className="mx-auto mt-4 flex max-w-lg items-center justify-center gap-3 rounded-lg border bg-card px-4 py-3 text-left">
                    <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1"><span className="block truncate font-bold" data-testid="text-selected-file">{file.name}</span><span className="text-sm text-muted-foreground">{mb(file.size)}</span></span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setFile(null)} aria-label="Remove selected PDF" data-testid="button-remove-file"><X className="h-4 w-4" aria-hidden /></Button>
                  </div>
                ) : (
                  <>
                    <p className="mt-4 font-bold">Drop your PDF here</p>
                    <p className="mt-1 text-sm text-muted-foreground">or choose it from your device</p>
                    <Button type="button" variant="outline" className="mt-4" onClick={() => inputRef.current?.click()} data-testid="button-choose-pdf">Choose PDF</Button>
                  </>
                )}
              </div>

              <fieldset className="mt-7">
                <legend className="mb-3 font-bold">How should it be checked?</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(['skim', 'thorough'] as const).map((value) => (
                    <label key={value} className={'relative cursor-pointer rounded-xl border p-4 transition-colors ' + (mode === value ? 'border-primary bg-primary/[0.045] ring-1 ring-primary/30' : 'bg-background hover:border-primary/40')}>
                      <input type="radio" name="review-mode" value={value} checked={mode === value} onChange={() => setMode(value)} disabled={isBusy}
                        className="sr-only" data-testid={'input-mode-' + value} />
                      <span className="flex items-start justify-between gap-3">
                        <span><span className="block font-bold">{value === 'skim' ? 'Skim' : 'Thorough'}</span><ModeDescription mode={value} /></span>
                        <span className={'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ' + (mode === value ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50')}>
                          {mode === value && <Check className="h-3.5 w-3.5" aria-hidden />}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="mt-5 flex items-start gap-2.5 rounded-lg bg-muted/70 px-4 py-3 text-sm leading-6 text-muted-foreground">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <p>Your PDF is used only for this check. The report is temporary and can be deleted at any time.</p>
              </div>
              {localError && <p role="alert" className="mt-4 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 font-bold text-destructive" data-testid="status-upload-error">{localError}</p>}
              <div className="mt-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <Button size="lg" onClick={upload} disabled={!file || isBusy} data-testid="button-upload-source-check" className="gap-2">
                  {isBusy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
                  {isBusy ? 'Uploading' : 'Upload PDF'}
                </Button>
                <p className="text-sm text-muted-foreground">You will review the details before the check begins.</p>
              </div>
              {isBusy && <p role="status" aria-live="polite" className="mt-3 text-sm font-bold text-primary" data-testid="status-upload-progress">{busyLabel}</p>}
            </div>
            <p className="text-center text-sm leading-6 text-muted-foreground">This is an optional source-check tool, not part of classroom creation. No report can guarantee that every fact has been checked.</p>
          </section>
        )}

        {checkId && checkQuery.isLoading && (
          <div className="rounded-xl border bg-card p-6" role="status" data-testid="status-loading-check">
            <div className="flex items-center gap-3"><span className="h-5 w-5 animate-pulse rounded-full bg-primary/30" /><p className="font-bold">Loading your saved source check</p></div>
            <div className="mt-5 h-3 animate-pulse rounded bg-muted" /><div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        )}
        {checkId && checkQuery.error && (
          <div className="rounded-xl border border-destructive/25 bg-card p-6" role="alert" data-testid="status-load-error">
            <div className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0 text-destructive" aria-hidden /><div><h2 className="font-bold">This source check could not be loaded</h2><p className="mt-1 text-muted-foreground">The saved report may have expired, or the connection was interrupted.</p></div></div>
            <div className="mt-4 flex gap-2"><Button variant="outline" onClick={() => checkQuery.refetch()} data-testid="button-retry-load"><RotateCcw className="mr-2 h-4 w-4" aria-hidden />Try again</Button><Button variant="ghost" onClick={() => updateCheckInUrl('')} data-testid="button-clear-source-check">Start a new check</Button></div>
          </div>
        )}

        {readyToStart && !checkQuery.isLoading && (
          <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="ready-heading">
            <div className="flex gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><FileCheck2 className="h-6 w-6" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold uppercase tracking-[0.13em] text-primary">PDF uploaded</p>
                <h2 id="ready-heading" className="mt-1 font-display text-2xl font-semibold">Ready when you are</h2>
                <p className="mt-2 leading-7 text-muted-foreground">Your PDF is stored for this separate, one-time check. Nothing starts until you choose to begin.</p>
              </div>
            </div>
            <div className="mt-6 rounded-xl border bg-muted/35 p-4 sm:p-5">
              <p className="font-bold">Selected review: {saved?.mode === 'thorough' ? 'Thorough' : 'Skim'}</p>
              <ModeDescription mode={saved?.mode === 'thorough' ? 'thorough' : 'skim'} />
              <p className="mt-3 text-sm font-bold">Report limitations</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{saved?.mode === 'thorough'
                ? 'Thorough checks text, page images, diagrams, and tables against web sources, but it is limited to 8 pages and may still miss context or errors.'
                : 'Skim checks extracted text against web sources only. It does not check figures, diagrams, or tables, and is limited to 30 pages.'} A report is not a guarantee of accuracy.</p>
            </div>
            {localError && <p role="alert" className="mt-4 font-bold text-destructive" data-testid={uploadFailed ? 'status-upload-error' : 'status-start-error'}>{localError}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={start} disabled={isBusy || uploadFailed} data-testid="button-start-source-check" className="gap-2">
                {isBusy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
                {isBusy ? 'Starting review' : 'Start source check'}
              </Button>
              <Button variant="ghost" onClick={() => setDeleteConfirm(true)} disabled={isBusy} data-testid="button-delete-pending-check" className="gap-2 text-muted-foreground"><Trash2 className="h-4 w-4" aria-hidden />Delete and start over</Button>
            </div>
            {isBusy && <p role="status" className="mt-3 text-sm font-bold text-primary" data-testid="status-start-progress">{busyLabel}</p>}
          </section>
        )}

        {processing && (
          <section className="rounded-2xl border bg-card p-6 sm:p-8" aria-labelledby="processing-heading" data-testid="status-processing">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Clock3 className="h-6 w-6" aria-hidden /></span>
              <div><p className="text-sm font-bold uppercase tracking-[0.13em] text-primary">Source check in progress</p><h2 id="processing-heading" className="mt-1 font-display text-2xl font-semibold">{saved?.stage ? reviewStageLabel(saved.stage) : 'Reviewing PDF'}</h2><p className="mt-2 max-w-xl leading-7 text-muted-foreground">The named stage reflects the work currently underway. The review checks for updates automatically; no completion estimate is available. You can leave and return; the check ID is saved in the page address.</p></div>
            </div>
            <div className="mt-6"><ReviewProgress /></div>
            <p className="mt-5 flex items-center gap-2 text-sm font-bold text-muted-foreground"><Clock3 className="h-4 w-4" aria-hidden />Checking saved status automatically</p>
          </section>
        )}

        {failed && (
          <section className="rounded-2xl border border-destructive/25 bg-card p-6 sm:p-8" aria-labelledby="failed-heading" data-testid="status-check-failed">
            <div className="flex gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive"><AlertTriangle className="h-6 w-6" aria-hidden /></span><div><p className="text-sm font-bold uppercase tracking-[0.13em] text-destructive">Review stopped</p><h2 id="failed-heading" className="mt-1 font-display text-2xl font-semibold">The source check could not finish</h2><p className="mt-2 leading-7 text-muted-foreground">{saved?.failure || 'An unexpected issue interrupted the review.'}</p></div></div>
            <div className="mt-5 flex flex-wrap gap-3"><Button variant="outline" onClick={() => setDeleteConfirm(true)} data-testid="button-reset-failed-check" className="gap-2"><RotateCcw className="h-4 w-4" aria-hidden />Delete and try a new check</Button></div>
            {deleteError && <p role="alert" className="mt-3 text-sm font-bold text-destructive" data-testid="status-delete-error">{deleteError}</p>}
          </section>
        )}

        {complete && saved && <Report status={saved} onDelete={() => setDeleteConfirm(true)} deleting={deleteCheck.isPending} deleteError={deleteError} />}

        {checkId && !checkQuery.isLoading && !checkQuery.error && !readyToStart && !processing && !complete && !failed && (
          <div className="rounded-xl border bg-card p-6" role="status" data-testid="status-check-refreshing"><div className="flex items-center gap-3"><LoaderCircle className="h-5 w-5 animate-spin text-primary" aria-hidden /><p className="font-bold">Updating source-check status</p></div></div>
        )}

        {deleteConfirm && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteConfirm(false); }}>
            <section role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl">
              <div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive"><Trash2 className="h-5 w-5" aria-hidden /></span><div><h2 id="delete-dialog-title" className="font-display text-xl font-semibold">Delete this source check?</h2><p className="mt-2 leading-6 text-muted-foreground">The temporary PDF check and its report will be removed. You can upload a new PDF afterward.</p></div></div>
              {deleteError && <p role="alert" className="mt-4 text-sm font-bold text-destructive" data-testid="status-delete-error">{deleteError}</p>}
              <div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleteConfirm(false)} disabled={deleteCheck.isPending} data-testid="button-cancel-delete">Keep report</Button><Button variant="destructive" onClick={reset} disabled={deleteCheck.isPending} data-testid="button-confirm-delete">{deleteCheck.isPending ? 'Deleting' : 'Delete check'}</Button></div>
            </section>
          </div>
        )}

        {cancelTarget && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleteCheck.isPending) setCancelTarget(null); }}>
            <section role="alertdialog" aria-modal="true" aria-labelledby="cancel-source-check-title" className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl">
              <div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive"><X className="h-5 w-5" aria-hidden /></span><div><h2 id="cancel-source-check-title" className="font-display text-xl font-semibold">{cancelTarget.status === 'processing' ? 'Stop this review?' : 'Cancel this upload?'}</h2><p className="mt-2 leading-6 text-muted-foreground"><strong className="break-all">{cancelTarget.fileName}</strong> will be removed along with its source check. Other PDFs will not be affected.</p></div></div>
              {cancelError && <p role="alert" className="mt-4 text-sm font-bold text-destructive" data-testid="status-cancel-source-check-error">{cancelError}</p>}
              <div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setCancelTarget(null)} disabled={deleteCheck.isPending}>Keep PDF</Button><Button variant="destructive" onClick={() => void cancelOne()} disabled={deleteCheck.isPending} data-testid="button-confirm-cancel-source-check">{deleteCheck.isPending ? 'Cancelling' : 'Cancel this PDF'}</Button></div>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
