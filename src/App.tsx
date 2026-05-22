import React, { Suspense, lazy, useState, useEffect, useRef, useCallback } from 'react';
import { X, Plus, ArrowUp, PanelLeft, Terminal, ChevronDown, ChevronLeft, ChevronRight, Clipboard, Scissors, Copy, MousePointer2, FolderOpen, Square } from 'lucide-react';
import type { ChatGroup, ChatSession, Message, ModelInfo, WorkspaceInfo } from './types';
import { getTimeGroupLabel, getTimeGroupOrder, toChatSession } from './chatUtils';
import Sidebar from './Sidebar';

const SettingsPanel = lazy(() => import('./SettingsPanel'));
const ChatMessage = lazy(() => import('./ChatMessage'));
const XtermTerminal = lazy(() => import('./XtermTerminal'));

const EMPTY_MESSAGES: Message[] = [];
const DRAFT_SESSION_ID_PREFIX = 'draft-session-';
const ATTACHMENT_BLOCK_RE = /^<blankai-attachment-v1>\n([\s\S]*?)\n<\/blankai-attachment-v1>\n*/;
const LEGACY_ATTACHMENT_RE = /^\[用户附带了(?<kind>图片|文本文件|文件)(?:: (?<legacyName>[^，]+))?，(?<pathHint>[^\]]+)\]\n*/;
const V1_ATTACHMENT_DESCRIPTION_RE = /^用户附带了(?<label>一张图片|一个文本文件|一个文件)。\n文件名: (?<name>[^\n]+)(?:\n本地路径: (?<path>[^\n]+))?(?:\nMIME 类型: (?<type>[^\n]+))?(?:\n大小: (?<size>\d+) bytes)?(?:\n\n文件内容如下:\n```[\s\S]*?\n```\n)?\n*/;

function parseUserMessageForDisplay(rawText: string): { text: string; attachment?: Message['attachment'] } {
  const blockMatch = rawText.match(ATTACHMENT_BLOCK_RE);
  if (blockMatch) {
    try {
      const meta = JSON.parse(blockMatch[1]);
      const afterBlock = rawText.slice(blockMatch[0].length).trimStart();
      const descriptionMatch = afterBlock.match(V1_ATTACHMENT_DESCRIPTION_RE);
      const text = (descriptionMatch
        ? afterBlock.slice(descriptionMatch[0].length)
        : afterBlock
      ).trimStart();
      return {
        text,
        attachment: {
          name: meta.name || (meta.path ? meta.path.split(/[\\/]/).pop() : 'attachment'),
          type: meta.type || '',
          path: meta.path,
          size: meta.size,
          kind: meta.kind
        }
      };
    } catch {
      return { text: rawText };
    }
  }

  const legacyMatch = rawText.match(LEGACY_ATTACHMENT_RE);
  if (legacyMatch?.groups) {
    const pathHint = legacyMatch.groups.pathHint || '';
    const savedPath = pathHint.match(/已保存至[:：]\s*(.+)$/)?.[1]?.trim();
    const legacyName = legacyMatch.groups.legacyName || savedPath?.split(/[\\/]/).pop() || 'attachment';
    return {
      text: rawText.slice(legacyMatch[0].length).trimStart(),
      attachment: {
        name: legacyName,
        type: legacyMatch.groups.kind === '图片' ? 'image/*' : '',
        path: savedPath,
        kind: legacyMatch.groups.kind === '图片' ? 'image' : legacyMatch.groups.kind === '文本文件' ? 'text' : 'file'
      }
    };
  }

  return { text: rawText };
}

function buildAttachmentPrompt(meta: NonNullable<Message['attachment']>, text: string, textContent: string | null) {
  const description = [
    `用户附带了${meta.kind === 'image' ? '一张图片' : meta.kind === 'text' ? '一个文本文件' : '一个文件'}。`,
    `文件名: ${meta.name}`,
    meta.path ? `本地路径: ${meta.path}` : null,
    meta.type ? `MIME 类型: ${meta.type}` : null,
    typeof meta.size === 'number' ? `大小: ${meta.size} bytes` : null,
  ].filter(Boolean).join('\n');

  const fileExtension = meta.name.split('.').pop() || '';
  const inlineText = textContent !== null
    ? `\n\n文件内容如下:\n\`\`\`${fileExtension}\n${textContent}\n\`\`\``
    : '';

  const block = `<blankai-attachment-v1>\n${JSON.stringify({
    ...meta,
    prompt: `${description}${inlineText}`
  })}\n</blankai-attachment-v1>`;
  return `${block}\n${text}`;
}

function isDraftSessionId(sessionId: string | null | undefined) {
  return !!sessionId && sessionId.startsWith(DRAFT_SESSION_ID_PREFIX);
}

function createDraftChat(workspace: WorkspaceInfo | null): ChatSession {
  const now = Date.now();
  return {
    id: `${DRAFT_SESSION_ID_PREFIX}${now}`,
    preview: '新对话',
    messages: [],
    updatedAt: now,
    workspacePath: workspace?.path ?? null,
    workspaceName: workspace?.name ?? '空文件夹',
  };
}

