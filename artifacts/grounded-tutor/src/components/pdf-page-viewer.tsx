import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { AccessibleSourcePage } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';

GlobalWorkerOptions.workerSrc = workerUrl;

export function PdfPageViewer({ url, page, source }: { url: string; page: number; source?: AccessibleSourcePage }) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [nativeText, setNativeText] = useState('');

  useEffect(() => {
    let cancelled = false;
    const task = getDocument({ url, withCredentials: true, isEvalSupported: false });
    setBusy(true);
    setError('');
    void (async () => {
      const pdf = await task.promise;
      const pdfPage = await pdf.getPage(page);
      if (cancelled || !canvas.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const available = Math.max(260, (container.current?.clientWidth ?? 800) - 32);
      const cssScale = Math.min(available / base.width, 1.5) * zoom;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({ scale: cssScale * ratio });
      canvas.current.width = viewport.width;
      canvas.current.height = viewport.height;
      canvas.current.style.width = `${viewport.width / ratio}px`;
      canvas.current.style.height = `${viewport.height / ratio}px`;
      const context = canvas.current.getContext('2d');
      if (!context) throw new Error('Canvas rendering is unavailable.');
      await pdfPage.render({ canvasContext: context, viewport }).promise;
      const text = await pdfPage.getTextContent();
      if (!cancelled) {
        setNativeText(text.items.map((item) => 'str' in item ? item.str : '').join(' '));
        setBusy(false);
      }
    })().catch((err: unknown) => {
      console.warn('PDF page rendering failed', err);
      if (!cancelled) { setError('This page could not be displayed. You can open the original PDF below.'); setBusy(false); }
    });
    return () => { cancelled = true; void task.destroy(); };
  }, [url, page, zoom]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" aria-label="Zoom out of PDF" disabled={zoom <= 0.75} onClick={() => setZoom((v) => Math.max(0.75, v - 0.25))}>−</Button>
        <span className="min-w-12 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button size="sm" variant="outline" aria-label="Zoom into PDF" disabled={zoom >= 2} onClick={() => setZoom((v) => Math.min(2, v + 0.25))}>+</Button>
        <a href={`${url}#page=${page}`} target="_blank" rel="noopener noreferrer" className="ml-auto rounded text-sm font-bold underline">Open original PDF in a new tab</a>
      </div>
      <div ref={container} className="min-h-0 flex-1 overflow-auto rounded border bg-muted p-4">
        {busy && <p role="status" className="mb-3">Displaying the original page…</p>}
        {error && <p role="alert" className="mb-3">{error}</p>}
        <canvas ref={canvas} role="img" aria-label={`Original PDF page ${page}. Accessible text and diagram descriptions follow below.`} className="mx-auto bg-white" />
        <details className="mx-auto mt-5 max-w-3xl rounded border bg-card p-4">
          <summary className="cursor-pointer font-bold">Read accessible page text, figures and tables</summary>
          <div className="mt-4 space-y-5">
            <p className="whitespace-pre-line leading-relaxed">{source?.text || nativeText || 'This scanned page has no embedded text. Its extracted content appears when source mapping completes.'}</p>
            {source?.figures.map((figure) => (
              <section key={figure.id}>
                <h3 className="font-bold">{figure.caption || 'Figure'}</h3>
                <p>{figure.description}</p>
                {figure.labels.length > 0 && <p><strong>Labels:</strong> {figure.labels.join(', ')}</p>}
                {figure.relationships.length > 0 && <ul className="list-disc pl-5">{figure.relationships.map((r, i) => <li key={i}>{r}</li>)}</ul>}
              </section>
            ))}
            {source?.tables.map((table) => (
              <div key={table.id} className="overflow-auto">
                <table className="w-full border-collapse text-sm">
                  <caption className="text-left font-bold">{table.caption || 'Source table'}</caption>
                  <tbody>{table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className="border p-2">{cell}</td>)}</tr>)}</tbody>
                </table>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
