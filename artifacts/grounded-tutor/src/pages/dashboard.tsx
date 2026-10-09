import { Link, useParams } from 'wouter';
import { formatDistanceToNow } from 'date-fns';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts';
import { useGetClassroomDashboard } from '@workspace/api-client-react';
import { AppShell } from '@/components/shell';
import { EmptyBlock, ErrorBlock, LoadingBlock, MasteryBar, PageHeader, Panel } from '@/components/bits';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  const { id = '' } = useParams<{ id: string }>();
  const q = useGetClassroomDashboard(id);
  const d = q.data;
  return (
    <AppShell classroomId={id}>
      <PageHeader eyebrow="Progress" title="Where you stand">Built only from your real attempts.</PageHeader>
      {q.isLoading ? <LoadingBlock rows={4} /> : q.error || !d ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> : (
        <div className="space-y-6">
          <Panel title="Recommended next step">
            <p className="text-lg">{d.recommendation}</p>
            <div className="mt-3 flex gap-2"><Button asChild><Link href={'/classrooms/' + id + '/teach'}>Teaching</Link></Button><Button asChild variant="outline"><Link href={'/classrooms/' + id + '/practice'}>Practice Arena</Link></Button></div>
          </Panel>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Learning dimensions">
              <div className="h-72" aria-hidden>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={d.dimensions} outerRadius="75%">
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="name" tick={{ fill: 'hsl(var(--foreground))', fontSize: 13 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar dataKey="score" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.3} isAnimationActive={false} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <table className="mt-3 w-full text-left"><caption className="sr-only">Scores by learning dimension</caption>
                <thead className="sr-only"><tr><th>Dimension</th><th>Score</th></tr></thead>
                <tbody>{d.dimensions.map((x) => <tr key={x.name} className="border-t"><th scope="row" className="py-1.5 font-normal">{x.name}</th><td className="py-1.5 text-right font-bold tabular-nums">{Math.round(x.score)}%</td></tr>)}</tbody></table>
            </Panel>
            <Panel title="Reviews due">
              {d.reviewDue.length === 0 ? <p className="text-muted-foreground">Nothing is due for review right now.</p> : (
                <ul className="divide-y">{d.reviewDue.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-3"><span className="font-bold">{c.title}</span>
                    <Button asChild size="sm" variant="outline"><Link href={'/classrooms/' + id + '/teach?concept=' + c.id}>Review</Link></Button></li>))}</ul>
              )}
            </Panel>
          </div>
          <Panel title="Concept mastery">
            {d.concepts.length === 0 ? <p className="text-muted-foreground">No concepts yet.</p> : (
              <ul className="space-y-4">{d.concepts.map((c) => (<li key={c.id}><p className="font-bold">{c.title}</p><MasteryBar value={c.mastery} label={'Mastery of ' + c.title} /></li>))}</ul>)}
          </Panel>
          <Panel title="Recent attempts">
            {d.recentAttempts.length === 0 ? <EmptyBlock title="No attempts yet">Try a practice set or a lesson explain-back and it will show up here.</EmptyBlock> : (
              <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b text-sm text-muted-foreground"><th className="py-2">Activity</th><th>Concept</th><th>Score</th><th>When</th></tr></thead>
                <tbody>{d.recentAttempts.map((a, i) => (<tr key={i} className="border-b last:border-0"><td className="py-2">{a.activity}</td><td>{a.concept}</td><td className="font-bold tabular-nums">{Math.round(a.score)}%</td><td className="text-muted-foreground">{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</td></tr>))}</tbody></table></div>
            )}
          </Panel>
        </div>
      )}
    </AppShell>
  );
}
