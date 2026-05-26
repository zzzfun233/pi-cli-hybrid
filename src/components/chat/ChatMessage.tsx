import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Terminal, Copy, Check, FileText, Image as ImageIcon, Paperclip } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-light';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';
import docker from 'react-syntax-highlighter/dist/esm/languages/prism/docker';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import powershell from 'react-syntax-highlighter/dist/esm/languages/prism/powershell';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus';
import type { Message } from '../../types/types';

SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('sh', bash);
SyntaxHighlighter.registerLanguage('shell', bash);
SyntaxHighlighter.registerLanguage('c', c);
SyntaxHighlighter.registerLanguage('cpp', cpp);
SyntaxHighlighter.registerLanguage('csharp', csharp);
SyntaxHighlighter.registerLanguage('cs', csharp);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('diff', diff);
SyntaxHighlighter.registerLanguage('docker', docker);
SyntaxHighlighter.registerLanguage('dockerfile', docker);
SyntaxHighlighter.registerLanguage('go', go);
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('js', javascript);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('md', markdown);
SyntaxHighlighter.registerLanguage('html', markup);
SyntaxHighlighter.registerLanguage('xml', markup);
SyntaxHighlighter.registerLanguage('powershell', powershell);
SyntaxHighlighter.registerLanguage('ps1', powershell);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('py', python);
SyntaxHighlighter.registerLanguage('rust', rust);
SyntaxHighlighter.registerLanguage('rs', rust);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('ts', typescript);
SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('yml', yaml);

// ── Shared copy helper ────────────────────────────────────────────
async function copyText(text: string) {
  const api = (window as any).api;
  if (api?.writeClipboardText) {
    await api.writeClipboardText(text);
  } else {
    await navigator.clipboard?.writeText(text);
  }
}

function CopyButton({ getText, className = '' }: { getText: () => string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await copyText(getText());
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? '已复制' : '复制'}
      className={`flex items-center gap-1 transition-all duration-150 ${className}`}
    >
      {copied ? (
        <Check size={13} className="text-emerald-400" />
      ) : (
        <Copy size={13} />
      )}
      <span className="text-[11px] font-medium">{copied ? '已复制' : '复制'}</span>
    </button>
  );
}

interface ChatMessageProps {
  message: Message;
  index: number;
  currentSessionId: string | null;
  showThinking: boolean;
  collapseProcess: boolean;
  collapseTools: boolean;
  processDisplayOrder: 'tool-first' | 'thinking-first';
  isStreaming?: boolean;
  onToggleHistory: (sessionId: string, messageId: string | undefined, index: number) => void;
}

