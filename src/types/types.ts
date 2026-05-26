export interface WorkspaceInfo {
  path: string;
  name: string;
}

export interface Message {
  id?: string;
  text: string;
  sender: 'user' | 'ai';
  processMessages?: Message[];
  thinking?: string;
  status?: string;
  history?: {
    type: 'thinking' | 'tool';
    content?: string;
    toolCallId?: string;
    toolName?: string;
    toolArgs?: string;
    isOpen?: boolean;
    isError?: boolean;
    result?: string;
  }[];
  isHistoryOpen?: boolean;
  attachment?: {
    name: string;
    type: string;
    path?: string;
    size?: number;
    kind?: 'image' | 'text' | 'file';
  };
}

export interface ChatSession {
  id: string;
  preview: string;
  messages: Message[];
  sessionPath?: string;
  updatedAt?: number;
  pinned?: boolean;
  workspacePath?: string | null;
  workspaceName?: string | null;
}

export interface ChatGroup {
  key: string;
  name: string;
  path: string | null;
  chats: ChatSession[];
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}
