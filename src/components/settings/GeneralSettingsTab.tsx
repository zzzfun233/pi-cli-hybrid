import { Monitor, Moon, Sun } from 'lucide-react';
import { Toggle } from './settingsShared';

interface GeneralTabProps {
  theme: string;
  setTheme: (t: 'light' | 'dark' | 'system') => void;
  language: 'zh' | 'en';
  setLanguage: (l: 'zh' | 'en') => void;
  sendShortcut: 'enter' | 'ctrl-enter';
  setSendShortcut: (s: 'enter' | 'ctrl-enter') => void;
  saveHistory: boolean;
  setSaveHistory: (b: boolean) => void;
  showThinking: boolean;
  setShowThinking: (b: boolean) => void;
  groupProcessBlocks: boolean;
  setGroupProcessBlocks: (b: boolean) => void;
  collapseProcess: boolean;
  setCollapseProcess: (b: boolean) => void;
  collapseTools: boolean;
  setCollapseTools: (b: boolean) => void;
  processDisplayOrder: 'tool-first' | 'thinking-first';
  setProcessDisplayOrder: (v: 'tool-first' | 'thinking-first') => void;
}

export default function GeneralSettingsTab({
  theme,
  setTheme,
  language,
  setLanguage,
  sendShortcut,
  setSendShortcut,
  saveHistory,
  setSaveHistory,
  showThinking,
  setShowThinking,
  groupProcessBlocks,
  setGroupProcessBlocks,
  collapseProcess,
  setCollapseProcess,
  collapseTools,
  setCollapseTools,
  processDisplayOrder,
  setProcessDisplayOrder,
}: GeneralTabProps) {
  const themeOptions = [
    { key: 'light', label: '浅色', icon: <Sun size={14} /> },
    { key: 'dark', label: '深色', icon: <Moon size={14} /> },
    { key: 'system', label: '系统', icon: <Monitor size={14} /> },
  ] as const;

  return (
    <div className="flex flex-col gap-6 select-none animate-fadeIn pb-4">
      {/* 基础设置 */}
      <div>
        <h3 className="text-[13px] text-gray-400 uppercase tracking-wider mb-2.5 font-semibold">基础设置</h3>
        <div className="flex flex-col gap-3.5 border border-gray-100 rounded-2xl p-4 bg-gray-50/20">
          
          {/* 界面外观 */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5 min-w-0">
              <h4 className="text-[14px] text-gray-700 font-medium">界面外观</h4>
              <p className="text-[12px] text-gray-400">调整应用的主题颜色</p>
            </div>
            <div className="shrink-0 flex items-center bg-gray-100/80 p-1 rounded-lg border border-gray-200/50">
              {themeOptions.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTheme(t.key)}
                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] transition-all ${
                    theme === t.key
                      ? 'bg-white text-gray-900 shadow-sm font-medium'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-gray-100/60" />

          {/* 语言设置 */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5 min-w-0">
              <h4 className="text-[14px] text-gray-700 font-medium">语言设置</h4>
              <p className="text-[12px] text-gray-400">切换界面显示语言</p>
            </div>
            <div className="relative shrink-0 w-[180px]">
              <select
                value={language}
                onChange={e => setLanguage(e.target.value as 'zh' | 'en')}
                className="w-full px-3 py-2 bg-white border border-gray-200 hover:border-gray-300 rounded-xl text-[13px] text-gray-700 outline-none transition-colors cursor-pointer appearance-none shadow-sm"
              >
                <option value="zh">简体中文 (Chinese)</option>
                <option value="en">English (US)</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1 1L5 5L9 1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>

          <div className="h-px bg-gray-100/60" />

          {/* 发送快捷键 */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5 min-w-0">
              <h4 className="text-[14px] text-gray-700 font-medium">发送快捷键</h4>
              <p className="text-[12px] text-gray-400">选择发送消息的组合键</p>
            </div>
            <div className="relative shrink-0 w-[220px]">
              <select
                value={sendShortcut}
                onChange={e => setSendShortcut(e.target.value as 'enter' | 'ctrl-enter')}
                className="w-full px-3 py-2 bg-white border border-gray-200 hover:border-gray-300 rounded-xl text-[13px] text-gray-700 outline-none transition-colors cursor-pointer appearance-none shadow-sm"
              >
                <option value="enter">Enter 发送 / Shift+Enter 换行</option>
                <option value="ctrl-enter">Ctrl + Enter 发送 / Enter 换行</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1 1L5 5L9 1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>

          <div className="h-px bg-gray-100/60" />

          {/* 自动保存对话历史 */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5 min-w-0">
              <h4 className="text-[14px] text-gray-700 font-medium">自动保存对话历史</h4>
              <p className="text-[12px] text-gray-400">在本地离线自动记录您所有的会话，以供随时查阅</p>
            </div>
            <div className="shrink-0">
              <Toggle on={saveHistory} onToggle={() => setSaveHistory(!saveHistory)} />
            </div>
          </div>

        </div>
      </div>

      {/* 功能偏好 */}
      <div>
        <h3 className="text-[13px] text-gray-400 uppercase tracking-wider mb-2.5 font-semibold">功能偏好</h3>
        <div className="flex flex-col gap-3.5 border border-gray-100 rounded-2xl p-4 bg-gray-50/20">
          
          {/* 显示模型思考过程 */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5 min-w-0">
              <h4 className="text-[14px] text-gray-700 font-medium">显示模型思考过程</h4>
              <p className="text-[12px] text-gray-400">开启后，主聊天窗口将渲染大模型的思考状态与推理详情</p>
            </div>
            <div className="shrink-0">
              <Toggle on={showThinking} onToggle={() => setShowThinking(!showThinking)} />
            </div>
          </div>

          <div className="h-px bg-gray-100/60" />

          {/* 合并为总处理块 */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5 min-w-0">
              <h4 className="text-[14px] text-gray-700 font-medium">合并为总处理块</h4>
              <p className="text-[12px] text-gray-400">开启后，同一轮回复前的思考过程和工具调用会合并成一个总块</p>
            </div>
            <div className="shrink-0">
              <Toggle on={groupProcessBlocks} onToggle={() => setGroupProcessBlocks(!groupProcessBlocks)} />
            </div>
          </div>

          <div className="h-px bg-gray-100/60" />

          {/* 默认折叠处理块 */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5 min-w-0">
              <h4 className="text-[14px] text-gray-700 font-medium">默认折叠处理块</h4>
              <p className="text-[12px] text-gray-400">开启后，处理块默认只显示一行摘要，需要时再展开</p>
            </div>
            <div className="shrink-0">
              <Toggle on={collapseProcess} onToggle={() => setCollapseProcess(!collapseProcess)} />
            </div>
          </div>

          <div className="h-px bg-gray-100/60" />

          {/* 折叠工具调用详情 */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5 min-w-0">
              <h4 className="text-[14px] text-gray-700 font-medium">折叠工具调用详情</h4>
              <p className="text-[12px] text-gray-400">开启后，展开思考过程时每条工具调用只显示命令摘要</p>
            </div>
            <div className="shrink-0">
              <Toggle on={collapseTools} onToggle={() => setCollapseTools(!collapseTools)} />
            </div>
          </div>

          <div className="h-px bg-gray-100/60" />

          {/* 处理区显示顺序 */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5 min-w-0">
              <h4 className="text-[14px] text-gray-700 font-medium">处理区显示顺序</h4>
              <p className="text-[12px] text-gray-400">决定工具调用和思考内容在同一轮回复里的先后顺序</p>
            </div>
            <div className="relative shrink-0 w-[140px]">
              <select
                value={processDisplayOrder}
                onChange={e => setProcessDisplayOrder(e.target.value as 'tool-first' | 'thinking-first')}
                className="w-full px-3 py-2 bg-white border border-gray-200 hover:border-gray-300 rounded-xl text-[13px] text-gray-700 outline-none transition-colors cursor-pointer appearance-none shadow-sm"
              >
                <option value="tool-first">工具优先</option>
                <option value="thinking-first">思考优先</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1 1L5 5L9 1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
