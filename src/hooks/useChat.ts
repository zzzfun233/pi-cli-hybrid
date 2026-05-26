import { useState, useEffect, useRef } from 'react';
import type { ChatSession, Message, WorkspaceInfo } from '../types/types';
import { toChatSession, isDraftSessionId, createDraftChat, parseUserMessageForDisplay } from '../utils/chatUtils';

export function useChat({
  currentWorkspace,
  setCurrentWorkspace,
}: {
  currentWorkspace: WorkspaceInfo | null;
  setCurrentWorkspace: (ws: WorkspaceInfo | null) => void;
}) {
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

  const [isTyping, setIsTyping] = useState(false);

  const currentSessionIdRef = useRef<string | null>(currentSessionId);
  const activeAgentSessionIdRef = useRef<string | null>(null);
  const pendingDraftSessionIdRef = useRef<string | null>(null);
  const userNavigatedRef = useRef<boolean>(false);
  const processedEntryIdsRef = useRef<Set<string>>(new Set());
  const currentWorkspaceRef = useRef<WorkspaceInfo | null>(currentWorkspace);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    currentWorkspaceRef.current = currentWorkspace;
  }, [currentWorkspace]);

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

  // IPC Hooks
  useEffect(() => {
    const api = (window as any).api;
    if (!api) return;

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

    const cleanups: (() => void)[] = [];
    let lastLoadedWorkspace: string | null = null;

    if (api.onSessionMessages) {
      const unsub = api.onSessionMessages(({ sessionId, sessionPath, meta, messages: sessionMsgs }: { sessionId: string; sessionPath?: string; meta?: any; messages: any[] }) => {
        console.log('[Session] Loaded messages:', sessionMsgs.length);

        const convertedMessages: Message[] = [];
        for (const msg of sessionMsgs) {
          if (msg.role === 'user') {
            const display = parseUserMessageForDisplay(msg.text);
            convertedMessages.push({
              id: `session-user-${msg.id || msg.timestamp}`,
              text: display.text,
              sender: 'user',
              attachment: display.attachment
            });
          } else if (msg.role === 'assistant') {
            convertedMessages.push({
              id: `session-ai-${msg.id || msg.timestamp}`,
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
            const convertedUserTexts = new Set(convertedMessages.filter(m => m.sender === 'user').map(m => m.text));
            const pendingLocalMessages = existing.messages.filter(
              m => m.sender === 'user' && m.id?.startsWith('local-user-') && !convertedUserTexts.has(m.text)
            );
            const mergedMessages = [...pendingLocalMessages, ...convertedMessages];
            return prevChats
              .filter(c => c.id !== draftId || c.id === cliSessionId)
              .map(c => c.id === cliSessionId ? { ...c, ...nextChat, messages: mergedMessages } : c);
          }

          if (draftIndex >= 0) {
            const next = [...prevChats];
            next[draftIndex] = nextChat;
            return next;
          }

          return [nextChat, ...prevChats];
        });

        const lastMsg = convertedMessages[convertedMessages.length - 1];
        const isFinished = !lastMsg || (lastMsg.sender === 'ai' && (!lastMsg.history || lastMsg.history.length === 0));
        setIsTyping(!isFinished && convertedMessages.length > 0);
      });
      cleanups.push(unsub);
    }

    if (api.onSessionEntry) {
      const unsub = api.onSessionEntry((entry: any) => {
        if (entry.type !== 'message') return;
        const { role, content } = entry.message;
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

  const normalizePath = (value?: string | null) => {
    return value ? value.replace(/\\/g, '/').toLowerCase() : '';
  };

  const ensurePtyMatchesCurrentChat = async (draftChat?: ChatSession) => {
    const api = (window as any).api;
    if (!api) return;

    const activeId = currentSessionIdRef.current;
    const chat = draftChat || (activeId ? savedChats.find(c => c.id === activeId) : null);

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

  const loadChat = async (id: string, isMobile: boolean, toggleSidebar: (b: boolean) => void) => {
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
    if (isMobile) {
      toggleSidebar(false);
    }
  };

  const startNewChat = async (isTerminalMode: boolean) => {
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
    
    if (isTerminalMode) {
      await ensurePtyMatchesCurrentChat(draftChat);
    }
  };

  const renameChat = (chat: ChatSession) => {
    const nextName = window.prompt('重命名对话', chat.preview);
    if (!nextName) return;
    const trimmedName = nextName.trim();
    if (!trimmedName) return;
    setSavedChats(prev => prev.map(item =>
      item.id === chat.id ? { ...item, preview: trimmedName } : item
    ));
  };

  const togglePinChat = (chat: ChatSession) => {
    setSavedChats(prev => prev.map(item =>
      item.id === chat.id ? { ...item, pinned: !item.pinned } : item
    ));
  };

  const deleteChat = async (id: string) => {
    const chat = savedChats.find(c => c.id === id);
    if (!chat) return false;
    const confirmed = window.confirm(`删除「${chat.preview}」？\n\n这会删除本地会话文件。`);
    if (!confirmed) {
      return false;
    }

    const api = (window as any).api;
    if (chat.sessionPath && api?.deleteSession) {
      const result = await api.deleteSession(chat.sessionPath);
      if (!result?.success) {
        window.alert(`删除失败：${result?.error || '未知错误'}`);
        return false;
      }
    }

    setSavedChats(prev => prev.filter(c => c.id !== id));
    if (currentSessionId === id) {
      setCurrentSessionId(null);
      currentSessionIdRef.current = null;
    }
    return true;
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

  return {
    savedChats,
    setSavedChats,
    currentSessionId,
    setCurrentSessionId,
    currentSessionIdRef,
    activeAgentSessionIdRef,
    userNavigatedRef,
    isTyping,
    setIsTyping,
    loadChat,
    startNewChat,
    renameChat,
    togglePinChat,
    deleteChat,
    toggleMessageHistory,
    ensurePtyMatchesCurrentChat
  };
}
