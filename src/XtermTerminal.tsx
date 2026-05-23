import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface XtermTerminalProps {
  visible: boolean;
}

export default function XtermTerminal({ visible }: XtermTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const cleanupRef = useRef<(() => void)[]>([]);
  const visibleRef = useRef(visible);


  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  const focusTerminal = useCallback(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;

    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        const api = (window as any).api;
        if (api?.ptyResize) {
          api.ptyResize(terminal.cols, terminal.rows);
        }
        terminal.focus();
      } catch {}
    });
  }, []);

  // Initialize terminal when first shown (not in display:none)
  useEffect(() => {
    if (!containerRef.current || !visible) return;
    if (terminalRef.current) return; // already initialized

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, monospace',
      theme: {
        background: '#0b0c0d',
        foreground: '#e4e4e7',
        cursor: '#10b981',
        cursorAccent: '#0b0c0d',
        selectionBackground: '#264f78',
        black: '#1e1e2e',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#f5c2e7',
        cyan: '#94e2d5',
        white: '#bac2de',
        brightBlack: '#585b70',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4fa',
        brightMagenta: '#f5c2e7',
        brightCyan: '#94e2d5',
        brightWhite: '#a6adc8',
      },
      allowProposedApi: true,
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(containerRef.current);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const api = (window as any).api;
    if (api?.startPty) {
      api.startPty().catch((error: unknown) => {
        terminal.writeln(`\x1b[31m[Failed to start PTY] ${String(error)}\x1b[0m`);
      });
    }

    // Initial fit + resize to trigger CLI re-render
    setTimeout(focusTerminal, 150);

    // Connect PTY output -> terminal
    if (api?.onPtyData) {
      const unsub = api.onPtyData((data: string) => {
        terminal.write(data);
      });
      cleanupRef.current.push(unsub);
    }

    const refreshTerminalLayout = () => {
      try {
        fitAddon.fit();
        terminal.refresh(0, terminal.rows - 1);
      } catch {}
    };
    const scrollDisposable = terminal.onScroll(refreshTerminalLayout);
    cleanupRef.current.push(() => scrollDisposable.dispose());

    // Connect terminal input -> PTY
    terminal.onData((data) => {
      if (api?.ptyInput) {
        api.ptyInput(data);
      }
    });

    // Connect terminal resize -> PTY
    terminal.onResize(({ cols, rows }) => {
      if (api?.ptyResize) {
        api.ptyResize(cols, rows);
      }
    });

    // Handle PTY exit
    if (api?.onPtyExit) {
      const unsub = api.onPtyExit(({ code }: { code: number }) => {
        terminal.writeln('');
        terminal.writeln(`\x1b[33m[Process exited with code ${code}]\x1b[0m`);
        terminal.writeln('\x1b[90mPress any key or send a message to restart...\x1b[0m');
      });
      cleanupRef.current.push(unsub);
    }

    if (api?.onPtyReset) {
      const unsub = api.onPtyReset(() => {
        terminal.clear();
        terminal.reset();
      });
      cleanupRef.current.push(unsub);
    }

    // Handle window resize
    const handleResize = () => {
      focusTerminal();
      refreshTerminalLayout();
    };
    window.addEventListener('resize', handleResize);
    cleanupRef.current.push(() => window.removeEventListener('resize', handleResize));
  }, [focusTerminal, visible]);

  // Cleanup only on unmount (not when visible toggles)
  useEffect(() => {
    return () => {
      cleanupRef.current.forEach(fn => fn());
      cleanupRef.current = [];
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
      fitAddonRef.current = null;
    };
  }, []);

  // Fit when visibility changes
  useEffect(() => {
    if (!visible || !fitAddonRef.current || !terminalRef.current) return;
    focusTerminal();
  }, [focusTerminal, visible]);

  const handleContainerClick = useCallback(() => {
    focusTerminal();
  }, [focusTerminal]);

  return (
    <div
      ref={containerRef}
      className="terminal-shell w-full h-full outline-none"
      onMouseDown={(e) => {
        e.preventDefault();
        handleContainerClick();
      }}
    />
  );
}
