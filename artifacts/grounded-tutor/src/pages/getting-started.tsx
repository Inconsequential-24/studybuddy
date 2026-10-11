import { SignedIn, SignedOut } from '@/lib/auth';
import { Link } from 'wouter';
import { ArrowRight, BookOpen, ClipboardCheck, Languages, Upload } from 'lucide-react';
import { useGetProfile, useListClassrooms } from '@workspace/api-client-react';
import { AppShell, Logo, SkipLink } from '@/components/shell';
import { ErrorBlock, LoadingBlock } from '@/components/bits';
import { Button } from '@/components/ui/button';

function StepCard({
  number,
  icon: Icon,
  title,
  children,
  action,
}: {
  number: string;
  icon: typeof Upload;
  title: string;
  children: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <li className="rounded-xl border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground" aria-hidden="true">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Step {number}</p>
          <h2 className="mt-1 font-display text-2xl font-semibold">{title}</h2>
          <div className="mt-2 text-muted-foreground">{children}</div>
          <div className="mt-4">{action}</div>
        </div>
      </div>
    </li>
  );
}

function PreferencesAction() {
  const profile = useGetProfile();
  const missing = (profile.error as { status?: number } | null)?.status === 404;
  const href = profile.data?.completed ? '/settings' : '/onboarding';
  const label = profile.data?.completed ? 'Review learning preferences' : 'Set learning preferences';

  if (profile.error && !missing) {
    return (
      <div className="space-y-3">
        <p role="status">Your saved preferences could not be checked. You can still open them.</p>
        <Button asChild variant="outline" data-testid="link-tour-preferences-error"><Link href="/settings">{label}</Link></Button>
      </div>
    );
  }

  return <Button asChild variant="outline" data-testid="link-tour-preferences"><Link href={href}>{label}</Link></Button>;
}

function AssessmentAction() {
  const classrooms = useListClassrooms();

  if (classrooms.isLoading) return <LoadingBlock rows={1} label="Finding a classroom for your assessment" />;
  if (classrooms.error) return <ErrorBlock title="Could not load classrooms" error={classrooms.error} onRetry={() => classrooms.refetch()} />;

  const ready = (classrooms.data ?? []).filter((classroom) => classroom.status === 'ready');
  if (ready.length > 0) {
    return (
      <div className="space-y-2">
        <p className="mb-2 text-sm font-bold text-foreground">Choose a ready classroom to open its adaptive assessment:</p>
        <ul className="flex flex-wrap gap-2" aria-label="Ready classroom assessments">
          {ready.map((classroom) => (
            <li key={classroom.id}>
              <Button asChild variant="outline" data-testid={`link-tour-exam-${classroom.id}`}>
                <Link href={`/classrooms/${classroom.id}/exam`}>{classroom.name} assessment</Link>
              </Button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (classrooms.data?.length) {
    return (
      <div className="space-y-3">
        <p>No classroom is ready for an assessment yet. Exams open after the PDFs have been read.</p>
        <Button asChild variant="outline" data-testid="link-tour-classrooms"><Link href="/classrooms">Check classroom progress</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p>Add a PDF first. Once its classroom is ready, its adaptive assessment will appear here.</p>
      <Button asChild variant="outline" data-testid="link-tour-upload-from-assessment"><Link href="/classrooms/new">Add your first PDF</Link></Button>
    </div>
  );
}

function TourContent({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="space-y-8" data-testid="page-getting-started">
      <header>
        <p className="text-sm font-bold uppercase tracking-widest text-primary">StudyBuddy · Getting started</p>
        <h1 className="mt-2 max-w-3xl font-display text-4xl font-semibold leading-tight sm:text-5xl">Back to basics: learn from your own material.</h1>
        <p className="mt-4 max-w-3xl text-lg text-muted-foreground">
          Bring the pages you need to study. StudyBuddy builds lessons and questions from those pages, then points you back to the source.
        </p>
      </header>

      <aside className="rounded-xl border-2 border-primary/25 bg-accent/40 p-5 sm:p-6" aria-labelledby="grounding-title">
        <div className="flex items-start gap-3">
          <BookOpen className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h2 id="grounding-title" className="font-display text-2xl font-semibold">Your material is the source.</h2>
            <p className="mt-2 max-w-3xl">
              StudyBuddy teaches from the PDFs you upload. It does not invent lesson facts from outside your material. If your pages do not support an answer, it should say so; citations help you check where an explanation came from.
            </p>
          </div>
        </div>
      </aside>

      <ol className="grid gap-4 lg:grid-cols-2" aria-label="Getting started steps">
        <StepCard number="1" icon={Upload} title="Add the pages you are studying" action={
          <Button asChild data-testid="link-tour-upload">
            <Link href={signedIn ? '/classrooms/new' : '/sign-up'}>
              {signedIn ? 'Upload a PDF' : 'Create an account to upload'}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        }>
          <p>Start a classroom with your notes, textbook chapter, or slides as PDFs. StudyBuddy checks the pages it can read before lessons are available.</p>
        </StepCard>

        <StepCard number="2" icon={Languages} title="Choose how you learn" action={
          signedIn
            ? <PreferencesAction />
            : <Button asChild variant="outline" data-testid="link-tour-preferences-signup"><Link href="/sign-up">Create an account to set preferences</Link></Button>
        }>
          <p>Set your learning language, explanation style, pace, interests, and whether to use interest-based terminology. Interests shape examples, never source facts.</p>
        </StepCard>

        <StepCard number="3" icon={ClipboardCheck} title="Try a source-grounded assessment" action={
          signedIn
            ? <AssessmentAction />
            : <Button asChild variant="outline" data-testid="link-tour-assessment-signup"><Link href="/sign-up">Create an account to start learning</Link></Button>
        }>
          <p>The examination adapts question difficulty to your answers. It becomes available from a classroom after its PDFs are ready.</p>
        </StepCard>

        <StepCard number="4" icon={BookOpen} title="Learn, check, and return to the page" action={
          <Button asChild variant="outline" data-testid="link-tour-classrooms-or-signup"><Link href={signedIn ? '/classrooms' : '/sign-up'}>{signedIn ? 'Open your classrooms' : 'Create an account to begin'}</Link></Button>
        }>
          <p>Lessons, practice, and assessments stay tied to the classroom material. Review citations and original pages as you study.</p>
        </StepCard>
      </ol>
    </div>
  );
}

function PublicTour() {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SkipLink />
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link href="/" aria-label="StudyBuddy home" data-testid="link-tour-home"><Logo /></Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          <Button asChild variant="ghost" data-testid="link-tour-sign-in"><Link href="/sign-in">Sign in</Link></Button>
          <Button asChild data-testid="link-tour-sign-up"><Link href="/sign-up">Create account</Link></Button>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none sm:px-6">
        <TourContent signedIn={false} />
      </main>
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">Tutoring uses classroom PDFs. Optional source checks are separate and are not guarantees of correctness.</footer>
    </div>
  );
}

export default function GettingStarted() {
  return (
    <>
      <SignedIn><AppShell><TourContent signedIn /></AppShell></SignedIn>
      <SignedOut><PublicTour /></SignedOut>
    </>
  );
}
