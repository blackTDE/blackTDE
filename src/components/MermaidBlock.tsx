import { useEffect, useState, useRef } from 'react';

let initialized = false;

export function MermaidBlock({ source }: { source: string }) {
  const [svg, setSvg] = useState<string>();
  const [failed, setFailed] = useState(false);
  const containerIdRef = useRef(`mermaid-${Math.random().toString(36).substring(2, 9)}`);

  useEffect(() => {
    let cancelled = false;
    setSvg(undefined);
    setFailed(false);

    if (!source || !source.trim()) {
      return;
    }

    const renderMermaid = async () => {
      try {
        const { default: mermaid } = await import('mermaid');
        if (!initialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'loose',
            theme: 'dark',
            suppressErrorRendering: true,
          });
          initialized = true;
        }

        const renderId = containerIdRef.current;
        const cleanSource = source.trim();

        // Validate syntax first
        const valid = await mermaid.parse(cleanSource).catch(() => false);
        if (!valid) {
          if (!cancelled) setFailed(true);
          return;
        }

        const rendered = await mermaid.render(renderId, cleanSource);
        if (!cancelled) {
          setSvg(rendered.svg);
        }
      } catch (err) {
        console.error('Mermaid render error:', err);
        if (!cancelled) setFailed(true);
      } finally {
        // Clean up any lingering temporary DOM nodes created by mermaid.render
        const element = document.getElementById(containerIdRef.current);
        if (element) {
          element.remove();
        }
      }
    };

    void renderMermaid();

    return () => {
      cancelled = true;
    };
  }, [source]);

  if (failed) {
    return (
      <div className="my-3 overflow-x-auto rounded-lg border border-rose-500/30 bg-surface-2 p-3">
        <div className="text-[10px] font-mono text-rose-400 font-bold mb-1">Mermaid Diagram Error</div>
        <pre className="text-xs text-rose-200 font-mono"><code>{source}</code></pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-3 p-4 rounded-lg border border-surface-3 bg-surface-2/40 flex items-center justify-center text-xs text-zinc-500 font-mono animate-pulse">
        Rendering diagram…
      </div>
    );
  }

  return (
    <div
      className="my-3 overflow-x-auto rounded-lg border border-surface-3 bg-surface-2/60 p-4 flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
