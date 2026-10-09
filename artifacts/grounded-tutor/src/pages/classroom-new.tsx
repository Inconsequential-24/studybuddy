import { useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { FileText, Upload, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getListClassroomsQueryKey, useCreateClassroom, useGetProfile, useRequestUploadUrl } from '@workspace/api-client-react';
import { AppShell } from '@/components/shell';
import { ErrorBlock, LoadingBlock, Notice, PageHeader, Panel } from '@/components/bits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const MAX = 25 * 1024 * 1024;
const mb = (n: number) => (n / 1048576).toFixed(1) + ' MB';

export default function ClassroomNew() {
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const profile = useGetProfile();
  const reqUrl = useRequestUploadUrl();
  const create = useCreateClassroom();
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [errs, setErrs] = useState<string[]>([]);
  const [step, setStep] = useState('');
  const [fail, setFail] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const busy = !!step;

  const add = (list: FileList | null) => {
    if (!list) return;
    const e: string[] = []; const ok: File[] = [];
    Array.from(list).forEach((f) => {
      if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) e.push(f.name + ' is not a PDF.');
      else if (f.size > MAX) e.push(f.name + ' is ' + mb(f.size) + '. The limit is 25 MB per PDF.');
      else if (f.size < 1) e.push(f.name + ' is empty.');
      else ok.push(f);
    });
    setErrs(e); setFiles((cur) => [...cur, ...ok]);
    if (input.current) input.current.value = '';
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault(); setFail('');
    if (!name.trim()) { setErrs(['Give the classroom a name.']); return; }
    if (!files.length) { setErrs(['Add at least one PDF.']); return; }
    setErrs([]);
    try {
      const documents = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setStep('Uploading ' + (i + 1) + ' of ' + files.length + ': ' + f.name);
        const u = await reqUrl.mutateAsync({ data: { name: f.name, size: f.size, contentType: 'application/pdf' } });
        const r = await fetch(u.uploadURL, { method: 'PUT', body: f, headers: { 'Content-Type': 'application/pdf' } });
        if (!r.ok) throw new Error('Upload of ' + f.name + ' failed (' + r.status + ').');
        documents.push({ name: f.name, objectPath: u.objectPath, size: f.size });
      }
      setStep('Creating your classroom');
      const room = await create.mutateAsync({ data: { name: name.trim(), subject: subject.trim() || undefined, documents } });
      qc.invalidateQueries({ queryKey: getListClassroomsQueryKey() });
      nav('/classrooms/' + room.id);
    } catch (e) {
      setFail(e instanceof Error ? e.message : 'Something went wrong.'); setStep('');
    }
  };

  const needsProfile = profile.isSuccess && !profile.data.completed;
  return (
    <AppShell>
      <PageHeader eyebrow="New classroom" title="Add your PDFs">Choose every PDF you want in this classroom now. The set is fixed once created.</PageHeader>
      {profile.isLoading ? <LoadingBlock rows={2} /> : profile.error && (profile.error as { status?: number }).status !== 404 ? <ErrorBlock error={profile.error} onRetry={() => profile.refetch()} /> :
        needsProfile || profile.error ? (
          <Notice>Set your learning preferences first so lessons fit you. <Link href="/onboarding" className="font-bold underline">Open preferences</Link></Notice>
        ) : (
        <form onSubmit={submit} className="max-w-3xl space-y-6" noValidate>
          <Panel>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-1.5"><label htmlFor="cname" className="font-bold">Classroom name</label><Input id="cname" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder="e.g. Cell Biology, Chapter 3" /></div>
              <div className="space-y-1.5"><label htmlFor="csub" className="font-bold">Subject <span className="font-normal text-muted-foreground">(optional)</span></label><Input id="csub" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy} placeholder="e.g. Biology" /></div>
            </div>
          </Panel>
          <Panel title="PDF files">
            <p className="mb-3 text-muted-foreground">PDF only, up to 25 MB each. Scanned pages, figures and tables are read where possible and any gaps are reported.</p>
            <input ref={input} id="pdfs" type="file" accept="application/pdf,.pdf" multiple className="sr-only" onChange={(e) => add(e.target.files)} disabled={busy} />
            <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()} className="gap-2"><Upload className="h-4 w-4" aria-hidden />Choose PDFs</Button>
            {files.length > 0 && (
              <ul className="mt-4 divide-y rounded-md border" aria-label="Selected PDFs">
                {files.map((f, i) => (
                  <li key={f.name + i} className="flex items-center gap-3 p-3">
                    <FileText className="h-5 w-5 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-bold">{f.name}</span><span className="text-sm text-muted-foreground">{mb(f.size)}</span>
                    <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label={'Remove ' + f.name} onClick={() => setFiles((c) => c.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {errs.length > 0 && <ul role="alert" className="space-y-1 font-bold text-destructive">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
          {fail && <ErrorBlock title="Could not create the classroom" error={new Error(fail)} />}
          <div role="status" aria-live="polite" className="font-bold">{step}</div>
          <Button type="submit" size="lg" disabled={busy}>{busy ? 'Working' : 'Create classroom'}</Button>
        </form>
      )}
    </AppShell>
  );
}
