import { type ReactNode } from 'react';
import { Link, useRoute } from 'wouter';
import { useSignOut } from '@/lib/auth';
import { useGetClassroom } from '@workspace/api-client-react';
import { cn } from '@/lib/utils';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <img src={basePath + '/logo.svg'} alt="" width={32} height={32} className="rounded-md" />
      <span className="font-display text-xl font-semibold">StudyBuddy</span>
    </span>
  );
}

function NavLink({ href, active, children, testId }: { href: string; active: boolean; children: ReactNode; testId: string }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined}
      data-testid={testId}
      className={cn('rounded-md px-3 py-2 text-base font-bold', active ? 'bg-accent text-accent-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent')}>
      {children}
    </Link>
  );
}

export function SkipLink() {
  return <a href="#main" className="sr-only z-50 rounded-md bg-accent px-4 py-2 font-bold text-accent-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to main content</a>;
}

function ClassroomNav({ id }: { id: string }) {
  const { data } = useGetClassroom(id);
  const tab = useRouteTab();
  const items = [['', 'Overview'], ['teach', 'Teaching'], ['practice', 'Practice Arena'], ['exam', 'Examination'], ['dashboard', 'Progress']];
  return (
    <div className="border-b bg-card">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="pt-3 text-sm font-bold text-muted-foreground">Classroom</p>
        <p className="font-display text-xl font-semibold">{data?.name ?? 'Loading'}</p>
        <nav aria-label="Classroom sections" className="-mx-2 mt-2 flex gap-1 overflow-x-auto pb-2">
          {items.map(([slug, label]) => {
            const active = (slug === '' && !tab) || slug === tab;
            const locked = ['teach', 'practice', 'exam'].includes(slug) && data?.status !== 'ready';
            if (locked) return <span key={label} aria-disabled="true" title="Learning unlocks after every page is verified" className="whitespace-nowrap border-b-4 border-transparent px-3 py-2 font-bold text-muted-foreground">{label}</span>;
            return (
              <Link key={label} href={'/classrooms/' + id + (slug ? '/' + slug : '')} aria-current={active ? 'page' : undefined}
                data-testid={'link-classroom-nav-' + (slug || 'overview')}
                className={cn('whitespace-nowrap rounded-md border-b-4 px-3 py-2 font-bold', active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
function useRouteTab() {
  const [, p] = useRoute('/classrooms/:id/:tab');
  return p?.tab ?? '';
}

export function AppShell({ children, classroomId }: { children: ReactNode; classroomId?: string }) {
  const signOut = useSignOut();
  const [inClassrooms] = useRoute('/classrooms/*?');
  const [inHome] = useRoute('/home');
  const [inSettings] = useRoute('/settings');
  const [inSourceCheck] = useRoute('/verify-source');
  const [inGettingStarted] = useRoute('/getting-started');
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SkipLink />
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/home" aria-label="StudyBuddy home" data-testid="link-logo-home"><Logo /></Link>
          <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
            <NavLink href="/home" active={inHome} testId="link-nav-home">Home</NavLink>
            <NavLink href="/classrooms" active={inClassrooms} testId="link-nav-classrooms">Classrooms</NavLink>
            <NavLink href="/settings" active={inSettings} testId="link-nav-settings">Settings</NavLink>
            <NavLink href="/getting-started" active={inGettingStarted} testId="link-nav-getting-started">Getting started</NavLink>
            <NavLink href="/verify-source" active={inSourceCheck} testId="link-nav-verify-source">Verify source</NavLink>
            {signOut && <button type="button" data-testid="button-sign-out" onClick={() => signOut(basePath || '/')} className="rounded-md px-3 py-2 text-base font-bold hover:bg-sidebar-accent">Sign out</button>}
          </nav>
        </div>
      </header>
      {classroomId && <ClassroomNav id={classroomId} />}
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none sm:px-6">{children}</main>
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">Tutoring uses classroom PDFs. Optional source checks are separate and are not guarantees of correctness.</footer>
    </div>
  );
}
