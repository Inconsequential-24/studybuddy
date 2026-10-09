import { useLocation } from 'wouter';
import { useGetProfile } from '@workspace/api-client-react';
import { ProfileForm } from '@/components/profile-form';
import { AppShell } from '@/components/shell';
import { ErrorBlock, LoadingBlock, PageHeader } from '@/components/bits';

export default function Onboarding() {
  const [, nav] = useLocation();
  const q = useGetProfile();
  const missing = (q.error as { status?: number } | null)?.status === 404;
  return (
    <AppShell>
      <PageHeader eyebrow="Step 1 of 1" title="Tell us how you learn">Eight quick answers. Every lesson and question is shaped by them, and you can change them any time.</PageHeader>
      {q.isLoading ? <LoadingBlock rows={4} /> : q.error && !missing ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> :
        <div className="max-w-3xl"><ProfileForm initial={q.data} submitLabel="Save and continue" onSaved={() => nav('/classrooms')} /></div>}
    </AppShell>
  );
}
