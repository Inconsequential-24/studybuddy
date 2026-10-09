import { useState } from 'react';
import { Link } from 'wouter';
import { formatDistanceToNow } from 'date-fns';
import { Plus, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getListClassroomsQueryKey, useDeleteClassroom, useListClassrooms, type ClassroomSummary } from '@workspace/api-client-react';
import { AppShell } from '@/components/shell';
import { EmptyBlock, ErrorBlock, LoadingBlock, MasteryBar, PageHeader } from '@/components/bits';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

export const statusText: Record<string, string> = { processing: 'Reading your PDFs', ready: 'Ready', 'needs-attention': 'Needs attention' };
export function StatusPill({ status }: { status: string }) {
  const cls = status === 'ready' ? 'bg-primary text-primary-foreground' : status === 'processing' ? 'bg-accent text-accent-foreground' : 'bg-destructive text-destructive-foreground';
  return <span className={'rounded-full px-3 py-1 text-sm font-bold ' + cls}>{statusText[status] ?? status}</span>;
}

export default function Classrooms() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useListClassrooms({ query: { queryKey: getListClassroomsQueryKey(), refetchInterval: (query) => (query.state.data?.some((c) => c.status === 'processing') ? 4000 : false) } });
  const del = useDeleteClassroom();
  const [target, setTarget] = useState<ClassroomSummary | null>(null);
  const confirm = () => {
    if (!target) return;
    del.mutate({ classroomId: target.id }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListClassroomsQueryKey() }); toast({ title: 'Classroom deleted' }); setTarget(null); },
      onError: (e) => { toast({ title: 'Could not delete', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); setTarget(null); },
    });
  };
  const newBtn = <Button asChild><Link href="/classrooms/new" className="gap-2"><Plus className="h-4 w-4" aria-hidden />New classroom</Link></Button>;
  return (
    <AppShell>
      <PageHeader eyebrow="Your study" title="Classrooms" actions={newBtn}>Each classroom is one fixed set of PDFs.</PageHeader>
      {q.isLoading ? <LoadingBlock label="Loading classrooms" /> : q.error ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> :
        !q.data?.length ? <EmptyBlock title="No classrooms yet" action={newBtn}>Upload a PDF of your notes or textbook to begin. Takes about a minute.</EmptyBlock> : (
        <ul className="space-y-4">
          {q.data.map((c) => {
            const avg = c.coveragePercent;
            return (
              <li key={c.id} className="rounded-lg border bg-card p-5" data-testid={'card-classroom-' + c.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold"><Link href={'/classrooms/' + c.id} className="underline-offset-4 hover:underline">{c.name}</Link></h2>
                    <p className="text-muted-foreground">{c.subject || 'No subject'} &middot; updated {formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true })}</p>
                  </div>
                  <StatusPill status={c.status} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                  {[['Pages', c.pageCount], ['Concepts', c.conceptCount], ['Figures', c.figureCount], ['Tables', c.tableCount], ['Reviews due', c.reviewDueCount]].map(([k, v]) => (
                    <div key={k as string}><dt className="text-muted-foreground">{k}</dt><dd className="text-xl font-bold">{v}</dd></div>
                  ))}
                </dl>
                <div className="mt-4"><p className="mb-1 text-sm font-bold">Pages understood</p><MasteryBar value={avg} label={'Source coverage for ' + c.name} /></div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild><Link href={'/classrooms/' + c.id + '/teach'}>Continue learning</Link></Button>
                  <Button asChild variant="outline"><Link href={'/classrooms/' + c.id}>Overview</Link></Button>
                  <Button variant="ghost" onClick={() => setTarget(c)} aria-label={'Delete ' + c.name} className="gap-2 text-destructive"><Trash2 className="h-4 w-4" aria-hidden />Delete</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {target?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This removes the classroom, its PDFs' analysis and all your progress in it. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={confirm} disabled={del.isPending}>Delete classroom</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
