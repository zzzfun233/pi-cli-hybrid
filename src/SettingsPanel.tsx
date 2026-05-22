import React, { useState, useEffect } from 'react';
import { X, Plus, Settings, Sparkles, Plug2, Trash2, Pencil, Maximize2, Minimize2, Cpu, Puzzle, Globe, Terminal, Image, Eye, EyeOff, Check, Key, Wrench, Folder, Search } from 'lucide-react';
import {
  BUILTIN_PROVIDERS,
  DEFAULT_PLUGINS,
  DEFAULT_PROVIDERS,
  DEFAULT_SYSTEM_TOOLS,
  type CustomProvider,
  type PluginItem,
  type ProviderSettings,
  type SystemToolItem,
  mergeProvidersWithEnv,
  providersToEnv,
} from './settingsConfig';
import GeneralSettingsTab from './GeneralSettingsTab';
import PromptSettingsTab from './PromptSettingsTab';
import { Toggle } from './settingsShared';
import { genId, loadJSON, type McpServer, type SettingsTab, type Skill } from './settingsTypes';
import { McpForm, McpList, SkillForm, SkillList } from './SkillsSettingsTab';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── Component ──────────────────────────────────────────
export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [tab, setTab] = useState<SettingsTab>('general');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => loadJSON('blankAI_theme', 'light'));
  const [language, setLanguage] = useState<'zh' | 'en'>(() => loadJSON('blankAI_language', 'zh'));
  const [sendShortcut, setSendShortcut] = useState<'enter' | 'ctrl-enter'>(() => loadJSON('blankAI_sendShortcut', 'enter'));
  const [saveHistory, setSaveHistory] = useState<boolean>(() => loadJSON('blankAI_saveHistory', true));
  const [showThinking, setShowThinking] = useState<boolean>(() => loadJSON('blankAI_showThinking', true));
  const [groupProcessBlocks, setGroupProcessBlocks] = useState<boolean>(() => loadJSON('blankAI_groupProcessBlocks', true));
  const [collapseProcess, setCollapseProcess] = useState<boolean>(() => loadJSON('blankAI_collapseProcess', true));
  const [collapseTools, setCollapseTools] = useState<boolean>(() => loadJSON('blankAI_collapseTools', true));
  const [processDisplayOrder, setProcessDisplayOrder] = useState<'tool-first' | 'thinking-first'>(() => loadJSON('blankAI_processDisplayOrder', 'tool-first'));
  const [systemPrompt, setSystemPrompt] = useState<string>(() => loadJSON('blankAI_systemPrompt', ''));
  const [skills, setSkills] = useState<Skill[]>(() => loadJSON('blankAI_skills', []));
  const [mcpServers, setMcpServers] = useState<McpServer[]>(() => loadJSON('blankAI_mcpServers', []));
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [editingMcp, setEditingMcp] = useState<McpServer | null>(null);

  // Providers and Plugins States
  const [providers, setProviders] = useState<Record<string, ProviderSettings>>(() => loadJSON('blankAI_providers', DEFAULT_PROVIDERS));

  const [customProviders, setCustomProviders] = useState<CustomProvider[]>(() => {
    return loadJSON('blankAI_customProviders', []);
  });

  const [plugins, setPlugins] = useState<PluginItem[]>(() => loadJSON('blankAI_plugins', DEFAULT_PLUGINS));
  const [systemTools, setSystemTools] = useState<SystemToolItem[]>(() => loadJSON('blankAI_systemTools', DEFAULT_SYSTEM_TOOLS));

  // Resize & Full Screen States
  const [dimensions, setDimensions] = useState({ width: 800, height: 560 }); // Increased default size
  const [isResizing, setIsResizing] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const resizeStartRef = React.useRef<{ mouseX: number; mouseY: number; width: number; height: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isFullScreen) return;
    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      width: dimensions.width,
      height: dimensions.height
    };
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;
      const { mouseX, mouseY, width, height } = resizeStartRef.current;
      const deltaX = e.clientX - mouseX;
      const deltaY = e.clientY - mouseY;

      // Symmetrical scaling keeps modal centered perfectly
      const newWidth = Math.max(680, Math.min(window.innerWidth - 40, width + 2 * deltaX));
      const newHeight = Math.max(480, Math.min(window.innerHeight - 40, height + 2 * deltaY));

      setDimensions({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, isFullScreen]);

  // Panel Drag States
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const dragPanelStartRef = React.useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || isFullScreen) return; // Only left click, no drag in full screen
    const target = e.target as HTMLElement;
    if (target.closest('button')) return; // Don't drag if clicking buttons

    dragPanelStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: position.x,
      startY: position.y
    };
    setIsDraggingPanel(true);
  };

  useEffect(() => {
    if (!isDraggingPanel) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragPanelStartRef.current) return;
      const { mouseX, mouseY, startX, startY } = dragPanelStartRef.current;
      const deltaX = e.clientX - mouseX;
      const deltaY = e.clientY - mouseY;

      setPosition({
        x: startX + deltaX,
        y: startY + deltaY
      });
    };

    const handleMouseUp = () => {
      setIsDraggingPanel(false);
      dragPanelStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPanel]);

  // Reset position & fullscreen on open
  useEffect(() => {
    if (isOpen) {
      setPosition({ x: 0, y: 0 });
      setIsFullScreen(false);
    }
  }, [isOpen]);

  // Refresh persisted settings whenever the panel opens.
  useEffect(() => {
    if (!isOpen) return;
    setTheme(loadJSON('blankAI_theme', 'light'));
    setLanguage(loadJSON('blankAI_language', 'zh'));
    setSendShortcut(loadJSON('blankAI_sendShortcut', 'enter'));
    setSaveHistory(loadJSON('blankAI_saveHistory', true));
    setShowThinking(loadJSON('blankAI_showThinking', true));
    setGroupProcessBlocks(loadJSON('blankAI_groupProcessBlocks', true));
    setCollapseProcess(loadJSON('blankAI_collapseProcess', true));
    setCollapseTools(loadJSON('blankAI_collapseTools', true));
    setProcessDisplayOrder(loadJSON('blankAI_processDisplayOrder', 'tool-first'));
    setSystemPrompt(loadJSON('blankAI_systemPrompt', ''));
    setSkills(loadJSON('blankAI_skills', []));
    setMcpServers(loadJSON('blankAI_mcpServers', []));
    const savedProviders = loadJSON('blankAI_providers', DEFAULT_PROVIDERS);
    setProviders(savedProviders);

    // Read real keys from Electron
    const api = (window as any).api;
    if (api && api.getEnv) {
      api.getEnv().then((env: Record<string, string>) => {
        setProviders(prev => mergeProvidersWithEnv(prev, customProviders, env));
      }).catch((err: any) => console.error('Failed to getEnv:', err));
    }
    setPlugins(loadJSON('blankAI_plugins', DEFAULT_PLUGINS));
    setSystemTools(loadJSON('blankAI_systemTools', DEFAULT_SYSTEM_TOOLS));
  }, [isOpen]);

  // Persist on change
  useEffect(() => { localStorage.setItem('blankAI_theme', JSON.stringify(theme)); }, [theme]);
  useEffect(() => { localStorage.setItem('blankAI_language', JSON.stringify(language)); }, [language]);
  useEffect(() => { localStorage.setItem('blankAI_sendShortcut', JSON.stringify(sendShortcut)); }, [sendShortcut]);
  useEffect(() => { localStorage.setItem('blankAI_saveHistory', JSON.stringify(saveHistory)); }, [saveHistory]);
  useEffect(() => { localStorage.setItem('blankAI_showThinking', JSON.stringify(showThinking)); }, [showThinking]);
  useEffect(() => {
    localStorage.setItem('blankAI_groupProcessBlocks', JSON.stringify(groupProcessBlocks));
    window.dispatchEvent(new CustomEvent('blankAI-settings-change', {
      detail: { key: 'blankAI_groupProcessBlocks', value: groupProcessBlocks }
    }));
  }, [groupProcessBlocks]);
  useEffect(() => {
    localStorage.setItem('blankAI_collapseProcess', JSON.stringify(collapseProcess));
    window.dispatchEvent(new CustomEvent('blankAI-settings-change', {
      detail: { key: 'blankAI_collapseProcess', value: collapseProcess }
    }));
  }, [collapseProcess]);
  useEffect(() => {
    localStorage.setItem('blankAI_collapseTools', JSON.stringify(collapseTools));
    window.dispatchEvent(new CustomEvent('blankAI-settings-change', {
      detail: { key: 'blankAI_collapseTools', value: collapseTools }
    }));
  }, [collapseTools]);
  useEffect(() => {
    localStorage.setItem('blankAI_processDisplayOrder', JSON.stringify(processDisplayOrder));
    window.dispatchEvent(new CustomEvent('blankAI-settings-change', {
      detail: { key: 'blankAI_processDisplayOrder', value: processDisplayOrder }
    }));
  }, [processDisplayOrder]);
  useEffect(() => {
    localStorage.setItem('blankAI_systemPrompt', JSON.stringify(systemPrompt));
    window.dispatchEvent(new CustomEvent('blankAI-settings-change', {
      detail: { key: 'blankAI_systemPrompt', value: systemPrompt }
    }));
    const api = (window as any).api;
    if (api && api.syncSystemPrompt) {
      api.syncSystemPrompt(systemPrompt).catch((err: any) => console.error('[Sync SystemPrompt]', err));
    }
  }, [systemPrompt]);
  useEffect(() => {
    localStorage.setItem('blankAI_skills', JSON.stringify(skills));
    const api = (window as any).api;
    if (api && api.syncSkills) {
      api.syncSkills(skills).then((res: any) => {
        console.log('[React Skills Sync]', res);
      }).catch((err: any) => {
        console.error('[React Skills Sync Error]', err);
      });
    }
  }, [skills]);
  useEffect(() => {
    localStorage.setItem('blankAI_systemTools', JSON.stringify(systemTools));
    window.dispatchEvent(new CustomEvent('blankAI-settings-change', {
      detail: { key: 'blankAI_systemTools', value: systemTools }
    }));
  }, [systemTools]);
  useEffect(() => { localStorage.setItem('blankAI_mcpServers', JSON.stringify(mcpServers)); }, [mcpServers]);
  useEffect(() => { localStorage.setItem('blankAI_providers', JSON.stringify(providers)); }, [providers]);
  useEffect(() => { localStorage.setItem('blankAI_customProviders', JSON.stringify(customProviders)); }, [customProviders]);
  useEffect(() => { localStorage.setItem('blankAI_plugins', JSON.stringify(plugins)); }, [plugins]);

  // Reset editing state when switching tabs or closing
  const switchTab = (t: SettingsTab) => { setTab(t); setEditingSkill(null); setEditingMcp(null); };
  const handleClose = () => { setEditingSkill(null); setEditingMcp(null); onClose(); };

  // CRUD
  const saveSkill = (s: Skill) => {
    setSkills(prev => prev.find(x => x.id === s.id) ? prev.map(x => x.id === s.id ? s : x) : [...prev, s]);
    setEditingSkill(null);
  };
  const saveMcp = (s: McpServer) => {
    setMcpServers(prev => prev.find(x => x.id === s.id) ? prev.map(x => x.id === s.id ? s : x) : [...prev, s]);
    setEditingMcp(null);
  };

  if (!isOpen) return null;

  const tabs: { key: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { key: 'general', label: '通用设置', icon: <Settings size={16} /> },
    { key: 'prompt', label: '系统提示词', icon: <Terminal size={16} /> },
    { key: 'providers', label: '提供商', icon: <Cpu size={16} /> },
    { key: 'skills', label: 'Skills', icon: <Sparkles size={16} /> },
    { key: 'tools', label: '系统工具', icon: <Wrench size={16} /> },
    { key: 'mcp', label: '自定义工具 (MCP)', icon: <Plug2 size={16} /> },
    { key: 'plugins', label: '插件', icon: <Puzzle size={16} /> },
  ];

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm settings-backdrop-enter" onClick={handleClose} />

      {/* Panel */}
      <div 
        id="settings-drag-panel"
        style={
          isFullScreen 
            ? { width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh', userSelect: (isResizing || isDraggingPanel) ? 'none' : 'auto', WebkitAppRegion: 'no-drag' } as any
            : { 
                width: `${dimensions.width}px`, 
                height: `${dimensions.height}px`, 
                left: `${position.x}px`,
                top: `${position.y}px`,
                userSelect: (isResizing || isDraggingPanel) ? 'none' : 'auto',
                WebkitAppRegion: 'no-drag'
              } as any
        }
        className={`relative bg-white shadow-2xl flex flex-col settings-panel-enter overflow-hidden border border-gray-100 ${
          isResizing || isDraggingPanel ? '' : 'transition-all duration-200'
        } ${isFullScreen ? 'rounded-none' : 'rounded-2xl max-w-[95vw] max-h-[90vh]'}`}
      >
        {/* Header */}
        <div 
          onMouseDown={handleHeaderMouseDown}
          className={`flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0 select-none ${
            isFullScreen ? 'cursor-default' : 'cursor-move active:cursor-grabbing'
          }`}
        >
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-semibold text-gray-800">系统设置</h2>
            {isFullScreen && (
              <span className="text-[9px] font-bold text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded-md tracking-wider">全屏模式</span>
            )}
          </div>
          <div className={`flex items-center gap-1 transition-all duration-200 ${isFullScreen ? 'mr-[140px]' : ''}`}>
            <button 
              onClick={() => setIsFullScreen(!isFullScreen)} 
              className="text-gray-400 hover:text-gray-800 transition-colors p-1.5 rounded-lg hover:bg-gray-100"
              title={isFullScreen ? "还原大小" : "最大化全屏"}
            >
              {isFullScreen ? <Minimize2 size={16} strokeWidth={2} /> : <Maximize2 size={16} strokeWidth={2} />}
            </button>
            <button onClick={handleClose} className="text-gray-400 hover:text-gray-800 transition-colors p-1.5 rounded-lg hover:bg-gray-100" title="关闭">
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 relative">
          {/* Left Nav */}
          <div className="w-[160px] border-r border-gray-100 p-3 flex flex-col gap-1 select-none flex-shrink-0">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => switchTab(t.key)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[14px] transition-all w-full text-left ${
                  tab === t.key ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Right Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {tab === 'general' && (
              <GeneralSettingsTab 
                theme={theme} 
                setTheme={setTheme}
                language={language}
                setLanguage={setLanguage}
                sendShortcut={sendShortcut}
                setSendShortcut={setSendShortcut}
                saveHistory={saveHistory}
                setSaveHistory={setSaveHistory}
                showThinking={showThinking}
                setShowThinking={setShowThinking}
                groupProcessBlocks={groupProcessBlocks}
                setGroupProcessBlocks={setGroupProcessBlocks}
                collapseProcess={collapseProcess}
                setCollapseProcess={setCollapseProcess}
                collapseTools={collapseTools}
                setCollapseTools={setCollapseTools}
                processDisplayOrder={processDisplayOrder}
                setProcessDisplayOrder={setProcessDisplayOrder}
              />
            )}
            {tab === 'prompt' && (
              <PromptSettingsTab
                systemPrompt={systemPrompt}
                setSystemPrompt={setSystemPrompt}
              />
            )}
            {tab === 'providers' && (
              <ProvidersTab 
                providers={providers}
                setProviders={setProviders}
                customProviders={customProviders}
                setCustomProviders={setCustomProviders}
              />
            )}
            {tab === 'skills' && (
              editingSkill
                ? <SkillForm skill={editingSkill} onChange={setEditingSkill} onSave={saveSkill} onCancel={() => setEditingSkill(null)} isNew={!skills.find(s => s.id === editingSkill.id)} />
                : <SkillList skills={skills} setSkills={setSkills} onEdit={s => setEditingSkill({...s})} onAdd={() => setEditingSkill({ id: genId(), name: '', description: '', content: '', enabled: true })} onDelete={id => setSkills(p => p.filter(s => s.id !== id))} />
            )}
            {tab === 'tools' && (
              <SystemToolsTab 
                systemTools={systemTools}
                setSystemTools={setSystemTools}
              />
            )}
            {tab === 'mcp' && (
              editingMcp
                ? <McpForm server={editingMcp} onChange={setEditingMcp} onSave={saveMcp} onCancel={() => setEditingMcp(null)} isNew={!mcpServers.find(s => s.id === editingMcp.id)} />
                : <McpList servers={mcpServers} setServers={setMcpServers} onEdit={s => setEditingMcp({...s})} onAdd={() => setEditingMcp({ id: genId(), name: '', command: '', args: [], env: {}, enabled: true })} onDelete={id => setMcpServers(p => p.filter(s => s.id !== id))} />
            )}
            {tab === 'plugins' && (
              <div className="flex flex-col items-center justify-center py-24 text-gray-400 select-none animate-fadeIn">
                <Puzzle size={48} className="mb-4 text-gray-200" />
                <h3 className="text-lg font-medium text-gray-600 mb-2">插件市场 (Plugin Market)</h3>
                <p className="text-sm">插件市场即将开放，敬请期待！</p>
                <p className="text-xs mt-2 text-gray-400 text-center max-w-[300px]">开发中的社区插件生态。自定义脚本功能请前往「自定义工具 (MCP)」面板。</p>
              </div>
            )}
          </div>
        </div>
        
        {/* Symmetrical Drag Resize Handle (Bottom-Right) */}
        {!isFullScreen && (
          <div 
            className="absolute bottom-1 right-1 w-3.5 h-3.5 cursor-se-resize z-50 flex items-end justify-end pointer-events-auto select-none"
            onMouseDown={handleMouseDown}
            title="拖拽可自定义调节面板大小"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" className="text-gray-300 hover:text-gray-500 transition-colors">
              <line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="8" y1="5" x2="5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

function getProviderIcon(id: string) {
  switch (id) {
    case 'xiaomi-token-plan-cn': return <Sparkles size={18} className="text-cyan-500" />;
    case 'gemini': return <Sparkles size={18} className="text-indigo-500" />;
    case 'openai': return <Cpu size={18} className="text-emerald-500" />;
    case 'anthropic': return <Key size={18} className="text-orange-500" />;
    case 'deepseek': return <Puzzle size={18} className="text-blue-500" />;
    default: return <Cpu size={18} className="text-gray-500" />;
  }
}

function ProvidersTab({
  providers,
  setProviders,
  customProviders,
  setCustomProviders,
}: {
  providers: Record<string, ProviderSettings>;
  setProviders: React.Dispatch<React.SetStateAction<Record<string, ProviderSettings>>>;
  customProviders: CustomProvider[];
  setCustomProviders: React.Dispatch<React.SetStateAction<CustomProvider[]>>;
}) {
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, 'idle' | 'loading' | 'success' | 'error'>>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Form states for adding custom provider
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderDesc, setNewProviderDesc] = useState('');
  const [newProviderBaseUrl, setNewProviderBaseUrl] = useState('');

  const fullProviderList: {
    id: string;
    name: string;
    desc: string;
    icon: React.ReactNode;
    placeholderUrl: string;
    isCustom?: boolean;
  }[] = [
    ...BUILTIN_PROVIDERS.map(p => ({
      ...p,
      icon: getProviderIcon(p.id),
      isCustom: false,
    })),
    ...customProviders.map(p => ({
      id: p.id,
      name: p.name,
      desc: p.desc,
      icon: <Cpu size={18} className="text-gray-500" />,
      placeholderUrl: p.placeholderUrl,
      isCustom: true
    }))
  ];

  const toggleProvider = (id: string) => {
    setProviders(prev => ({
      ...prev,
      [id]: { ...prev[id], enabled: !prev[id]?.enabled }
    }));
  };

  const handleApiKeyChange = (id: string, value: string) => {
    setProviders(prev => ({
      ...prev,
      [id]: { ...prev[id], apiKey: value }
    }));
  };

  const handleBaseUrlChange = (id: string, value: string) => {
    setProviders(prev => ({
      ...prev,
      [id]: { ...prev[id], baseUrl: value }
    }));
  };

  const toggleShowKey = (id: string) => {
    setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const testConnection = (id: string) => {
    setTesting(prev => ({ ...prev, [id]: 'loading' }));
    setTimeout(() => {
      const key = providers[id]?.apiKey;
      if (key && key.trim().length > 5) {
        setTesting(prev => ({ ...prev, [id]: 'success' }));
      } else {
        setTesting(prev => ({ ...prev, [id]: 'error' }));
      }
      setTimeout(() => {
        setTesting(prev => ({ ...prev, [id]: 'idle' }));
      }, 3000);
    }, 1200);
  };

  const handleAddCustomProvider = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProviderName.trim()) return;

    const safeName = newProviderName.trim();
    const cleanIdSuffix = safeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const newId = `custom-${cleanIdSuffix}-${Date.now().toString().slice(-4)}`;

    setCustomProviders(prev => [
      ...prev,
      { id: newId, name: safeName, desc: newProviderDesc.trim() || '自定义接口兼容模型服务商', placeholderUrl: newProviderBaseUrl.trim() || 'https://api.example.com' }
    ]);

    setProviders(prev => ({
      ...prev,
      [newId]: { enabled: true, apiKey: '', baseUrl: newProviderBaseUrl.trim() }
    }));

    setNewProviderName('');
    setNewProviderDesc('');
    setNewProviderBaseUrl('');
    setShowAddForm(false);
  };

  const handleDeleteCustomProvider = (id: string) => {
    if (confirm('确定要删除这个自定义提供商吗？')) {
      setCustomProviders(prev => prev.filter(x => x.id !== id));
      setProviders(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    }
  };

  const handleSave = () => {
    setSaveStatus('saving');
    const api = (window as any).api;
    if (api && api.saveEnv) {
      api.saveEnv(providersToEnv(providers, customProviders)).then((res: any) => {
        setSaveStatus('saved');
        window.dispatchEvent(new CustomEvent('providers-updated'));
        setTimeout(() => setSaveStatus('idle'), 2500);
      }).catch((err: any) => {
        console.error('Failed to save env:', err);
        setSaveStatus('idle');
        alert('保存配置失败，请查看控制台日志');
      });
    } else {
      setSaveStatus('saved');
      window.dispatchEvent(new CustomEvent('providers-updated'));
      setTimeout(() => setSaveStatus('idle'), 2500);
    }
  };

  return (
    <div className="flex flex-col gap-5 select-none animate-fadeIn w-full relative min-h-full">
      <div className="flex justify-between items-center w-full">
        <div>
          <h3 className="text-[13px] text-gray-400 uppercase tracking-wider mb-1 font-semibold">模型提供商</h3>
          <p className="text-[12px] text-gray-400">配置您的 API 密钥及代理服务基准端点</p>
        </div>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-xl transition-all"
        >
          {showAddForm ? <X size={14} /> : <Plus size={14} />}
          {showAddForm ? '取消' : '添加自定义'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddCustomProvider} className="border border-indigo-100 bg-indigo-50/10 rounded-2xl p-4 flex flex-col gap-3.5 animate-slideDown w-full">
          <div className="flex justify-between items-center">
            <h4 className="text-[13px] font-bold text-indigo-950 flex items-center gap-1.5">
              <Plus size={15} /> 新增自定义提供商
            </h4>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-400 font-medium mb-1 block">提供商名称 (必填)</label>
              <input 
                type="text" 
                required
                value={newProviderName}
                onChange={e => setNewProviderName(e.target.value)}
                placeholder="例如: OpenRouter, 自建代理" 
                className="w-full px-3 py-2 bg-white border border-gray-200 focus:border-indigo-400 rounded-xl text-[13px] text-gray-700 outline-none transition-all"
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-400 font-medium mb-1 block">默认 Base URL (可选)</label>
              <input 
                type="text" 
                value={newProviderBaseUrl}
                onChange={e => setNewProviderBaseUrl(e.target.value)}
                placeholder="例如: https://openrouter.ai/api/v1" 
                className="w-full px-3 py-2 bg-white border border-gray-200 focus:border-indigo-400 rounded-xl text-[13px] text-gray-700 outline-none transition-all font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-gray-400 font-medium mb-1 block">一句话简短描述</label>
            <input 
              type="text" 
              value={newProviderDesc}
              onChange={e => setNewProviderDesc(e.target.value)}
              placeholder="说明此提供商的用途或包含的模型系列" 
              className="w-full px-3 py-2 bg-white border border-gray-200 focus:border-indigo-400 rounded-xl text-[13px] text-gray-700 outline-none transition-all"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button 
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[13px] font-semibold transition-all shadow-sm"
            >
              创建提供商
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col gap-4 w-full pb-4">
        {fullProviderList.map(p => {
          const config = providers[p.id] || { enabled: false, apiKey: '', baseUrl: '' };
          const isKeyVisible = showKeys[p.id];
          const testStatus = testing[p.id] || 'idle';

          return (
            <div key={p.id} className={`border rounded-2xl p-4 transition-all duration-200 bg-white ${config.enabled ? 'border-gray-300 shadow-sm' : 'border-gray-100 opacity-60'} w-full`}>
              <div className="flex items-center justify-between mb-3.5 w-full">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-50 rounded-xl">
                    {p.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-[14px] font-semibold text-gray-800">{p.name}</h4>
                      {p.isCustom && (
                        <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md tracking-wider">自定义</span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400">{p.desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  {p.isCustom && (
                    <button 
                      onClick={() => handleDeleteCustomProvider(p.id)}
                      className="p-1.5 text-gray-300 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-all"
                      title="删除此自定义提供商"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                  <Toggle on={config.enabled} onToggle={() => toggleProvider(p.id)} />
                </div>
              </div>

              {config.enabled && (
                <div className="flex flex-col gap-3.5 mt-3 pt-3.5 border-t border-dashed border-gray-100 animate-fadeIn w-full">
                  <div>
                    <label className="text-[11px] text-gray-400 font-medium mb-1.5 block">API 密钥 (API Key)</label>
                    <div className="relative">
                      <input
                        type={isKeyVisible ? 'text' : 'password'}
                        value={config.apiKey}
                        onChange={e => handleApiKeyChange(p.id, e.target.value)}
                        placeholder={`请输入您的 ${p.name} API 密钥`}
                        className="w-full pl-3.5 pr-10 py-2.5 bg-gray-50/50 hover:bg-gray-50 border border-gray-200 focus:border-gray-400 rounded-xl text-[13px] text-gray-700 outline-none transition-all font-mono"
                      />
                      <button
                        onClick={() => toggleShowKey(p.id)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                      >
                        {isKeyVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 items-end w-full">
                    <div className="col-span-2">
                      <label className="text-[11px] text-gray-400 font-medium mb-1.5 block">自定义 Endpoint (Base URL)</label>
                      <input
                        type="text"
                        value={config.baseUrl}
                        onChange={e => handleBaseUrlChange(p.id, e.target.value)}
                        placeholder={p.placeholderUrl}
                        className="w-full px-3.5 py-2.5 bg-gray-50/50 hover:bg-gray-50 border border-gray-200 focus:border-gray-400 rounded-xl text-[13px] text-gray-700 outline-none transition-all font-mono"
                      />
                    </div>

                    <button
                      onClick={() => testConnection(p.id)}
                      disabled={testStatus === 'loading'}
                      className={`h-[42px] px-3 rounded-xl border text-[13px] font-medium transition-all duration-200 flex items-center justify-center gap-1.5 ${
                        testStatus === 'loading'
                          ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                          : testStatus === 'success'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                          : testStatus === 'error'
                          ? 'bg-rose-50 border-rose-200 text-rose-600'
                          : 'bg-white hover:bg-gray-50 border-gray-200 hover:border-gray-300 text-gray-600'
                      }`}
                    >
                      {testStatus === 'loading' ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                          测试中
                        </>
                      ) : testStatus === 'success' ? (
                        <>
                          <Check size={14} />
                          成功
                        </>
                      ) : testStatus === 'error' ? (
                        <>
                          <X size={14} />
                          失败
                        </>
                      ) : (
                        '测试连接'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end py-4 border-t border-gray-100 bg-white sticky bottom-[-24px] z-10 mt-auto w-full">
        <button
          onClick={handleSave}
          disabled={saveStatus !== 'idle'}
          className={`px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 flex items-center gap-2 select-none shadow-sm ${
            saveStatus === 'saving'
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-100'
              : saveStatus === 'saved'
              ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
              : 'bg-gray-900 hover:bg-gray-800 text-white active:scale-[0.98]'
          }`}
        >
          {saveStatus === 'saving' ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              正在保存并重启智能体...
            </>
          ) : saveStatus === 'saved' ? (
            <>
              <Check size={15} />
              配置保存成功，服务重启中！
            </>
          ) : (
            '保存并应用配置'
          )}
        </button>
      </div>
    </div>
  );
}

// ── System Tools Tab ───────────────────────────────────────
function SystemToolsTab({
  systemTools,
  setSystemTools,
}: {
  systemTools: SystemToolItem[];
  setSystemTools: React.Dispatch<React.SetStateAction<SystemToolItem[]>>;
}) {
  const toggleTool = (id: string) => {
    setSystemTools(prev => prev.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p));
  };

  const getToolIcon = (icon: string) => {
    switch (icon) {
      case 'globe': return <Globe size={18} className="text-blue-500" />;
      case 'terminal': return <Terminal size={18} className="text-gray-800" />;
      case 'image': return <Image size={18} className="text-purple-500" />;
      case 'cpu': return <Cpu size={18} className="text-emerald-500" />;
      case 'eye': return <Eye size={18} className="text-amber-500" />;
      case 'pencil': return <Pencil size={18} className="text-indigo-500" />;
      case 'folder': return <Folder size={18} className="text-cyan-500" />;
      case 'search': return <Search size={18} className="text-rose-500" />;
      default: return <Puzzle size={18} className="text-gray-500" />;
    }
  };

  return (
    <div className="flex flex-col gap-5 select-none animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[13px] text-gray-400 uppercase tracking-wider mb-1 font-semibold">内置系统工具 (Built-in Tools)</h3>
          <p className="text-[12px] text-gray-400">启用或配置您的 AI 智能体可调用的原生系统功能</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5">
        {systemTools.map(p => (
          <div key={p.id} className={`flex items-start justify-between p-4 rounded-2xl border transition-all duration-200 ${p.enabled ? 'border-gray-200 bg-white shadow-sm' : 'border-gray-100 bg-gray-50/10'}`}>
            <div className="flex gap-3.5">
              <div className="p-2.5 bg-gray-50 rounded-xl shrink-0 mt-0.5">
                {getToolIcon(p.icon)}
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold text-gray-800">{p.name}</span>
                  {p.enabled && (
                    <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md tracking-wider">已启用</span>
                  )}
                </div>
                <p className="text-[12px] text-gray-400 leading-relaxed max-w-[420px]">{p.desc}</p>
              </div>
            </div>
            <div className="flex items-center ml-4 shrink-0">
              <Toggle on={p.enabled} onToggle={() => togglePlugin(p.id)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
