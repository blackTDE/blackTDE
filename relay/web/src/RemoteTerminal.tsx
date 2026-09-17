import { useEffect, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

type Props = {
  sessionId: string;
  disabled?: boolean;
  onData: (data: string) => void;
  onResize: (size: { cols: number; rows: number }) => void;
  onReady: (api: { write: (text: string) => void; reset: () => void; fit: () => void }) => void;
};

export function RemoteTerminal({ sessionId, disabled, onData, onResize, onReady }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  const onReadyRef = useRef(onReady);
  const disabledRef = useRef(disabled);
  onDataRef.current = onData;
  onResizeRef.current = onResize;
  onReadyRef.current = onReady;
  disabledRef.current = disabled;

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'underline',
      fontSize: 13,
      fontFamily: "'MesloLGS NF', 'JetBrains Mono', 'SF Mono', Menlo, Monaco, monospace",
      scrollback: 5000,
      convertEol: false,
      theme: {
        background: '#0a0a0a',
        foreground: '#fafafa',
        cursor: '#e5e5e5',
        selectionBackground: 'rgba(249, 115, 22, 0.35)',
        black: '#262626',
        red: '#ff6568',
        green: '#86efac',
        yellow: '#fbbf24',
        blue: '#a1a1a1',
        magenta: '#b66dff',
        cyan: '#40b0a6',
        white: '#e5e5e5',
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    hostRef.current.innerHTML = '';
    term.open(hostRef.current);
    termRef.current = term;
    fitRef.current = fitAddon;

    const dataSub = term.onData((data) => {
      if (!disabledRef.current) {
        onDataRef.current(data);
      }
    });
    const resizeSub = term.onResize((size) => {
      onResizeRef.current(size);
    });

    const fit = () => {
      try {
        fitAddon.fit();
      } catch {
        // container may be hidden
      }
    };
    onReadyRef.current({
      write: (text) => term.write(text),
      reset: () => term.reset(),
      fit,
    });
    const raf = requestAnimationFrame(fit);
    const observer = new ResizeObserver(() => fit());
    observer.observe(hostRef.current);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      dataSub.dispose();
      resizeSub.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  return <div className="terminal-host" ref={hostRef} />;
}
