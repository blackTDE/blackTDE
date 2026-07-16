import { useEffect, useId, useState } from 'react';

export function MermaidBlock({ source }: { source: string }) {
  const id = `mermaid-${useId().replace(/:/g, '')}`;
  const [svg, setSvg] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSvg(undefined);
    setFailed(false);

    void import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark' });
      try {
        const rendered = await mermaid.render(id, source);
        if (!cancelled) setSvg(rendered.svg);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }).catch(() => {
      if (!cancelled) setFailed(true);
    });

    return () => { cancelled = true; };
  }, [id, source]);

  if (failed) {
    return <pre className="my-3 overflow-x-auto rounded-lg border border-rose-500/30 bg-surface-2 p-3 text-xs text-rose-200"><code>{source}</code></pre>;
  }
  if (!svg) return <div className="my-3 text-xs text-zinc-500">Rendering diagram…</div>;
  return <div className="my-3 overflow-x-auto rounded-lg border border-surface-3 bg-surface-2 p-3" dangerouslySetInnerHTML={{ __html: svg }} />;
}
