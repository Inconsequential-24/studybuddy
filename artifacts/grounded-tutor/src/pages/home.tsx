import { Link } from 'wouter';
import { ArrowRight, BookOpen, CircleAlert, Clock3, FileText, Plus, ScanSearch } from 'lucide-react';
import { useListClassrooms, type ClassroomSummary } from '@workspace/api-client-react';
import { AppShell } from '@/components/shell';
import { ErrorBlock, LoadingBlock, MasteryBar } from '@/components/bits';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/pages/classrooms';
import { ReviewProgress } from '@/components/review-progress';

function ClassroomCard({ classroom }: { classroom: ClassroomSummary }) {
  const ready = classroom.status === 'ready';
  const overviewHref = `/classrooms/${classroom.id}`;
  const learningActions = [
    { label: 'Teaching', href: `${overviewHref}/teach` },
    { label: 'Practice', href: `${overviewHref}/practice` },
    { label: 'Exam', href: `${overviewHref}/exam` },
    { label: 'Progress', href: `${overviewHref}/dashboard` },
  ];

  return (
    <article
      className="group relative overflow-hidden rounded-xl border border-card-border bg-card p-5 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 sm:p-6"
      data-testid={`card-home-classroom-${classroom.id}`}
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-primary/70" aria-hidden="true" />
      <div className="flex flex-wrap items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground" data-testid={`text-home-subject-${classroom.id}`}>
            {classroom.subject || 'Classroom'}
          </p>
          <h3 className="mt-1 truncate font-display text-2xl font-semibold leading-tight">
            <Link href={overviewHref} className="rounded-sm underline-offset-4 hover:underline" data-testid={`link-home-overview-${classroom.id}`}>
              {classroom.name}
            </Link>
          </h3>
        </div>
        <span data-testid={`status-home-classroom-${classroom.id}`}><StatusPill status={classroom.status} /></span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 border-y border-border/80 py-4 sm:grid-cols-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><FileText className="h-4 w-4" aria-hidden="true" /></span>
          <div><p className="text-lg font-bold leading-tight" data-testid={`value-home-pages-${classroom.id}`}>{classroom.pageCount}</p><p className="text-xs text-muted-foreground">PDF pages</p></div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"><BookOpen className="h-4 w-4" aria-hidden="true" /></span>
          <div><p className="text-lg font-bold leading-tight" data-testid={`value-home-concepts-${classroom.id}`}>{classroom.conceptCount}</p><p className="text-xs text-muted-foreground">Concepts</p></div>
        </div>
        {classroom.reviewDueCount > 0 && (
          <div className="col-span-2 flex items-center gap-2.5 sm:col-span-1">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground"><Clock3 className="h-4 w-4" aria-hidden="true" /></span>
            <div><p className="text-lg font-bold leading-tight" data-testid={`value-home-reviews-${classroom.id}`}>{classroom.reviewDueCount}</p><p className="text-xs text-muted-foreground">Reviews due</p></div>
          </div>
        )}
      </div>

      {classroom.status === 'ready' && (
        <div className="mt-4">
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="font-bold">Source coverage</span>
            <span className="font-mono text-muted-foreground" data-testid={`value-home-coverage-${classroom.id}`}>{classroom.coveragePercent}%</span>
          </div>
          <MasteryBar value={classroom.coveragePercent} label={`Source coverage for ${classroom.name}`} />
        </div>
      )}
      {classroom.status === 'processing' && (
        <div className="mt-4 space-y-2">
          <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid={`status-home-processing-${classroom.id}`}>
            <ScanSearch className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            Your pages are being prepared. Learning opens when they are ready.
          </p>
          <ReviewProgress />
        </div>
      )}
      {classroom.status === 'needs-attention' && (
        <p className="mt-4 flex items-center gap-2 text-sm text-destructive" data-testid={`status-home-attention-${classroom.id}`}>
          <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          Review the source pages before starting a learning activity.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {ready ? (
          <>
            <Button asChild size="sm" data-testid={`button-home-teach-${classroom.id}`}>
              <Link href={`${overviewHref}/teach`} className="gap-2">Continue learning <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            </Button>
            {learningActions.slice(1).map((action) => (
              <Button key={action.href} asChild size="sm" variant="outline" data-testid={`button-home-${action.label.toLowerCase()}-${classroom.id}`}>
                <Link href={action.href}>{action.label}</Link>
              </Button>
            ))}
          </>
        ) : (
          <Button asChild size="sm" variant="outline" data-testid={`button-home-review-${classroom.id}`}>
            <Link href={overviewHref}>{classroom.status === 'processing' ? 'View classroom' : 'Review pages'} <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
          </Button>
        )}
      </div>
    </article>
  );
}

export default function Home() {
  const classrooms = useListClassrooms();
  const items = classrooms.data ?? [];
  const readyCount = items.filter((classroom) => classroom.status === 'ready').length;
  const attentionCount = items.filter((classroom) => classroom.status === 'needs-attention').length;

  return (
    <AppShell>
      <div className="space-y-9" data-testid="page-home">
        <section className="relative overflow-hidden rounded-2xl border border-primary/15 bg-secondary/70 px-6 py-8 sm:px-9 sm:py-10" aria-labelledby="home-title">
          <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full border-[28px] border-primary/5" aria-hidden="true" />
          <div className="absolute -right-1 top-7 hidden h-28 w-28 rounded-full border border-primary/15 sm:block" aria-hidden="true" />
          <div className="relative grid grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_10rem] sm:gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-primary">StudyBuddy · Your study space</p>
              <h1 id="home-title" className="mt-3 font-display text-4xl font-semibold leading-[1.08] sm:text-5xl" data-testid="heading-home">
                Pick up where learning begins.
              </h1>
              <p className="mt-4 max-w-xl text-lg text-muted-foreground">
                Choose a classroom to learn from your own PDFs, or add a new set of pages to get started.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg" data-testid="button-home-classrooms">
                  <Link href="/classrooms" className="gap-2">Browse classrooms <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                </Button>
                <Button asChild size="lg" variant="outline" data-testid="button-home-new-classroom">
                  <Link href="/classrooms/new" className="gap-2"><Plus className="h-4 w-4" aria-hidden="true" /> New classroom</Link>
                </Button>
              </div>
            </div>
            <div className="studybuddy-mascot relative z-10 mx-auto aspect-square w-24 sm:w-40 lg:w-60" aria-hidden="true">
              <span className="studybuddy-flying-book studybuddy-flying-book-one"><BookOpen className="h-5 w-5 sm:h-7 sm:w-7" /></span>
              <span className="studybuddy-flying-book studybuddy-flying-book-two"><BookOpen className="h-5 w-5 sm:h-7 sm:w-7" /></span>
              <span className="studybuddy-flying-book studybuddy-flying-book-three"><BookOpen className="h-5 w-5 sm:h-7 sm:w-7" /></span>
              <img src="/images/studybuddy-companion.png" alt="" className="studybuddy-mascot-image h-full w-full object-contain" fetchPriority="high" />
            </div>
          </div>
        </section>

        <section aria-labelledby="classrooms-heading">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">Your learning, organized</p>
              <h2 id="classrooms-heading" className="mt-1 font-display text-3xl font-semibold">Classrooms</h2>
            </div>
            {!classrooms.isLoading && !classrooms.error && items.length > 0 && (
              <p className="text-sm text-muted-foreground" data-testid="text-home-classroom-summary">
                {items.length} {items.length === 1 ? 'classroom' : 'classrooms'}
                {readyCount > 0 && <span> · {readyCount} ready to learn</span>}
                {attentionCount > 0 && <span> · {attentionCount} need{attentionCount === 1 ? 's' : ''} review</span>}
              </p>
            )}
          </div>

          {classrooms.isLoading ? (
            <div className="rounded-xl border bg-card p-5" data-testid="loading-home-classrooms">
              <LoadingBlock label="Loading your classrooms" rows={3} />
            </div>
          ) : classrooms.error ? (
            <div className="rounded-xl border bg-card p-5" data-testid="error-home-classrooms">
              <ErrorBlock error={classrooms.error} onRetry={() => classrooms.refetch()} />
            </div>
          ) : items.length === 0 ? (
            <div className="relative overflow-hidden rounded-xl border border-dashed border-primary/35 bg-card px-6 py-9 sm:px-9" data-testid="empty-home-classrooms">
              <div className="max-w-xl">
                <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-accent text-accent-foreground"><BookOpen className="h-6 w-6" aria-hidden="true" /></span>
                <h3 className="font-display text-2xl font-semibold">Your first classroom starts with a PDF.</h3>
                <p className="mt-2 text-muted-foreground">Add notes, slides, or a textbook chapter. StudyBuddy will build learning activities from those pages.</p>
                <Button asChild className="mt-5" data-testid="button-home-empty-create">
                  <Link href="/classrooms/new" className="gap-2"><Plus className="h-4 w-4" aria-hidden="true" /> Create a classroom</Link>
                </Button>
              </div>
            </div>
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2" data-testid="list-home-classrooms">
              {items.map((classroom) => (
                <li key={classroom.id}>
                  <ClassroomCard classroom={classroom} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-4 rounded-xl border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6" aria-label="StudyBuddy guidance">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Learning activities are available after a classroom is ready. Source review and coverage stay tied to the pages you provided.
          </p>
          <Link href="/settings" className="shrink-0 text-sm font-bold text-primary underline-offset-4 hover:underline" data-testid="link-home-settings">
            Adjust study preferences
          </Link>
        </aside>
      </div>
    </AppShell>
  );
}
