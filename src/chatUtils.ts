import type { ChatSession } from './types';

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