export default function ChatMessage({
  message,
  index,
  currentSessionId,
  showThinking,
  collapseProcess,
  collapseTools,
  processDisplayOrder,
  isStreaming,
  onToggleHistory,
}: ChatMessageProps) {
  const hasThinking = message.sender === 'ai' && (message.thinking || message.status || (message.history && message.history.length > 0));
  const messageId = message.id ? `msg-${message.id}` : `msg-idx-${index}`;
  const [openTools, setOpenTools] = useState<Record<string, boolean>>({});
  const [closedTools, setClosedTools] = useState<Record<string, boolean>>({});
  const [isProcessOpen, setIsProcessOpen] = useState(() => isStreaming || !collapseProcess);
  const [userToggled, setUserToggled] = useState(false);
  const toolCount = message.history?.filter(step => step.type === 'tool').length || 0;
  const processCount = message.processMessages?.length || 1;
  const processMessages = message.processMessages?.length ? message.processMessages : [message];

  // Keep process open while streaming, unless user explicitly toggled it
  useEffect(() => {
    if (isStreaming && !userToggled) {
      setIsProcessOpen(true);
    }
  }, [isStreaming, userToggled]);

  // When streaming finishes, apply the collapseProcess preference
  const prevStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && !userToggled) {
      setIsProcessOpen(!collapseProcess);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, collapseProcess, userToggled]);

  // React to global collapseProcess setting changes (only for non-streaming messages)
  useEffect(() => {
    if (!isStreaming && !userToggled) {
      setIsProcessOpen(!collapseProcess);
    }
  }, [collapseProcess]);

  const toggleTool = (key: string) => {
    if (collapseTools) {
      setOpenTools(prev => ({ ...prev, [key]: !prev[key] }));
    } else {
      setClosedTools(prev => ({ ...prev, [key]: !prev[key] }));
    }
  };

  return (
    <div
      id={messageId}
      className={`leading-relaxed text-[15px] tracking-wide msg-enter flex flex-col gap-2 ${
        message.sender === 'user'
          ? 'max-w-[85%] self-end items-end'
          : 'w-full self-start items-start'
      }`}
    >
      {message.attachment && (
        <div
          className={`flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-[12.5px] shadow-sm ${
            message.sender === 'user'
              ? 'bg-white border-gray-200 text-gray-600'
              : 'bg-gray-50 border-gray-100 text-gray-500'
          }`}
          title={message.attachment.path || message.attachment.name}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
            {message.attachment.kind === 'image' || message.attachment.type.startsWith('image/')
              ? <ImageIcon size={15} />
              : message.attachment.kind === 'text' || message.attachment.type.startsWith('text/')
                ? <FileText size={15} />
                : <Paperclip size={15} />}
          </span>
          <span className="min-w-0">
            <span className="block max-w-[260px] truncate font-medium text-gray-700">{message.attachment.name}</span>
            <span className="block truncate text-[11px] text-gray-400">
              {message.attachment.kind === 'image' ? '图片' : message.attachment.kind === 'text' ? '文本文件' : '附件'}
              {typeof message.attachment.size === 'number' ? ` · ${formatFileSize(message.attachment.size)}` : ''}
            </span>
          </span>
        </div>
      )}

      {hasThinking && showThinking && (
        <div className="w-full mb-2 select-none">
          <button
            type="button"
            onClick={() => {
              const nextOpen = !isProcessOpen;
              setIsProcessOpen(nextOpen);
              setUserToggled(true);
              if (nextOpen && currentSessionId && message.history?.length && !message.isHistoryOpen) {
                onToggleHistory(currentSessionId, message.id, index);
              }
            }}
            className="flex max-w-full items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/40 px-2.5 py-1.5 text-left text-gray-400 hover:border-gray-200 hover:bg-gray-50 hover:text-gray-700 transition-colors"
            title={isProcessOpen ? 'Collapse process' : 'Expand process'}
          >
            {isProcessOpen ? (
              <ChevronDown size={12} className="flex-shrink-0 text-gray-400" />
            ) : (
              <ChevronRight size={12} className="flex-shrink-0 text-gray-400" />
            )}
            <ProcessLabel status={message.status} toolCount={toolCount} processCount={processCount} />
            {!isProcessOpen && message.thinking && (
              <span className="truncate text-[12px] text-gray-400">
                {message.processMessages?.length ? '点击查看完整处理过程' : message.thinking}
              </span>
            )}
          </button>

          {isProcessOpen && (
            <div className="mt-2 text-[13px] text-gray-400 border-l border-gray-100 pl-3 italic">
              <div className="flex flex-col gap-3">
                {processMessages.map((processMessage, processIndex) => (
                  <div key={processMessage.id || processIndex} className={processIndex > 0 ? 'border-t border-gray-100/50 pt-3' : ''}>
                    {processDisplayOrder === 'thinking-first' ? (
                      <>
                        {processMessage.thinking && (
                          <div className="leading-relaxed">{processMessage.thinking}</div>
                        )}
                        {processMessage.history && (
                          <div className="flex flex-col gap-2 not-italic mt-3">
                            {processMessage.history.map((step, i) => {
                              const toolKey = `${processMessage.id || processIndex}-${step.toolCallId || step.toolName || 'tool'}-${i}`;
                              const isToolOpen = collapseTools
                                ? (step.isOpen || !!openTools[toolKey])
                                : !closedTools[toolKey];
                              const commandLabel = step.type === 'tool'
                                ? getToolCommandLabel(step.toolName, step.toolArgs)
                                : '';

                              return (
                                <div key={i} className="bg-gray-50/50 rounded-lg p-2.5 text-[12px] border border-gray-100/50">
                                  {step.type === 'thinking' && (
                                    <div className="text-gray-500 italic leading-relaxed">{step.content}</div>
                                  )}
                                  {step.type === 'tool' && (
                                    <div className="flex flex-col gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => toggleTool(toolKey)}
                                        className="w-full flex items-center gap-1.5 text-left font-medium text-gray-600 hover:text-gray-900 transition-colors"
                                        title={isToolOpen ? 'Collapse tool output' : 'Expand tool output'}
                                      >
                                        {isToolOpen ? (
                                          <ChevronDown size={12} className="text-gray-400 flex-shrink-0" />
                                        ) : (
                                          <ChevronRight size={12} className="text-gray-400 flex-shrink-0" />
                                        )}
                                        <Terminal size={12} className={step.isError ? 'text-red-400 flex-shrink-0' : 'text-gray-400 flex-shrink-0'} />
                                        <span className="font-mono truncate">{commandLabel}</span>
                                      </button>
                                      {isToolOpen && step.toolArgs && step.toolArgs !== '{}' && (
                                        <div className="text-gray-400 font-mono text-[10px] bg-white px-2 py-1.5 rounded border border-gray-100 overflow-hidden text-ellipsis whitespace-pre-wrap break-all max-h-[100px] overflow-y-auto">
                                          {step.toolArgs}
                                        </div>
                                      )}
                                      {isToolOpen && typeof step.result === 'string' && step.result.length > 0 && (
                                        <div className={`mt-0.5 font-mono text-[11px] px-2 py-1.5 rounded border whitespace-pre-wrap break-words max-h-[260px] overflow-y-auto ${
                                          step.isError
                                            ? 'text-red-500 bg-red-50 border-red-100'
                                            : 'text-gray-600 bg-white border-gray-100'
                                        }`}>
                                          {step.result}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {processMessage.history && (
                          <div className="flex flex-col gap-2 not-italic">
                            {[...processMessage.history].map((step, i) => {
                              const toolKey = `${processMessage.id || processIndex}-${step.toolCallId || step.toolName || 'tool'}-${i}`;
                              const isToolOpen = collapseTools
                                ? (step.isOpen || !!openTools[toolKey])
                                : !closedTools[toolKey];
                              const commandLabel = step.type === 'tool'
                                ? getToolCommandLabel(step.toolName, step.toolArgs)
                                : '';

                              return (
                                <div key={i} className="bg-gray-50/50 rounded-lg p-2.5 text-[12px] border border-gray-100/50">
                                  {step.type === 'thinking' && (
                                    <div className="text-gray-500 italic leading-relaxed">{step.content}</div>
                                  )}
                                  {step.type === 'tool' && (
                                    <div className="flex flex-col gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => toggleTool(toolKey)}
                                        className="w-full flex items-center gap-1.5 text-left font-medium text-gray-600 hover:text-gray-900 transition-colors"
                                        title={isToolOpen ? 'Collapse tool output' : 'Expand tool output'}
                                      >
                                        {isToolOpen ? (
                                          <ChevronDown size={12} className="text-gray-400 flex-shrink-0" />
                                        ) : (
                                          <ChevronRight size={12} className="text-gray-400 flex-shrink-0" />
                                        )}
                                        <Terminal size={12} className={step.isError ? 'text-red-400 flex-shrink-0' : 'text-gray-400 flex-shrink-0'} />
                                        <span className="font-mono truncate">{commandLabel}</span>
                                      </button>
                                      {isToolOpen && step.toolArgs && step.toolArgs !== '{}' && (
                                        <div className="text-gray-400 font-mono text-[10px] bg-white px-2 py-1.5 rounded border border-gray-100 overflow-hidden text-ellipsis whitespace-pre-wrap break-all max-h-[100px] overflow-y-auto">
                                          {step.toolArgs}
                                        </div>
                                      )}
                                      {isToolOpen && typeof step.result === 'string' && step.result.length > 0 && (
                                        <div className={`mt-0.5 font-mono text-[11px] px-2 py-1.5 rounded border whitespace-pre-wrap break-words max-h-[260px] overflow-y-auto ${
                                          step.isError
                                            ? 'text-red-500 bg-red-50 border-red-100'
                                            : 'text-gray-600 bg-white border-gray-100'
                                        }`}>
                                          {step.result}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {processMessage.thinking && (
                          <div className="leading-relaxed mt-3">{processMessage.thinking}</div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {message.text && (
        <div className={`${
          message.sender === 'user'
            ? 'bg-gray-100 text-gray-800 px-4 py-2.5 rounded-[20px] rounded-tr-[4px] text-left'
            : 'text-black w-full relative group/msg'
        }`}>
          {message.sender === 'user' ? (
            message.text
          ) : (
            <>
              <MarkdownMessage text={message.text} />
              {/* Full-message copy button — appears on hover */}
              <div className="flex justify-end mt-1 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150">
                <CopyButton
                  getText={() => message.text}
                  className="text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

function ProcessLabel({ status, toolCount, processCount }: { status?: string; toolCount: number; processCount: number }) {
  return (
    <>
      <span className="font-medium not-italic text-[10px] uppercase tracking-widest flex-shrink-0">
        {status || '已处理'}
      </span>
      {processCount > 1 && (
        <span className="font-mono text-[10px] text-gray-400 flex-shrink-0">
          {processCount} steps
        </span>
      )}
      {status && (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse flex-shrink-0"></span>
      )}
      {toolCount > 0 && (
        <span className="font-mono text-[10px] text-gray-400 flex-shrink-0">
          {toolCount} tools
        </span>
      )}
    </>
  );
}

function getToolCommandLabel(toolName?: string, toolArgs?: string) {
  const name = toolName || 'tool';
  if (!toolArgs || toolArgs === '{}') return name;

  try {
    const args = JSON.parse(toolArgs);
    if (typeof args?.command === 'string') return `${name}: ${args.command}`;
    if (typeof args?.path === 'string') return `${name}: ${args.path}`;
    if (typeof args?.file === 'string') return `${name}: ${args.file}`;
    if (typeof args?.ref_id === 'string') return `${name}: ${args.ref_id}`;
    if (typeof args?.query === 'string') return `${name}: ${args.query}`;
    if (typeof args?.text === 'string') return `${name}: ${args.text.slice(0, 80)}`;
  } catch {
    return `${name}: ${toolArgs.slice(0, 80)}`;
  }

  return name;
}

function MarkdownMessage({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        code({ inline, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || '');
          const codeText = String(children).replace(/\n$/, '');
          return !inline && match ? (
            <div className="rounded-xl overflow-hidden my-4 border border-gray-200/60 shadow-sm">
              <div className="bg-[#1e1e1e] text-gray-400 text-xs px-4 py-2 flex justify-between items-center border-b border-gray-800">
                <span>{match[1]}</span>
                <CopyButton
                  getText={() => codeText}
                  className="text-gray-500 hover:text-gray-200"
                />
              </div>
              <SyntaxHighlighter
                {...props}
                children={codeText}
                style={vscDarkPlus}
                language={match[1]}
                PreTag="div"
                customStyle={{ margin: 0, padding: '1rem', background: '#1e1e1e', fontSize: '13px', lineHeight: '1.5' }}
              />
            </div>
          ) : (
            <code {...props} className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-[13px] font-mono whitespace-pre-wrap">
              {children}
            </code>
          );
        },
        p: ({ children }) => <p className="mb-4 last:mb-0 leading-[1.7]">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-5 mb-4 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 mb-4 space-y-1">{children}</ol>,
        li: ({ children }) => <li className="leading-[1.7]">{children}</li>,
        h1: ({ children }) => <h1 className="text-2xl font-bold mt-6 mb-4">{children}</h1>,
        h2: ({ children }) => <h2 className="text-xl font-bold mt-6 mb-3">{children}</h2>,
        h3: ({ children }) => <h3 className="text-lg font-bold mt-5 mb-2">{children}</h3>,
        a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{children}</a>,
        blockquote: ({ children }) => <blockquote className="border-l-4 border-gray-200 pl-4 italic text-gray-600 my-4">{children}</blockquote>,
        table: ({ children }) => <div className="overflow-x-auto my-4"><table className="w-full text-left border-collapse">{children}</table></div>,
        thead: ({ children }) => <thead className="bg-gray-50/80 border-b border-gray-200">{children}</thead>,
        tbody: ({ children }) => <tbody className="divide-y divide-gray-100">{children}</tbody>,
        tr: ({ children }) => <tr className="hover:bg-gray-50/50 transition-colors">{children}</tr>,
        th: ({ children }) => <th className="px-4 py-3 text-sm font-semibold text-gray-700 whitespace-nowrap">{children}</th>,
        td: ({ children }) => <td className="px-4 py-3 text-sm text-gray-600">{children}</td>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
