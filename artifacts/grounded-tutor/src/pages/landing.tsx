import { Link } from 'wouter';
import { ArrowRight, BookMarked, ClipboardCheck, GraduationCap, LineChart } from 'lucide-react';
import { Logo, SkipLink } from '@/components/shell';
import { Button } from '@/components/ui/button';

const steps = [
  [BookMarked, 'Teaching', 'Short lessons built from your pages, shaped to how you learn. Explain it back to prove it stuck.'],
  [GraduationCap, 'Practice Arena', 'Recall, quizzes, figure labels and applied problems, each graded against your material.'],
  [ClipboardCheck, 'Examination', 'An adaptive exam that steps up or down, then shows exactly which concepts need work.'],
  [LineChart, 'Progress', 'Mastery, six learning dimensions and reviews that are due. Only real attempts, never filler.'],
] as const;

export default function Landing() {
  return (
    <div className="min-h-[100dvh]">
      <SkipLink />
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Logo />
        <nav aria-label="Account" className="flex items-center gap-2">
          <Button asChild variant="ghost" data-testid="link-landing-getting-started"><Link href="/getting-started">Getting started</Link></Button>
          <Button asChild variant="ghost" data-testid="link-landing-sign-in"><Link href="/sign-in">Sign in</Link></Button>
          <Button asChild data-testid="link-landing-sign-up"><Link href="/sign-up">Create account</Link></Button>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="outline-none">
        <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="mb-4 text-sm font-bold uppercase tracking-widest text-primary">A study companion for your own material</p>
            <h1 className="text-5xl font-semibold leading-[1.05] sm:text-6xl">Master what is on your pages. Nothing else.</h1>
            <p className="mt-6 max-w-xl text-xl text-muted-foreground">Upload your notes, textbook chapters or slides as PDFs. StudyBuddy teaches, quizzes and examines you using only that material, and cites the page every time.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link href="/sign-up" className="gap-2">Start with a PDF <ArrowRight className="h-4 w-4" aria-hidden /></Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="/sign-in">I have an account</Link></Button>
            </div>
          </div>
          <figure className="rounded-xl border bg-card p-6" aria-label="Example of a cited answer">
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Example answer</p>
            <p className="mt-3 text-lg">Diffusion moves particles from high to low concentration until they are evenly spread.</p>
            <blockquote className="mt-4 border-l-4 border-accent-foreground/40 bg-accent/50 p-3 text-sm italic">Your chapter, page 14: &ldquo;Net movement stops when concentration is equal on both sides.&rdquo;</blockquote>
            <figcaption className="mt-4 text-sm text-muted-foreground">If your pages do not cover it, the tutor says so instead of guessing.</figcaption>
          </figure>
        </section>
        <section className="border-y bg-card" aria-labelledby="how">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 id="how" className="mb-8 text-3xl font-semibold">Four short steps, one loop</h2>
            <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map(([Icon, t, d], i) => (
                <li key={t} className={i % 2 ? 'lg:mt-8' : ''}>
                  <Icon className="mb-3 h-7 w-7 text-primary" aria-hidden />
                  <h3 className="text-xl font-semibold">{t}</h3>
                  <p className="mt-2 text-muted-foreground">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-3xl font-semibold">Honest about what it can read</h2>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">Every classroom shows how many pages were understood and which were flagged. Figures and tables are shown from your original PDF, never redrawn. Built for keyboards, screen readers, larger text, high contrast and reduced motion.</p>
        </section>
      </main>
    </div>
  );
}
