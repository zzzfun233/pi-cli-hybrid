export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
}

export interface McpServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
}

export type SettingsTab = 'general' | 'prompt' | 'providers' | 'skills' | 'tools' | 'mcp' | 'plugins';

export const genId = () => Math.random().toString(36).substring(2, 9);

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