export default function App() {
  const showThinking = (() => {
    try {
      const stored = localStorage.getItem('blankAI_showThinking');
      return stored ? JSON.parse(stored) !== false : true;
    } catch {
      return true;
    }
  })();

  const readBooleanSetting = (key: string, fallback: boolean) => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) !== false : fallback;
    } catch {
      return fallback;
    }
  };

  const readStringSetting = (key: string, fallback: string) => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) || fallback : fallback;
    } catch {
      return fallback;
    }
  };

  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceInfo | null>(() => {
    try {
      const stored = localStorage.getItem('blankAI_currentWorkspace');
      if (stored) {
        const workspace = JSON.parse(stored);
        if (workspace?.path && workspace?.name) return workspace;
      }
    } catch (e) {
      console.error('Failed to parse blankAI_currentWorkspace on init:', e);
    }
    return null;
  });

  const [savedChats, setSavedChats] = useState<ChatSession[]>(() => {
    try {
      const saveHistory = localStorage.getItem('blankAI_saveHistory') !== 'false';
      if (saveHistory) {
        const stored = localStorage.getItem('blankAI_savedChats');
        if (stored) {
          const chats = JSON.parse(stored);
          if (Array.isArray(chats)) return chats;
        }
      }
    } catch (e) {
      console.error('Failed to parse blankAI_savedChats on init:', e);
    }
    return [];
  });

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => {
    try {
      const saveHistory = localStorage.getItem('blankAI_saveHistory') !== 'false';
      if (saveHistory) {
        const stored = localStorage.getItem('blankAI_savedChats');
        if (stored) {
          const chats = JSON.parse(stored);
          if (Array.isArray(chats) && chats.length > 0) {
            return typeof chats[0].id === 'string' ? chats[0].id : null;
          }
        }
      }
    } catch {}
    return null;
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const stored = localStorage.getItem('blankAI_sidebarWidth');
      return stored ? parseInt(stored, 10) : 300;
    } catch {
      return 300;
    }
  });

  useEffect(() => {
    localStorage.setItem('blankAI_sidebarWidth', sidebarWidth.toString());
  }, [sidebarWidth]);

  // Global ESC to interrupt
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const api = (window as any).api;
        if (api?.sendKeybinding) api.sendKeybinding('interrupt');
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const [groupProcessBlocks, setGroupProcessBlocks] = useState(() => readBooleanSetting('blankAI_groupProcessBlocks', true));
  const [collapseProcess, setCollapseProcess] = useState(() => readBooleanSetting('blankAI_collapseProcess', true));
  const [collapseTools, setCollapseTools] = useState(() => readBooleanSetting('blankAI_collapseTools', true));
  const [processDisplayOrder, setProcessDisplayOrder] = useState(() => readStringSetting('blankAI_processDisplayOrder', 'tool-first'));
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Terminal Mode States
  const [showTerminalMode, setShowTerminalMode] = useState(false);
  const [terminalHasOpened, setTerminalHasOpened] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [chatMenu, setChatMenu] = useState<{ chatId: string; x: number; y: number } | null>(null);

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('blankAI_collapsedGroups');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem('blankAI_collapsedGroups', JSON.stringify(collapsedGroups));
  }, [collapsedGroups]);

  useEffect(() => {
    const handleSettingsChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; value?: boolean }>).detail;
      if (detail?.key === 'blankAI_groupProcessBlocks') {
        setGroupProcessBlocks(detail.value !== false);
      } else if (detail?.key === 'blankAI_collapseProcess') {
        setCollapseProcess(detail.value !== false);
      } else if (detail?.key === 'blankAI_collapseTools') {
        setCollapseTools(detail.value !== false);
      } else if (detail?.key === 'blankAI_processDisplayOrder') {
        setProcessDisplayOrder(String(detail.value || 'tool-first'));
      }
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'blankAI_groupProcessBlocks') {
        setGroupProcessBlocks(readBooleanSetting('blankAI_groupProcessBlocks', true));
      } else if (event.key === 'blankAI_collapseProcess') {
        setCollapseProcess(readBooleanSetting('blankAI_collapseProcess', true));
      } else if (event.key === 'blankAI_collapseTools') {
        setCollapseTools(readBooleanSetting('blankAI_collapseTools', true));
      } else if (event.key === 'blankAI_processDisplayOrder') {
        setProcessDisplayOrder(readStringSetting('blankAI_processDisplayOrder', 'tool-first'));
      }
    };

    window.addEventListener('blankAI-settings-change', handleSettingsChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('blankAI-settings-change', handleSettingsChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const toggleGroupCollapse = (key: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Persistence effect for savedChats
  useEffect(() => {
    try {
      const saveHistory = localStorage.getItem('blankAI_saveHistory') !== 'false';
      if (saveHistory) {
        localStorage.setItem('blankAI_savedChats', JSON.stringify(savedChats));
      } else {
        localStorage.removeItem('blankAI_savedChats');
      }
    } catch (e) {
      console.error('Failed to persist savedChats to localStorage:', e);
    }
  }, [savedChats]);
  
  // Model & Thinking States
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [currentModel, setCurrentModel] = useState<ModelInfo | null>(null);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [thinkingLevel, setThinkingLevel] = useState<string>('high');
  const [popoverView, setPopoverView] = useState<'main' | 'models'>('main');

  // Translation helpers for thinking levels
  const getThinkingLabel = (level: string) => {
    const map: Record<string, string> = {
      off: '关闭',
      minimal: '极低',
      low: '低',
      medium: '中',
      high: '高',
      xhigh: '超高'
    };
    return map[level] || '高';
  };

  const getThinkingDesc = (level: string) => {
    const map: Record<string, string> = {
      off: '关闭推理，模型将直接进行响应',
      minimal: '快速概述，极简的思考分析',
      low: '轻度推理，适合简单的逻辑与分析',
      medium: '标准推理，平衡思考速度与智力水平',
      high: '深度推理，强烈推荐用于复杂编程与排错',
      xhigh: '极限推理，最大化模型规划与自我纠错能力'
    };
    return map[level] || '';
  };
  
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const activeAgentSessionIdRef = useRef<string | null>(null);
  const pendingDraftSessionIdRef = useRef<string | null>(null);
  const currentWorkspaceRef = useRef<WorkspaceInfo | null>(currentWorkspace);
  const processedEntryIdsRef = useRef<Set<string>>(new Set());
  // Tracks whether the user has explicitly navigated — blocks backend pushes from hijacking the view
  // Tracks whether the user has explicitly navigated — blocks backend pushes from hijacking the view
  const userNavigatedRef = useRef<boolean>(false);

  // Keep the ref in sync with currentSessionId
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    currentWorkspaceRef.current = currentWorkspace;
    try {
      if (currentWorkspace) {
        localStorage.setItem('blankAI_currentWorkspace', JSON.stringify(currentWorkspace));
      } else {
        localStorage.removeItem('blankAI_currentWorkspace');
      }
    } catch (e) {
      console.error('Failed to persist current workspace:', e);
    }
  }, [currentWorkspace]);

  // Restore workspace and listen for PTY session state on mount
  useEffect(() => {
    const api = (window as any).api;
    if (!api) return;

    const cleanups: (() => void)[] = [];

    // Restore workspace folder
    if (currentWorkspace?.path && api.setWorkspaceFolder) {
      api.setWorkspaceFolder(currentWorkspace.path, { startPty: false }).catch((e: unknown) => {
        console.error('Failed to restore workspace folder:', e);
      });
    }

    // Fetch full model list from CLI
    const fetchModels = () => {
      if (api.getAvailableModels) {
        api.getAvailableModels().then((models: ModelInfo[]) => {
          if (models.length > 0) setModels(models);
        }).catch((e: unknown) => {
          console.error('Failed to fetch models:', e);
        });
      }
    };
    fetchModels();

    const handleProvidersUpdated = () => fetchModels();
    window.addEventListener('providers-updated', handleProvidersUpdated);
    cleanups.push(() => window.removeEventListener('providers-updated', handleProvidersUpdated));

    if (api.listSessions) {
      api.listSessions().then((sessions: any[]) => {
        if (!Array.isArray(sessions)) return;
        const cliChats = sessions.map(toChatSession);
        setSavedChats(prev => {
          const drafts = prev.filter(chat => isDraftSessionId(chat.id) && !chat.sessionPath);
          return [...cliChats, ...drafts];
        });
        if (cliChats.length > 0) {
          setCurrentSessionId(prev => {
            if (prev && (cliChats.some(chat => chat.id === prev) || isDraftSessionId(prev))) return prev;
            return cliChats[0].id;
          });
        }
      }).catch((e: unknown) => {
        console.error('Failed to load CLI sessions:', e);
      });
    }

    if (api.onSessionModelChange) {
      const unsub = api.onSessionModelChange((data: { id: string; provider: string }) => {
        const newModel: ModelInfo = { id: data.id, name: data.id, provider: data.provider };
        setCurrentModel(newModel);
      });
      cleanups.push(unsub);
    }

    if (api.onSessionThinkingLevelChange) {
      const unsub = api.onSessionThinkingLevelChange((data: { thinkingLevel: string }) => {
        if (data.thinkingLevel) setThinkingLevel(data.thinkingLevel);
      });
      cleanups.push(unsub);
    }

    return () => cleanups.forEach(fn => fn());
  }, []);

  // Close model dropdown when clicking outside
  useEffect(() => {
    if (!isModelDropdownOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.model-selector-container')) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isModelDropdownOpen]);

  const currentChat = savedChats.find(c => c.id === currentSessionId);
  const messages = currentChat ? currentChat.messages : EMPTY_MESSAGES;

  const filteredChats = savedChats.filter(chat => 
    chat.preview.toLowerCase().includes(searchQuery.toLowerCase()) || 
    chat.messages.some(m => m.text.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (chat.workspaceName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );
  const conversationTitle = currentChat?.preview || '新对话';
  const activeWorkspaceName = currentChat?.workspaceName || currentWorkspace?.name || '';
  const workspaceLabel = activeWorkspaceName || '空文件夹';
  const visibleChats = [...filteredChats].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });

  const chatGroups = visibleChats.reduce<ChatGroup[]>((groups, chat) => {
    const label = chat.pinned ? '置顶' : getTimeGroupLabel(chat.updatedAt);
    const key = chat.pinned ? '__pinned__' : label;
    let group = groups.find(item => item.key === key);

    if (!group) {
      group = {
        key,
        path: null,
        name: label,
        chats: []
      };
      groups.push(group);
    }

    group.chats.push(chat);
    return groups;
  }, []);

  chatGroups.sort((a, b) => {
    if (a.key === '__pinned__') return -1;
    if (b.key === '__pinned__') return 1;
    return getTimeGroupOrder(a.name) - getTimeGroupOrder(b.name);
  });

  // Scroll to bottom when messages change or typing status changes
  // Only auto-scroll if user is already near the bottom (within 150px)
  const isUserNearBottomRef = useRef(true);

  const handleChatScroll = useCallback(() => {
    const el = chatAreaRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isUserNearBottomRef.current = distanceFromBottom < 150;
  }, []);

  useEffect(() => {
    const el = chatAreaRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleChatScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleChatScroll);
  }, [handleChatScroll]);

  useEffect(() => {
    if (chatAreaRef.current && isUserNearBottomRef.current) {
      chatAreaRef.current.scrollTo({
        top: chatAreaRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isTyping]);

  const toggleSidebar = (show: boolean) => {
    setIsSidebarOpen(show);
  };

  const loadChat = async (id: string) => {
    userNavigatedRef.current = true;
    setCurrentSessionId(id);
    currentSessionIdRef.current = id;
    const chat = savedChats.find(c => c.id === id);
    if (chat) {
      if (chat.workspacePath && chat.workspaceName) {
        if (currentWorkspaceRef.current?.path !== chat.workspacePath) {
          setCurrentWorkspace({ path: chat.workspacePath, name: chat.workspaceName });
        }
      } else {
        setCurrentWorkspace(null);
      }
      const api = (window as any).api;
      if (api?.openSession && chat.sessionPath) {
        const result = await api.openSession(chat.sessionPath);
        if (!result?.success) {
          console.warn('Failed to open CLI session:', result?.error);
        }
      }
    }
    if (window.innerWidth < 768) {
      toggleSidebar(false);
    }
  };

  const normalizePath = (value?: string | null) => {
    return value ? value.replace(/\\/g, '/').toLowerCase() : '';
  };

  const ensurePtyMatchesCurrentChat = async () => {
    const api = (window as any).api;
    if (!api) return;

    const activeId = currentSessionIdRef.current;
    const chat = activeId ? savedChats.find(c => c.id === activeId) : null;

    if (chat && isDraftSessionId(chat.id)) {
      if (api.newSession) {
        const result = await api.newSession(chat.workspacePath || currentWorkspaceRef.current?.path || null);
        if (!result?.success) {
          console.warn('Failed to create a fresh PTY session for draft chat:', result?.error);
        }
      }
      return;
    }

    if (chat?.sessionPath && api.openSession) {
      const status = api.getPtyStatus ? await api.getPtyStatus() : null;
      if (normalizePath(status?.sessionPath) === normalizePath(chat.sessionPath)) return;

      activeAgentSessionIdRef.current = chat.id;
      const result = await api.openSession(chat.sessionPath);
      if (!result?.success) {
        console.warn('Failed to sync PTY to current chat:', result?.error);
      }
      return;
    }

    if (currentWorkspaceRef.current?.path && api.setWorkspaceFolder) {
      await api.setWorkspaceFolder(currentWorkspaceRef.current.path, { startPty: false });
    }

    if (api.startPty) {
      const result = await api.startPty();
      if (!result?.success) {
        console.warn('Failed to start PTY:', result?.error);
      }
    }
  };

  const toggleTerminalMode = async () => {
    if (showTerminalMode) {
      setShowTerminalMode(false);
      return;
    }

    await ensurePtyMatchesCurrentChat();
    setTerminalHasOpened(true);
    setShowTerminalMode(true);
  };

  const renameChat = (chat: ChatSession) => {
    const nextName = window.prompt('重命名对话', chat.preview);
    if (!nextName) return;
    const trimmedName = nextName.trim();
    if (!trimmedName) return;
    setSavedChats(prev => prev.map(item =>
      item.id === chat.id ? { ...item, preview: trimmedName } : item
    ));
    setChatMenu(null);
  };

  const togglePinChat = (chat: ChatSession) => {
    setSavedChats(prev => prev.map(item =>
      item.id === chat.id ? { ...item, pinned: !item.pinned } : item
    ));
    setChatMenu(null);
  };

  const shareChat = async (chat: ChatSession) => {
    const text = chat.sessionPath
      ? `${chat.preview}\n${chat.sessionPath}`
      : chat.preview;
    const api = (window as any).api;
    if (api?.writeClipboardText) {
      await api.writeClipboardText(text);
    } else {
      await navigator.clipboard?.writeText(text);
    }
    setChatMenu(null);
  };

  const deleteChat = async (e: React.MouseEvent | null, id: string) => {
    e?.stopPropagation();
    const chat = savedChats.find(c => c.id === id);
    if (!chat) return;
    const confirmed = window.confirm(`删除「${chat.preview}」？\n\n这会删除本地会话文件。`);
    if (!confirmed) {
      setChatMenu(null);
      return;
    }

    const api = (window as any).api;
    if (chat.sessionPath && api?.deleteSession) {
      const result = await api.deleteSession(chat.sessionPath);
      if (!result?.success) {
        window.alert(`删除失败：${result?.error || '未知错误'}`);
        setChatMenu(null);
        return;
      }
    }

    setSavedChats(prev => prev.filter(c => c.id !== id));
    if (currentSessionId === id) {
      setCurrentSessionId(null);
      currentSessionIdRef.current = null;
    }
    setChatMenu(null);
  };

  const startNewChat = async () => {
    const api = (window as any).api;
    const workspacePath = currentWorkspaceRef.current?.path ?? null;
    const draftChat = createDraftChat(currentWorkspaceRef.current);
    pendingDraftSessionIdRef.current = draftChat.id;
    userNavigatedRef.current = true;
    setSavedChats(prev => {
      const withoutOldDrafts = prev.filter(chat => !isDraftSessionId(chat.id) || chat.sessionPath);
      return [draftChat, ...withoutOldDrafts];
    });
    setCurrentSessionId(draftChat.id);
    currentSessionIdRef.current = draftChat.id;
    activeAgentSessionIdRef.current = draftChat.id;
    setIsTyping(false);
    if (workspacePath && api?.setWorkspaceFolder) {
      const result = await api.setWorkspaceFolder(workspacePath, { startPty: false });
      if (result?.path) {
        setCurrentWorkspace({ path: result.path, name: result.name || result.path });
      }
    } else if (!workspacePath) {
      setCurrentWorkspace(null);
    }
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const selectWorkspaceFolder = async () => {
    const api = (window as any).api;
    if (!api?.selectWorkspaceFolder) return;

    const workspace = await api.selectWorkspaceFolder();
    if (workspace?.path) {
      setCurrentWorkspace(workspace);
      setSearchQuery('');
    }
  };

  const closeContextMenu = () => {
    setContextMenu(null);
    setChatMenu(null);
  };

  const scrollMessageIntoView = (messageId: string | undefined, index: number) => {
    const chatEl = chatAreaRef.current;
    const target = document.getElementById(messageId ? `msg-${messageId}` : `msg-idx-${index}`);
    if (!chatEl || !target) return;

    const chatRect = chatEl.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const max = Math.max(0, chatEl.scrollHeight - chatEl.clientHeight);
    const targetTop = targetRect.top - chatRect.top + chatEl.scrollTop;
    const centeredTop = targetTop - (chatEl.clientHeight - targetRect.height) / 2;

    chatEl.scrollTo({
      top: Math.max(0, Math.min(max, centeredTop)),
      behavior: 'smooth'
    });
  };

  const runInputMenuAction = async (action: 'cut' | 'copy' | 'paste' | 'selectAll' | 'clear') => {
    const input = inputRef.current;
    if (!input) return;

    const api = (window as any).api;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? inputText.length;
    const selectedText = inputText.slice(start, end);

    if (action === 'copy' && selectedText && api?.writeClipboardText) {
      await api.writeClipboardText(selectedText);
    } else if (action === 'cut' && api?.writeClipboardText) {
      if (selectedText) await api.writeClipboardText(selectedText);
      setInputText(inputText.slice(0, start) + inputText.slice(end));
      requestAnimationFrame(() => input.setSelectionRange(start, start));
    } else if (action === 'paste' && api?.readClipboardText) {
      const text = await api.readClipboardText();
      const next = inputText.slice(0, start) + text + inputText.slice(end);
      setInputText(next);
      requestAnimationFrame(() => {
        const caret = start + text.length;
        input.focus();
        input.setSelectionRange(caret, caret);
      });
    } else if (action === 'selectAll') {
      input.focus();
      input.select();
    } else if (action === 'clear') {
      setInputText('');
      requestAnimationFrame(() => input.focus());
    }

    closeContextMenu();
  };

  const toggleMessageHistory = (sessionId: string, messageId: string | undefined, index: number) => {
    setSavedChats(prevChats => prevChats.map(chat => {
      if (chat.id === sessionId) {
        const newMessages = chat.messages.map((m, idx) => {
          if ((m.id && m.id === messageId) || (!m.id && idx === index)) {
            return { ...m, isHistoryOpen: !m.isHistoryOpen };
          }
          return m;
        });
        return { ...chat, messages: newMessages };
      }
      return chat;
    }));
  };

  // ─── Session JSONL data handler (PTY mode) ─────────────────────
  useEffect(() => {
    const api = (window as any).api;
    if (!api) return;

    const cleanups: (() => void)[] = [];

    // Handle full session messages (initial load or session change)
    let lastLoadedWorkspace: string | null = null;
    if (api.onSessionMessages) {
      const unsub = api.onSessionMessages(({ sessionId, sessionPath, meta, messages: sessionMsgs }: { sessionId: string; sessionPath?: string; meta?: any; messages: any[] }) => {
        console.log('[Session] Loaded messages:', sessionMsgs.length);

        // Convert session messages to our Message format
        const convertedMessages: Message[] = [];
        for (const msg of sessionMsgs) {
          if (msg.role === 'user') {
            const display = parseUserMessageForDisplay(msg.text);
            convertedMessages.push({
              id: `session-user-${msg.timestamp}`,
              text: display.text,
              sender: 'user',
              attachment: display.attachment
            });
          } else if (msg.role === 'assistant') {
            convertedMessages.push({
              id: `session-ai-${msg.timestamp}`,
              text: msg.text,
              thinking: msg.thinking || '',
              sender: 'ai',
              history: msg.toolCalls?.map((tc: any) => ({
                type: 'tool',
                toolCallId: tc.id,
                toolName: tc.name,
                toolArgs: JSON.stringify(tc.arguments),
                isError: false
              })) || [],
              isHistoryOpen: !!msg.toolCalls?.length
            });
          } else if (msg.role === 'toolResult') {
            // Find the last assistant message and update its tool history
            const lastAi = convertedMessages.filter(m => m.sender === 'ai').pop();
            if (lastAi && lastAi.history) {
              const toolEntry = lastAi.history.find(
                (h: any) => h.type === 'tool' && (
                  (msg.toolCallId && h.toolCallId === msg.toolCallId) ||
                  (!msg.toolCallId && h.toolName === msg.toolName)
                )
              );
              if (toolEntry) {
                toolEntry.result = msg.isError ? `[Error] ${msg.text}` : msg.text;
                toolEntry.isError = msg.isError;
                lastAi.isHistoryOpen = true;
              }
            }
          }
        }

        const cliSessionId = sessionId;
        const isSameSession = currentSessionIdRef.current === cliSessionId;
        const isEmptySlate = currentSessionIdRef.current === null && !userNavigatedRef.current;
        const isDraftSelection = isDraftSessionId(currentSessionIdRef.current);
        const draftId = pendingDraftSessionIdRef.current;
        const shouldReplaceDraft = isDraftSelection && !!draftId && currentSessionIdRef.current === draftId;
        const shouldAdoptSession = isSameSession || isEmptySlate || shouldReplaceDraft;

        // Only switch to this session if it is the one currently open,
        // or if we have no session at all AND the user hasn't just navigated away.
        if (shouldAdoptSession) {
          setCurrentSessionId(cliSessionId);
          currentSessionIdRef.current = cliSessionId;
          activeAgentSessionIdRef.current = cliSessionId;
          pendingDraftSessionIdRef.current = null;
        }

        const workspacePath = meta?.workspacePath ?? meta?.cwd ?? currentWorkspaceRef.current?.path ?? null;
        const workspaceName = meta?.workspaceName ?? currentWorkspaceRef.current?.name ?? (workspacePath ? workspacePath.split(/[\\/]/).filter(Boolean).pop() : '空文件夹');
        if ((isSameSession || isEmptySlate) && workspacePath) {
          setCurrentWorkspace({ path: workspacePath, name: workspaceName });
        }

        const currentWorkspacePath = workspacePath;
        const isWorkspaceChange = lastLoadedWorkspace !== null && lastLoadedWorkspace !== currentWorkspacePath;
        lastLoadedWorkspace = currentWorkspacePath;

        setSavedChats(prevChats => {
          const existing = prevChats.find(c => c.id === cliSessionId);
          const draftIndex = draftId ? prevChats.findIndex(c => c.id === draftId) : -1;
          const preview = meta?.preview || convertedMessages.find(m => m.sender === 'user')?.text?.slice(0, 18) || '新对话';
          const nextChat = {
            id: cliSessionId,
            preview: preview.length > 18 ? `${preview.substring(0, 18)}...` : preview,
            messages: convertedMessages,
            sessionPath: sessionPath ?? meta?.path,
            updatedAt: meta?.updatedAt ?? Date.now(),
            workspacePath,
            workspaceName
          };

          if (existing) {
            return prevChats
              .filter(c => c.id !== draftId || c.id === cliSessionId)
              .map(c => c.id === cliSessionId ? { ...c, ...nextChat } : c);
          }

          if (draftIndex >= 0) {
            const next = [...prevChats];
            next[draftIndex] = nextChat;
            return next;
          }

          return [nextChat, ...prevChats];
        });

        const lastMsg = convertedMessages[convertedMessages.length - 1];
        const isFinished = !lastMsg || (lastMsg.sender === 'ai' && !lastMsg.isHistoryOpen);
        setIsTyping(!isFinished && convertedMessages.length > 0);
      });
      cleanups.push(unsub);
    }

    // Handle individual session entries (real-time updates)
    if (api.onSessionEntry) {
      const unsub = api.onSessionEntry((entry: any) => {
        if (entry.type !== 'message') return;
        const { role, content } = entry.message;
        // Dedup: skip already processed entries by ID
        if (processedEntryIdsRef.current.has(entry.id)) return;
        processedEntryIdsRef.current.add(entry.id);
        if (processedEntryIdsRef.current.size > 10000) {
          processedEntryIdsRef.current = new Set([...processedEntryIdsRef.current].slice(-5000));
        }

        const activeSessionId = String(entry._sessionId || currentSessionIdRef.current || '');
        if (!activeSessionId) return;

        const currentId = currentSessionIdRef.current;
        const draftId = pendingDraftSessionIdRef.current;
        const shouldAttachDraft = isDraftSessionId(currentId) && !!draftId && currentId === draftId;
        const sessionPath = typeof entry._sessionPath === 'string' ? entry._sessionPath : undefined;
        const resolveEntryChats = (
          prevChats: ChatSession[],
          apply: (chat: ChatSession) => ChatSession
        ) => {
          const workspacePath = currentWorkspaceRef.current?.path ?? null;
          const workspaceName = currentWorkspaceRef.current?.name ?? null;
          const normalizeChat = (chat: ChatSession): ChatSession => ({
            ...chat,
            id: activeSessionId,
            sessionPath: sessionPath || chat.sessionPath,
            workspacePath: chat.workspacePath ?? workspacePath,
            workspaceName: chat.workspaceName ?? workspaceName
          });
          const targetIndex = prevChats.findIndex(chat => chat.id === activeSessionId || (shouldAttachDraft && chat.id === draftId));
          if (targetIndex >= 0) {
            let replacedTarget = false;
            return prevChats.flatMap((chat, index) => {
              const isTarget = index === targetIndex;
              const isStaleDraft = shouldAttachDraft && chat.id === draftId && index !== targetIndex;
              const isDuplicateReal = chat.id === activeSessionId && index !== targetIndex;
              if (isStaleDraft || isDuplicateReal) return [];
              if (!isTarget) return [chat];
              replacedTarget = true;
              return [apply(normalizeChat(chat))];
            }).filter((chat, index, chats) => {
              return chat.id !== activeSessionId || chats.findIndex(item => item.id === activeSessionId) === index || !replacedTarget;
            });
          }

          return [apply({
            id: activeSessionId,
            preview: 'CLI Session',
            messages: [],
            sessionPath,
            workspacePath,
            workspaceName,
            updatedAt: Date.now()
          }), ...prevChats];
        };

        // Never let a background session entry hijack the user's current view.
        // If the entry is for a different session than what's open, ignore it entirely.
        if (currentId && currentId !== activeSessionId && !shouldAttachDraft) {
          return;
        }

        if (shouldAttachDraft) {
          setCurrentSessionId(activeSessionId);
          currentSessionIdRef.current = activeSessionId;
          activeAgentSessionIdRef.current = activeSessionId;
          pendingDraftSessionIdRef.current = null;
        }

        if (role === 'user') {
          const rawText = Array.isArray(content)
            ? content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
            : (typeof content === 'string' ? content : '');
          const display = parseUserMessageForDisplay(rawText);
          const text = display.text;

          setSavedChats(prevChats => {
            return resolveEntryChats(prevChats, chat => {
              const recentUserMsgs = chat.messages.filter(m => m.sender === 'user').slice(-3);
              const isDuplicate = recentUserMsgs.some(m => m.text === text);
              if (isDuplicate) return chat;
              return {
                ...chat,
                preview: chat.preview === '新对话' || chat.preview === 'CLI Session' ? (text.slice(0, 18) || chat.preview) : chat.preview,
                messages: [...chat.messages, { id: `session-user-${entry.id}`, text, sender: 'user' as const, attachment: display.attachment }],
                updatedAt: Date.now()
              };
            });
          });
        } else if (role === 'assistant') {
          const blocks = Array.isArray(content) ? content : [];
          let thinking = '';
          let text = '';
          const toolCalls: any[] = [];

          for (const block of blocks) {
            if (block.type === 'thinking') {
              thinking += block.thinking || '';
            } else if (block.type === 'text') {
              text += block.text || '';
            } else if (block.type === 'toolCall') {
              toolCalls.push({
                id: block.id,
                name: block.name,
                arguments: block.arguments
              });
            }
          }
          if (toolCalls.length === 0) {
            setIsTyping(false);
          }
          setSavedChats(prevChats => {
            return resolveEntryChats(prevChats, chat => {
              if (chat.messages.some(m => m.id === `session-ai-${entry.id}`)) return chat;
              const newMsg: Message = {
                id: `session-ai-${entry.id}`,
                text,
                thinking,
                sender: 'ai',
                history: toolCalls.map(tc => ({
                  type: 'tool',
                  toolCallId: tc.id,
                  toolName: tc.name,
                  toolArgs: JSON.stringify(tc.arguments),
                  isError: false
                })),
                isHistoryOpen: toolCalls.length > 0
              };
              return { ...chat, messages: [...chat.messages, newMsg], updatedAt: Date.now() };
            });
          });
        } else if (role === 'toolResult') {
          const resultText = Array.isArray(entry.message.content)
            ? entry.message.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
            : '';

          setSavedChats(prevChats => prevChats.map(chat => {
            if (chat.id === activeSessionId) {
              const newMessages = chat.messages.map((m, idx) => {
                if (idx === chat.messages.length - 1 && m.sender === 'ai' && m.history) {
                  const updatedHistory = m.history.map((h: any) => {
                    const isMatchingTool = entry.message.toolCallId
                      ? h.toolCallId === entry.message.toolCallId
                      : h.toolName === entry.message.toolName;
                    if (h.type === 'tool' && isMatchingTool && !h.result) {
                      return { ...h, result: entry.message.isError ? `[Error] ${resultText}` : resultText, isError: entry.message.isError };
                    }
                    return h;
                  });
                  return { ...m, history: updatedHistory, isHistoryOpen: true };
                }
                return m;
              });
              return { ...chat, messages: newMessages };
            }
            return chat;
          }));
        }
      });
      cleanups.push(unsub);
    }

    return () => cleanups.forEach(fn => fn());
  }, []);

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            setSelectedFile(file);
            break;
          }
        }
      }
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text && !selectedFile) return;

    const fileToUpload = selectedFile;
    const activeSessionId = currentSessionIdRef.current;

    setInputText('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    setIsTyping(true);
    // Sending a message means the user is actively in this session —
    // clear the navigation lock so the CLI's session-assignment response is accepted.
    userNavigatedRef.current = false;
    activeAgentSessionIdRef.current = currentSessionIdRef.current;

    let finalPrompt = text;

    if (fileToUpload) {
      try {
        const fileData = await new Promise<{ base64: string; textContent: string | null }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const base64 = dataUrl.split(',')[1];
            const isImg = fileToUpload.type.startsWith('image/');
            if (!isImg && fileToUpload.size < 5 * 1024 * 1024) {
              const textReader = new FileReader();
              textReader.onload = () => resolve({ base64, textContent: textReader.result as string });
              textReader.onerror = () => resolve({ base64, textContent: null });
              textReader.readAsText(fileToUpload);
            } else {
              resolve({ base64, textContent: null });
            }
          };
          reader.onerror = reject;
          reader.readAsDataURL(fileToUpload);
        });

        const apiUpload = (window as any).api;
        let savedAbsPath: string | null = null;
        let uploadMeta: any = null;
        if (apiUpload && apiUpload.saveUploadedFile) {
          const result = await apiUpload.saveUploadedFile(fileToUpload.name, fileData.base64, {
            sessionId: currentSessionIdRef.current,
            mimeType: fileToUpload.type,
            size: fileToUpload.size
          });
          if (result?.success && result?.path) {
            savedAbsPath = result.path;
            uploadMeta = result;
          }
        }

        const isImage = fileToUpload.type.startsWith('image/');
        const attachmentMeta: NonNullable<Message['attachment']> = {
          name: uploadMeta?.name || fileToUpload.name,
          type: fileToUpload.type,
          path: savedAbsPath || undefined,
          size: uploadMeta?.size || fileToUpload.size,
          kind: isImage ? 'image' : fileData.textContent !== null ? 'text' : 'file'
        };
        finalPrompt = buildAttachmentPrompt(attachmentMeta, text, fileData.textContent);
      } catch (err) {
        console.error("Failed to read and upload the attached file:", err);
      }
    }

    if (activeSessionId) {
      const optimisticMessage: Message = {
        id: `local-user-${Date.now()}`,
        text,
        sender: 'user',
        attachment: fileToUpload
          ? {
              name: fileToUpload.name,
              type: fileToUpload.type,
              size: fileToUpload.size,
              kind: fileToUpload.type.startsWith('image/')
                ? 'image'
                : fileToUpload.type.startsWith('text/')
                  ? 'text'
                  : 'file'
            }
          : undefined
      };
      const optimisticPreview = (text || fileToUpload?.name || '新对话').slice(0, 18);
      setSavedChats(prevChats => prevChats.map(chat => {
        if (chat.id !== activeSessionId) return chat;
        const isDraft = isDraftSessionId(chat.id);
        return {
          ...chat,
          preview: isDraft && optimisticPreview ? (optimisticPreview.length > 18 ? `${optimisticPreview.slice(0, 18)}...` : optimisticPreview) : chat.preview,
          messages: [...chat.messages, optimisticMessage],
          updatedAt: Date.now()
        };
      }));
    }

    const api = (window as any).api;
    if (api && api.sendPrompt) {
      await ensurePtyMatchesCurrentChat();
      const result = await api.sendPrompt(finalPrompt);
      if (!result?.success) {
        setIsTyping(false);
        setSavedChats(prevChats => prevChats.map(chat =>
          chat.id === currentSessionIdRef.current
            ? { ...chat, messages: [...chat.messages, { id: `send-error-${Date.now()}`, text: `[Error]: ${result?.error || 'PTY is not running'}`, sender: 'ai' }] }
            : chat
        ));
      }
    } else {
      console.warn("Electron API not available");
      setIsTyping(false);
    }
  };

  const renderedMessages = groupProcessBlocks ? groupProcessMessages(messages) : messages;

  return (
    <div className="flex h-screen w-full font-sans overflow-hidden bg-white relative" onClick={closeContextMenu}>

      <Sidebar
        isOpen={isSidebarOpen}
        sidebarWidth={sidebarWidth}
        onSidebarWidthChange={setSidebarWidth}
        searchQuery={searchQuery}
        chatGroups={chatGroups}
        collapsedGroups={collapsedGroups}
        currentSessionId={currentSessionId}
        chatMenu={chatMenu}
        savedChats={savedChats}
        onToggleSidebar={toggleSidebar}
        onStartNewChat={startNewChat}
        onSelectWorkspaceFolder={selectWorkspaceFolder}
        onSearchChange={setSearchQuery}
        onToggleGroup={toggleGroupCollapse}
        onLoadChat={loadChat}
        onOpenChatMenu={setChatMenu}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRenameChat={renameChat}
        onTogglePinChat={togglePinChat}
        onShareChat={shareChat}
        onDeleteChat={(id) => deleteChat(null, id)}
      />

      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 h-full min-h-0 min-w-0 relative">
        <div className="app-titlebar absolute top-0 left-0 right-[140px] h-16 z-[9990]" aria-hidden="true" />

        {/* Top Navbar */}
        <div className="absolute top-0 left-0 w-full flex items-start justify-between px-4 md:px-6 pt-safe pb-8 pt-4 md:pt-5 bg-gradient-to-b from-white via-white/90 to-transparent z-[10000] pointer-events-none">
            <div className="flex items-start gap-4 pointer-events-auto min-w-0 pr-[160px]">
              <div className="flex items-center gap-3 shrink-0">
                {!isSidebarOpen && (
                  <button onClick={() => toggleSidebar(true)} className="text-gray-400 hover:text-gray-800 transition-colors" title="展开侧边栏" style={{ WebkitAppRegion: 'no-drag' } as any}>
                      <PanelLeft size={20} strokeWidth={1.5} />
                  </button>
                )}
                <button onClick={startNewChat} className="text-gray-400 hover:text-gray-800 transition-colors p-1 flex items-center justify-center" title="新建对话" style={{ WebkitAppRegion: 'no-drag' } as any}>
                    <Plus size={20} strokeWidth={1.5} />
                </button>
                <button
                    onClick={selectWorkspaceFolder}
                    className={`text-gray-400 hover:text-gray-800 transition-colors p-1 flex items-center justify-center ${!isSidebarOpen ? '' : 'md:hidden'}`}
                    title="打开新文件夹"
                    style={{ WebkitAppRegion: 'no-drag' } as any}
                >
                    <FolderOpen size={20} strokeWidth={1.5} />
                </button>
              </div>
              <div className="flex flex-col items-start min-w-0 max-w-[520px] select-none">
                <div className="text-[15px] font-semibold text-gray-900 truncate w-full text-left leading-tight">
                  {showTerminalMode ? "Pi CLI Terminal" : conversationTitle}
                </div>
                <div className="text-[11px] text-gray-400 truncate w-full text-left mt-1">
                  {showTerminalMode ? "Real PTY • Interactive Session" : workspaceLabel}
                </div>
              </div>
            </div>
             
            <div className="flex items-center gap-3 pointer-events-auto pr-[140px]" style={{ WebkitAppRegion: 'no-drag' } as any}>
              <button 
                onClick={toggleTerminalMode}
                className={`p-1.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                  showTerminalMode 
                    ? 'bg-gray-900 text-emerald-400 border-gray-800 shadow-[0_0_8px_rgba(52,211,153,0.3)]' 
                    : 'bg-white hover:bg-gray-50 text-gray-400 hover:text-gray-800 border-gray-200'
                }`}
                title={showTerminalMode ? "返回聊天界面" : "切换到 Pi CLI 终端"}
              >
                <Terminal size={18} strokeWidth={showTerminalMode ? 2 : 1.5} />
              </button>
            </div>
        </div>

        {/* Message Outline (Desktop Right Side) */}
        {!showTerminalMode && messages.length > 0 && (
          <div className="hidden lg:flex flex-col absolute right-4 top-[20%] bottom-[25%] w-16 z-30 pointer-events-none items-end justify-center py-4">
            <div className="scrollbar-hidden flex flex-col gap-2 pointer-events-auto pr-2 overflow-y-auto scroll-smooth">
              {messages.map((msg, index) => {
                if (msg.sender !== 'user') return null;
                
                const textContent = msg.text || (msg.attachment ? `[文件] ${msg.attachment.name}` : '');
                
                return (
                  <div 
                    key={msg.id || index} 
                    className="group relative flex items-center justify-end w-full cursor-pointer py-1" 
                    onClick={() => scrollMessageIntoView(msg.id, index)}
                  >
                    <div className="absolute right-5 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-white/95 border border-gray-100 shadow-sm px-2.5 py-1.5 rounded-lg text-[13px] text-gray-500 max-w-[200px] truncate pointer-events-none">
                      {textContent}
                    </div>
                    <div className="w-2.5 h-[2px] rounded-full bg-gray-200 group-hover:bg-gray-400 group-hover:w-4 transition-all duration-300"></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Real PTY Terminal */}
        <div className={`${showTerminalMode ? 'flex' : 'hidden'} flex-1 flex-col bg-[#0b0c0d] h-full relative overflow-hidden pt-12`}>
          {terminalHasOpened && (
            <Suspense fallback={null}>
              <XtermTerminal visible={showTerminalMode} />
            </Suspense>
          )}
        </div>

        {/* Normal Chat Interface */}
        <div className={`${showTerminalMode ? 'hidden' : 'flex'} flex-1 min-h-0 flex-col w-full`}>
          {/* Chat Content */}
          <div ref={chatAreaRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pt-24 pb-32 flex flex-col items-center w-full z-0">
            <div className="w-full max-w-[752px] flex flex-col gap-6">
              <Suspense fallback={null}>
            {renderedMessages.map((msg, index) => {
                const isLastAiMessage = isTyping && msg.sender === 'ai' && index === renderedMessages.length - 1;
                return (
                <ChatMessage
                    key={msg.id || index}
                    message={msg}
                    index={index}
                    currentSessionId={currentSessionId}
                    showThinking={showThinking}
                    collapseProcess={collapseProcess}
                    collapseTools={collapseTools}
                    processDisplayOrder={processDisplayOrder}
                    isStreaming={isLastAiMessage}
                    onToggleHistory={toggleMessageHistory}
                  />
                );
            })}
            </Suspense>
            
            {isTyping && (
                <div className="self-start text-black text-[15px] msg-enter flex items-center h-6">
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                </div>
            )}
           </div>
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 w-full flex justify-center bg-gradient-to-t from-white via-white/95 to-transparent pb-6 pt-12 z-20 pointer-events-none">
          <form onSubmit={handleSend} className="w-full max-w-[752px] px-6 pb-2 flex flex-col gap-3 relative pointer-events-auto">
              {isTyping && (
                  <div className="flex justify-center w-full mb-0 -mt-8">
                      <button
                          type="button"
                          onClick={() => {
                              const api = (window as any).api;
                              if (api?.sendKeybinding) api.sendKeybinding('interrupt');
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-gray-200 text-[12.5px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition-all animate-fade-in-up"
                      >
                          <Square size={10} fill="currentColor" strokeWidth={0} className="text-gray-500" />
                          <span>停止生成</span>
                      </button>
                  </div>
              )}
              {/* Selected File Indicator */}
              {selectedFile && (
                  <div className="self-start flex items-center bg-white border border-gray-200 rounded-full pl-3 pr-1.5 py-1.5 gap-2 shadow-sm text-sm">
                      <span className="text-[13px] text-gray-600 truncate max-w-[200px] font-medium">{selectedFile.name}</span>
                      <button 
                          type="button" 
                          onClick={(e) => {
                              e.preventDefault();
                              setSelectedFile(null);
                              if (fileInputRef.current) fileInputRef.current.value = '';
                          }} 
                          className="p-1 rounded-full text-gray-400 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                          title="移除文件"
                      >
                          <X size={14} strokeWidth={2} />
                      </button>
                  </div>
              )}
              <div className="w-full relative flex items-center bg-white border border-gray-200 rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] focus-within:border-gray-300 focus-within:shadow-[0_4px_20px_rgba(0,0,0,0.08)] transition-all duration-300">
                  <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                              setSelectedFile(e.target.files[0]);
                          }
                      }}
                  />
                                    <button 
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute left-2 p-2 text-gray-400 hover:text-gray-800 transition-colors flex items-center justify-center rounded-full hover:bg-gray-100/80"
                      title="上传文件"
                  >
                      <Plus size={20} strokeWidth={2} />
                  </button>
                  <input 
                      ref={inputRef}
                      type="text" 
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onPaste={handlePaste}
                      onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setContextMenu({ x: e.clientX, y: e.clientY });
                          inputRef.current?.focus();
                      }}
                      onKeyDown={(e) => {
                          const sendShortcut = (() => {
                              try {
                                  const saved = localStorage.getItem('blankAI_sendShortcut');
                                  return saved ? JSON.parse(saved) : 'enter';
                              } catch {
                                  return 'enter';
                              }
                          })();
                          if (e.key === 'Enter') {
                              if (sendShortcut === 'ctrl-enter') {
                                  if (!e.ctrlKey && !e.metaKey) {
                                      e.preventDefault(); // Stop standard enter submission
                                  }
                              } else {
                                  if (e.ctrlKey || e.metaKey || e.shiftKey) {
                                      // Allow modifier operations
                                  }
                              }
                          }
                      }}
                      autoComplete="off" 
                      placeholder="Ask anything" 
                      className="w-full bg-transparent py-3.5 pl-12 pr-48 text-gray-800 text-[15px] placeholder:text-gray-400 placeholder:font-light outline-none rounded-3xl"
                  />
                  <button type="submit" className="hidden" />

                  {contextMenu && (
                      <div
                          className="fixed z-[100000] w-40 rounded-xl border border-gray-200 bg-white/95 shadow-[0_12px_32px_rgba(0,0,0,0.12)] p-1.5 text-[13px] text-gray-700 backdrop-blur-md animate-popover-in"
                          style={{ left: contextMenu.x, bottom: window.innerHeight - contextMenu.y, WebkitAppRegion: 'no-drag' } as any}
                          onClick={(e) => e.stopPropagation()}
                      >
                          <button type="button" onClick={() => runInputMenuAction('cut')} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left">
                              <Scissors size={14} className="text-gray-400" />
                              <span>剪切</span>
                          </button>
                          <button type="button" onClick={() => runInputMenuAction('copy')} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left">
                              <Copy size={14} className="text-gray-400" />
                              <span>复制</span>
                          </button>
                          <button type="button" onClick={() => runInputMenuAction('paste')} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left">
                              <Clipboard size={14} className="text-gray-400" />
                              <span>粘贴</span>
                          </button>
                          <div className="my-1 h-px bg-gray-100" />
                          <button type="button" onClick={() => runInputMenuAction('selectAll')} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left">
                              <MousePointer2 size={14} className="text-gray-400" />
                              <span>全选</span>
                          </button>
                          <button type="button" onClick={() => runInputMenuAction('clear')} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors text-left">
                              <X size={14} className="text-gray-400" />
                              <span>清空</span>
                          </button>
                      </div>
                  )}

                  {/* Model & Thinking Selector Dropdown */}
                  <div className="absolute right-2 flex items-center z-30 model-selector-container">
                      <button 
                          type="button"
                          onClick={(e) => {
                              e.preventDefault();
                              setIsModelDropdownOpen(!isModelDropdownOpen);
                              setPopoverView('main'); // Reset to main pane on open
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-gray-100 transition-all duration-200 text-gray-700 hover:text-black border border-gray-100/50 hover:border-gray-200 bg-white/80 shadow-sm"
                      >
                          <span className="text-[12px] font-medium truncate max-w-[90px] tracking-tight">
                              {currentModel ? currentModel.name : 'Select Model'}
                          </span>
                          <span className="h-3 w-[1px] bg-gray-200"></span>
                          <span className="text-[10px] font-semibold text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded-md tracking-tight select-none">
                              {getThinkingLabel(thinkingLevel)}
                          </span>
                          <ChevronDown size={13} className={`text-gray-400 transition-transform duration-300 ${isModelDropdownOpen ? 'rotate-180 text-black' : ''}`} strokeWidth={2.5} />
                      </button>

                      {/* Dropdown Popover */}
                      {isModelDropdownOpen && (
                          <div className="absolute bottom-[calc(100%+12px)] right-0 w-[260px] bg-white border border-gray-200 rounded-2xl shadow-[0_10px_35px_rgba(0,0,0,0.08)] py-2 z-50 animate-popover-in flex flex-col gap-0.5 pointer-events-auto">
                              {popoverView === 'main' ? (
                                  <>
                                      {/* Pane 1: Thinking Intensity Selection */}
                                      <div className="px-3 py-1 border-b border-gray-100 flex items-center justify-between mb-1">
                                          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">智能 / 思考强度</span>
                                          <span className="text-[9px] text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded-md font-mono select-none">PI NATIVE</span>
                                      </div>
                                      <div className="max-h-[220px] overflow-y-auto px-1.5 py-0.5 custom-scrollbar flex flex-col gap-0.5">
                                          {['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].map((level) => {
                                              const isSelected = thinkingLevel === level;
                                              return (
                                                  <button
                                                      key={level}
                                                      type="button"
                                                      onClick={async () => {
                                                          setThinkingLevel(level);
                                                          const api = (window as any).api;
                                                          const result = await api?.selectThinkingLevel?.(level);
                                                          if (!result?.success) {
                                                              console.warn('Failed to select thinking level:', result?.error);
                                                          }
                                                      }}
                                                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all duration-150 ${
                                                          isSelected 
                                                              ? 'bg-cyan-50 border border-cyan-100/50 text-cyan-800 font-medium' 
                                                              : 'text-gray-700 hover:bg-gray-100 hover:text-black border border-transparent'
                                                      }`}
                                                      title={getThinkingDesc(level)}
                                                  >
                                                      <div className="flex flex-col min-w-0">
                                                          <div className="flex items-center gap-1.5">
                                                              <span className="text-[13px] font-medium">{getThinkingLabel(level)}</span>
                                                              {level === 'high' && (
                                                                  <span className="text-[8px] font-bold text-cyan-600 bg-cyan-100/60 px-1 rounded select-none">推荐</span>
                                                              )}
                                                          </div>
                                                          <span className={`text-[9px] truncate ${isSelected ? 'text-cyan-600' : 'text-gray-400'}`}>
                                                              {getThinkingDesc(level)}
                                                          </span>
                                                      </div>
                                                      {isSelected && (
                                                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-600 ml-2 flex-shrink-0 animate-pulse"></span>
                                                      )}
                                                  </button>
                                              );
                                          })}
                                      </div>
                                      
                                      {/* Separator and Model Trigger */}
                                      <div className="border-t border-gray-100/80 my-1 mx-1.5"></div>
                                      <div className="px-1.5">
                                          <button
                                              type="button"
                                              onClick={() => setPopoverView('models')}
                                              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-gray-700 hover:bg-gray-100 hover:text-black transition-all duration-150"
                                          >
                                              <div className="flex flex-col min-w-0">
                                                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">当前模型</span>
                                                  <span className="text-[13px] font-medium truncate mt-0.5">{currentModel ? currentModel.name : '选择语言模型'}</span>
                                              </div>
                                              <ChevronRight size={14} className="text-gray-400" />
                                          </button>
                                      </div>
                                  </>
                              ) : (
                                  <>
                                      {/* Pane 2: Model Picker */}
                                      <div className="px-2 py-1 border-b border-gray-100 flex items-center gap-1.5 mb-1.5">
                                          <button
                                              type="button"
                                              onClick={() => setPopoverView('main')}
                                              className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-black transition-colors"
                                          >
                                              <ChevronLeft size={14} strokeWidth={2.5} />
                                          </button>
                                          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">选择语言模型</span>
                                      </div>
                                      <div className="px-1.5 py-2 flex flex-col gap-1.5">
                                          {currentModel && (
                                              <div className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 mb-0.5">
                                                  <div className="text-[13px] font-medium text-gray-800">{currentModel.name}</div>
                                                  <div className="text-[10px] text-gray-400 uppercase tracking-wider">{currentModel.provider}</div>
                                              </div>
                                          )}
                                          {models.length > 1 && (
                                              <>
                                                  <div className="h-px bg-gray-100 my-1"></div>
                                                  <div className="text-[10px] text-gray-400 px-1 mb-1">点击模型立即切换</div>
                                                  {models.map((m) => {
                                                      const isSelected = currentModel?.id === m.id && currentModel?.provider === m.provider;
                                                      return (
                                                          <button
                                                              key={`${m.provider}-${m.id}`}
                                                              type="button"
                                                              onClick={async () => {
                                                                  setCurrentModel(m);
                                                                  setIsModelDropdownOpen(false);
                                                                  setPopoverView('main');
                                                                  const api = (window as any).api;
                                                                  const result = await api?.selectModel?.(m.provider, m.id);
                                                                  if (!result?.success) {
                                                                      console.warn('Failed to select model:', result?.error);
                                                                  }
                                                              }}
                                                              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-[12px] transition-colors ${
                                                                  isSelected
                                                                      ? 'bg-gray-900 text-white font-medium shadow-sm'
                                                                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                                                              }`}
                                                              title={`${m.provider}/${m.id}`}
                                                          >
                                                              <span className="truncate">{m.name}</span>
                                                              <span className={`ml-1.5 text-[9px] uppercase tracking-wider flex-shrink-0 ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>{m.provider}</span>
                                                          </button>
                                                      );
                                                  })}
                                              </>
                                          )}
                                      </div>
                                  </>
                              )}
                          </div>
                      )}
                  </div>
              </div>
          </form>
        </div>
        </div>
      </div>

      {/* Settings Panel Modal */}
      {isSettingsOpen && (
        <Suspense fallback={null}>
          <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}

function isProcessOnlyMessage(message: Message) {
  return message.sender === 'ai' &&
    !message.text.trim() &&
    (!!message.thinking || !!message.status || !!message.history?.length);
}

function hasProcessContent(message: Message) {
  return !!message.thinking || !!message.status || !!message.history?.length;
}

function stripProcessContent(message: Message): Message {
  return {
    ...message,
    thinking: '',
    status: undefined,
    history: undefined,
    processMessages: undefined,
    isHistoryOpen: undefined
  };
}

function mergeProcessMessages(processMessages: Message[]): Message {
  const toolCount = processMessages.reduce(
    (count, msg) => count + (msg.history?.filter(step => step.type === 'tool').length || 0),
    0
  );
  const thinking = processMessages
    .map(msg => msg.thinking)
    .filter(Boolean)
    .join('\n\n');

  return {
    id: `process-group-${processMessages[0]?.id || 'start'}`,
    sender: 'ai',
    text: '',
    thinking,
    status: toolCount > 0 ? `已运行 ${toolCount} 条命令` : '已处理',
    history: processMessages.flatMap(msg => msg.history || []),
    processMessages,
    isHistoryOpen: processMessages.some(msg => msg.isHistoryOpen)
  };
}

function groupProcessMessages(messages: Message[]) {
  const grouped: Message[] = [];
  let pendingProcess: Message[] = [];

  const flushProcess = () => {
    if (pendingProcess.length > 0) {
      grouped.push(mergeProcessMessages(pendingProcess));
      pendingProcess = [];
    }
  };

  for (const message of messages) {
    if (isProcessOnlyMessage(message)) {
      pendingProcess.push(message);
    } else if (message.sender === 'ai' && message.text.trim() && hasProcessContent(message)) {
      pendingProcess.push({ ...message, text: '' });
      flushProcess();
      grouped.push(stripProcessContent(message));
    } else if (message.sender === 'ai' && !message.text.trim() && !hasProcessContent(message)) {
      continue;
    } else {
      flushProcess();
      grouped.push(message);
    }
  }

  flushProcess();
  return grouped;
}

