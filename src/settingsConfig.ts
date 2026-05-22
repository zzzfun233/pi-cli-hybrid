export interface ProviderSettings {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  desc: string;
  placeholderUrl: string;
  envPrefix?: string;
}

export interface CustomProvider {
  id: string;
  name: string;
  desc: string;
  placeholderUrl: string;
}

export interface PluginItem {
  id: string;
  name: string;
  desc: string;
  icon: string;
  enabled: boolean;
}

export const BUILTIN_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'xiaomi-token-plan-cn',
    name: 'Xiaomi Token Plan (CN)',
    desc: '小米 MiMo Token Plan (中国区) 提供商',
    placeholderUrl: 'https://api.xiaomimimo.com',
    envPrefix: 'XIAOMI_TOKEN_PLAN_CN',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    desc: 'Google DeepMind 的多模态旗舰模型服务',
    placeholderUrl: 'https://generativelanguage.googleapis.com',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    desc: 'ChatGPT / GPT-4o 系列模型服务提供商',
    placeholderUrl: 'https://api.openai.com/v1',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    desc: 'Claude 3.5 Sonnet 等高智能模型服务商',
    placeholderUrl: 'https://api.anthropic.com/v1',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    desc: '极具性价比的中国开源/闭源模型服务商',
    placeholderUrl: 'https://api.deepseek.com/v1',
  },
];

export const DEFAULT_PROVIDERS = Object.fromEntries(
  BUILTIN_PROVIDERS.map(provider => [
    provider.id,
    {
      enabled: provider.id === 'xiaomi-token-plan-cn',
      apiKey: '',
      baseUrl: provider.placeholderUrl,
    },
  ])
) as Record<string, ProviderSettings>;

export const DEFAULT_PLUGINS: PluginItem[] = [
  { id: 'web_search', name: 'Web Search (网页搜索)', desc: '允许 AI 搜索实时互联网内容并获取最新网页信息', icon: 'globe', enabled: true },
  { id: 'code_runner', name: 'Code Runner (代码执行)', desc: '允许 AI 在本地安全的沙箱中编译并执行 Python 或 JavaScript 代码', icon: 'terminal', enabled: true },
  { id: 'image_ocr', name: 'Image OCR (图像分析与识别)', desc: '利用多模态视觉模型对图片和屏幕截图进行高精度光学字符识别', icon: 'image', enabled: true },
  { id: 'system_auto', name: 'System Automation (系统自动化)', desc: '支持 AI 执行本地终端命令并控制窗口、应用程序', icon: 'cpu', enabled: false },
];

export interface SystemToolItem {
  id: string;
  name: string;
  desc: string;
  icon: string;
  enabled: boolean;
}

export const DEFAULT_SYSTEM_TOOLS: SystemToolItem[] = [
  { id: 'run_command', name: 'Bash (终端命令)', desc: '允许 AI 在终端执行安全或需要授权的系统命令', icon: 'terminal', enabled: true },
  { id: 'view_file', name: 'Read (读取文件)', desc: '允许 AI 读取工作区内任意文本或代码文件的内容', icon: 'eye', enabled: true },
  { id: 'write_file', name: 'Write (写入文件)', desc: '允许 AI 创建新文件或覆盖现有文件内容', icon: 'pencil', enabled: true },
  { id: 'replace_file', name: 'Replace (修改文件)', desc: '允许 AI 在现有文件中精准替换和修改代码段', icon: 'pencil', enabled: true },
  { id: 'list_dir', name: 'List (查看目录)', desc: '允许 AI 获取特定文件夹的目录结构和文件列表', icon: 'folder', enabled: true },
  { id: 'grep_search', name: 'Search (全局搜索)', desc: '允许 AI 在整个项目中利用正则或关键词搜索代码', icon: 'search', enabled: true },
  { id: 'browser', name: 'Browser (网页浏览)', desc: '允许 AI 打开浏览器提取网页正文和在线文档', icon: 'globe', enabled: true },
];

export function providerEnvPrefix(id: string) {
  const builtin = BUILTIN_PROVIDERS.find(provider => provider.id === id);
  return builtin?.envPrefix ?? id.toUpperCase().replace(/-/g, '_');
}

export function mergeProvidersWithEnv(
  providers: Record<string, ProviderSettings>,
  customProviders: CustomProvider[],
  env: Record<string, string>
) {
  const updated = { ...providers };
  const definitions = [
    ...BUILTIN_PROVIDERS,
    ...customProviders.map(provider => ({ ...provider, envPrefix: providerEnvPrefix(provider.id) })),
  ];

  for (const provider of definitions) {
    const prefix = provider.envPrefix ?? providerEnvPrefix(provider.id);
    const envApiKey = env[`${prefix}_API_KEY`];
    const envBaseUrl = env[`${prefix}_BASE_URL`];
    const previous = providers[provider.id];

    const hasEnvKey = !!(envApiKey && envApiKey.trim().length > 0);
    
    let enabled = false;
    if (previous && previous.enabled !== undefined) {
      enabled = previous.enabled;
    } else {
      enabled = hasEnvKey || provider.id === 'xiaomi-token-plan-cn';
    }

    const apiKey = hasEnvKey ? envApiKey : (previous?.apiKey || '');
    const baseUrl = (envBaseUrl && envBaseUrl.trim().length > 0) 
      ? envBaseUrl 
      : (previous?.baseUrl || provider.placeholderUrl);

    updated[provider.id] = {
      enabled,
      apiKey,
      baseUrl,
    };
  }

  return updated;
}

export function providersToEnv(
  providers: Record<string, ProviderSettings>,
  customProviders: CustomProvider[]
) {
  const envVars: Record<string, string> = {};
  const definitions = [
    ...BUILTIN_PROVIDERS,
    ...customProviders.map(provider => ({ ...provider, envPrefix: providerEnvPrefix(provider.id) })),
  ];

  for (const provider of definitions) {
    const prefix = provider.envPrefix ?? providerEnvPrefix(provider.id);
    const settings = providers[provider.id];
    
    if (settings?.enabled) {
      envVars[`${prefix}_API_KEY`] = settings.apiKey || '';
      if (settings.baseUrl && settings.baseUrl !== provider.placeholderUrl) {
        envVars[`${prefix}_BASE_URL`] = settings.baseUrl;
      } else {
        envVars[`${prefix}_BASE_URL`] = '';
      }
    } else {
      envVars[`${prefix}_API_KEY`] = '';
      envVars[`${prefix}_BASE_URL`] = '';
    }
  }

  return envVars;
}
