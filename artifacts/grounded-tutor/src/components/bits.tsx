import { useState, type ReactNode } from 'react';
import { AlertTriangle, BookOpen, FileText, Inbox } from 'lucide-react';
import { useGetClassroom, type SourceReference } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { isConnectionError } from '@/lib/connection';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PdfPageViewer } from './pdf-page-viewer';

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b pb-6">
      <div className="max-w-2xl">
        {eyebrow && <p className="mb-1 text-sm font-bold uppercase tracking-widest text-muted-foreground">{eyebrow}</p>}
        <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
        {children && <div className="mt-2 text-lg text-muted-foreground">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function LoadingBlock({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
    </div>
  );
}

export function ErrorBlock({ title = 'That did not load', error, onRetry }: { title?: string; error?: unknown; onRetry?: () => void }) {
  const msg = isConnectionError(error)
    ? 'The app could not reach the server. It may be restarting, or your connection may have dropped. Try again shortly.'
    : error instanceof Error ? error.message : undefined;
  return (
    <div role="alert" className="rounded-lg border-2 border-destructive/40 bg-card p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-1 h-5 w-5 text-destructive" aria-hidden />
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {msg && <p className="mt-1 text-muted-foreground">{msg}</p>}
          {onRetry && <Button className="mt-4" variant="outline" onClick={onRetry}>Try again</Button>}
        </div>
      </div>
    </div>
  );
}

export function EmptyBlock({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed bg-card/60 p-10 text-center">
      <Inbox className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
      <h2 className="text-xl font-semibold">{title}</h2>
      {children && <p className="mx-auto mt-2 max-w-md text-muted-foreground">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function MasteryBar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-3">
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} className="h-2.5 w-full min-w-24 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: v + '%' }} />
      </div>
      <span className="w-12 text-right text-sm font-bold tabular-nums">{v}%</span>
    </div>
  );
}

export function Panel({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={'rounded-lg border bg-card p-5 sm:p-6 ' + className}>
      {title && <h2 className="mb-3 text-xl font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export function SourceViewer({ classroomId, open, onOpenChange, page, docId }: { classroomId: string; open: boolean; onOpenChange: (o: boolean) => void; page: number; docId?: string }) {
  const { data } = useGetClassroom(classroomId);
  const docs = data?.documents ?? [];
  const [sel, setSel] = useState<string | undefined>(docId);
  let offset = 0;
  const source = docs.find((d) => {
    if (page <= offset + d.pageCount) return true;
    offset += d.pageCount;
    return false;
  });
  const doc = docs.find((d) => d.id === (sel ?? docId)) ?? source ?? docs[0];
  const localPage = docId ? page : sel && sel !== source?.id ? 1 : Math.max(1, page - offset);
  const globalPage = docs.slice(0, docs.findIndex((d) => d.id === doc?.id)).reduce((sum, d) => sum + d.pageCount, 0) + localPage;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90dvh] max-w-5xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{doc ? doc.name : 'Original PDF'}, page {localPage}</DialogTitle>
          <DialogDescription>Your original file, shown exactly as uploaded.</DialogDescription>
        </DialogHeader>
        {docs.length > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor="viewer-doc" className="text-sm font-bold">Document</label>
            <select id="viewer-doc" className="rounded-md border border-input bg-card px-2 py-1" value={doc?.id} onChange={(e) => setSel(e.target.value)}>
              {docs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}
        {doc ? (
          <PdfPageViewer key={doc.id + localPage} url={'/api/storage' + doc.objectPath} page={localPage} source={data?.sourcePages?.find((p) => p.page === globalPage)} />
        ) : <LoadingBlock rows={2} />}
      </DialogContent>
    </Dialog>
  );
}

export function PageButton({ classroomId, page, label }: { classroomId: string; page: number; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-1.5">
        <FileText className="h-4 w-4" aria-hidden />{label ?? 'Page ' + page}
      </Button>
      {open && <SourceViewer classroomId={classroomId} open={open} onOpenChange={setOpen} page={page} />}
    </>
  );
}

export function Citations({ classroomId, citations }: { classroomId: string; citations: SourceReference[] }) {
  if (!citations?.length) return null;
  return (
    <div className="mt-4 rounded-md bg-muted p-4">
      <h3 className="mb-2 flex items-center gap-2 text-base font-bold" style={{ fontFamily: 'var(--app-font-sans)' }}><BookOpen className="h-4 w-4" aria-hidden />From your pages</h3>
      <ul className="space-y-3">
        {citations.map((c, i) => (
          <li key={i} className="flex flex-wrap items-start gap-3">
            <PageButton classroomId={classroomId} page={c.page} label={(c.kind !== 'text' ? c.kind + ', ' : '') + 'page ' + c.page} />
            <blockquote className="min-w-0 flex-1 border-l-4 border-accent-foreground/30 pl-3 text-sm italic">{c.label ? c.label + ': ' : ''}{c.quote}</blockquote>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-accent-foreground/30 bg-accent p-4 text-accent-foreground">{children}</p>;
}
