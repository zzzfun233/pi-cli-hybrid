import type { ChatSession, Message } from '../types/types';

export const getRelativeTime = (timestamp: number) => {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

export const toChatSession = (meta: any): ChatSession => ({
  id: String(meta.id),
  preview: meta.preview || 'CLI Session',
  messages: [],
  sessionPath: meta.path,
  updatedAt: meta.updatedAt,
  workspacePath: meta.workspacePath ?? meta.cwd ?? null,
  workspaceName: meta.workspaceName ?? (meta.cwd ? meta.cwd.split(/[\\/]/).filter(Boolean).pop() : '空文件夹'),
});

export const getTimeGroupLabel = (timestamp?: number) => {
  const date = new Date(timestamp || Date.now());
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const ageDays = Math.floor((startOfToday - startOfDate) / 86400000);

  if (ageDays <= 0) return '今天';
  if (ageDays === 1) return '昨天';
  if (ageDays < 7) return '7 天内';
  if (ageDays < 30) return '30 天内';
  return '更早';
};

export const getTimeGroupOrder = (label: string) => {
  const order: Record<string, number> = {
    '今天': 0,
    '昨天': 1,
    '7 天内': 2,
    '30 天内': 3,
    '更早': 4,
  };
  return order[label] ?? 99;
};

export const EMPTY_MESSAGES: Message[] = [];
export const DRAFT_SESSION_ID_PREFIX = 'draft-session-';
export const ATTACHMENT_BLOCK_RE = /^<blankai-attachment-v1>\n([\s\S]*?)\n<\/blankai-attachment-v1>\n*/;
export const LEGACY_ATTACHMENT_RE = /^\[用户附带了(?<kind>图片|文本文件|文件)(?:: (?<legacyName>[^，]+))?，(?<pathHint>[^\]]+)\]\n*/;
export const V1_ATTACHMENT_DESCRIPTION_RE = /^用户附带了(?<label>一张图片|一个文本文件|一个文件)。\n文件名: (?<name>[^\n]+)(?:\n本地路径: (?<path>[^\n]+))?(?:\nMIME 类型: (?<type>[^\n]+))?(?:\n大小: (?<size>\d+) bytes)?(?:\n\n文件内容如下:\n```[\s\S]*?\n```\n)?\n*/;

export function parseUserMessageForDisplay(rawText: string): { text: string; attachment?: Message['attachment'] } {
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

export function buildAttachmentPrompt(meta: NonNullable<Message['attachment']>, text: string, textContent: string | null) {
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

export function isDraftSessionId(sessionId: string | null | undefined) {
  return !!sessionId && sessionId.startsWith(DRAFT_SESSION_ID_PREFIX);
}

export function createDraftChat(workspace: import('../types/types').WorkspaceInfo | null): ChatSession {
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
