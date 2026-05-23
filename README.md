<div align="center">
  <img width="1200" height="475" alt="Blank AI Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
  <h1>🚀 Blank AI Desktop Client</h1>
  <p><b>基于 React 19 + TypeScript + Electron + TailwindCSS 4 构建的下一代极客 AI 桌面助手</b></p>
  <p>支持深度推理思维链、MCP 插件服务、Skills 指令扩展以及高度可定制的极简美学设置面板。</p>
</div>

---
## 📅 项目定位与核心优势
⚔️ 生态站位：为什么选择 Blank AI？
当前的 AI Agent 生态圈可谓神仙打架，但在面对如 OpenAI Codex CLI、Google Antigravity 等顶流竞品时，本项目凭借极简的架构与克制的设计，打出了独属于自己的生态位：

☯️ 双模无缝切换 (Dual-Mode)：打破传统 Agent “纯 CLI 太乱，纯 GUI 太封闭”的困局。本客户端实现了前端 GUI 界面与 PTY 真实终端环境的 100% 双向同步切换。点击切换按钮，瞬间在原汁原味的极客字符界面与渲染精美的 Markdown 视图间无缝穿梭。

✨ 优雅的内省展示 (Elegant Introspection)：大模型调用底层工具（Tool Use）和思维链（Thinking Process）的过程往往伴随大量刷屏。我们通过自研的 UI 将这些中间过程以灰色斜体及折叠面板优雅收纳——既保持了极客所需的底层透明度，又保证了对话界面的绝对清爽。

🪶 轻量化降维打击：相较于越做越重、强迫用户改变工作流的 IDE 级应用（如 Cursor 或全套的 Antigravity），本项目坚持做一个轻量、纯粹的桌面端 Wrapper。让你既能享受现代 GUI 的直观美学，又能随时退回 Terminal 掌控一切。


本客户端专为深度 AI 探索者与开发者打造，具备媲美顶级原生客户端的响应速度与交互动画。

* 🪐 **极简无边框设计**：深度适配 Windows/macOS 窗口美学，融合磨砂玻璃质感（Backdrop Blur）与流畅的微动画。
* 🧠 **深度推理（Thinking）控制**：自研直观的模型思考强度调节器，支持从“关闭”到“极限推理”共 6 档强度调整，并支持在前端一键隐藏/展开思维链过程。
* 🛠️ **MCP 插件服务 (Model Context Protocol)**：原生支持对接各种 MCP 服务器，允许大模型直接调用本地文件搜索、Chrome 调试、系统控制等外部工具。
* 📝 **系统指令集 (Skills)**：内置灵活的 Skills（前缀 Prompt 模板）配置器，支持拖拽启用、实时编辑，并自动同步至底层推理管道。
* ⚙️ **强交互系统设置**：支持全局拖拽移动面板、窗口边缘无级拉伸、双击全屏、快捷键自定义（Enter vs Ctrl+Enter 发送）。
* 🌐 **国际化多语言支持**：通用设置中内置语言选择（简体中文/English），完美支持 GitHub 开源社区不同语言背景的海外用户。
* 💾 **坚如磐石的本地持久化**：用户所有的历史对话都会安全加密持久化在本地存储中，不再担心关闭软件或刷新页面导致的心血丢失。
* 📋 **系统剪贴板文件/截图粘贴 (Clipboard Paste)**：支持直接使用快捷键（`Ctrl + V`）或鼠标右键粘贴，将系统剪贴板中的任意复制文件或屏幕截图（Clipboard Image）瞬间转换为当前会话的附件上传，免去手动寻找文件的繁琐步骤。
* 📂 **Agent 专属本地落盘通道 (Physical Uploads)**：上传的图片和附件会物理同步写入到项目根目录的 `.uploaded_files/` 文件夹中，打破传统大模型中转 API 的“多模态阉割”，让本地终端 Agent 可以用 Python、系统工具等物理读取并处理这些附件。

---

## ⚔️ 生态站位：为什么选择 Blank AI？

当前的 AI Agent 生态圈可谓神仙打架，但在面对如 OpenAI Codex CLI、Google Antigravity 等顶流竞品时，本项目凭借极简的架构与克制的设计，打出了独属于自己的生态位：

* ☯️ **双模无缝切换 (Dual-Mode)**：打破传统 Agent "纯 CLI 太乱，纯 GUI 太封闭"的困局。本客户端实现了前端 GUI 界面与 PTY 真实终端环境的 100% 双向同步切换。点击切换按钮，瞬间在原汁原味的极客字符界面与渲染精美的 Markdown 视图间无缝穿梭。
* ✨ **优雅的内省展示 (Elegant Introspection)**：大模型调用底层工具（Tool Use）和思维链（Thinking Process）的过程往往伴随大量刷屏。我们通过自研的 UI 将这些中间过程以灰色斜体及折叠面板优雅收纳——既保持了极客所需的底层透明度，又保证了对话界面的绝对清爽。
* 🪶 **轻量化降维打击**：相较于越做越重、强迫用户改变工作流的 IDE 级应用（如 Cursor 或全套的 Antigravity），本项目坚持做一个轻量、纯粹的桌面端 Wrapper。让你既能享受现代 GUI 的直观美学，又能随时退回 Terminal 掌控一切。

---

## 🛠️ 技术栈总览

| 技术层 | 选型组件 | 说明 |
| :--- | :--- | :--- |
| **应用容器** | **Electron 34+** | 负责本地硬件 API 调度、无边框悬浮窗口、窗口操作及 IPC 管道通信 |
| **前端框架** | **React 19 (TypeScript)** | 声明式界面渲染与高性能组件状态树管理 |
| **构建工具** | **Vite 6** | 闪电般的毫秒级模块热更新 (HMR) 与轻量级生产混淆打包 |
| **样式体系** | **TailwindCSS 4 + Lucide Icons** | 现代流式排版、无 ad-hoc 工具样式，完全统一的排版规范 |
| **渲染层** | **React Markdown + remark-GFM + PrismJS** | 支持极致流畅的 Markdown 渲染、表格支持以及程序员首选的代码高亮 |

---

## 📁 目录结构与模块说明

```bash
PyriteLab/
├── .env                        # 环境变量配置（API 密钥等）
├── .uploaded_files/            # 📂 物理落盘通道：暂存用户在聊天窗口中上传的文件
├── electron/                   # Electron 主进程及原生集成层
│   ├── main.cjs                # 主进程入口：窗口管理、PTY/会话管理、IPC 通信、文件落盘
│   └── preload.cjs             # 预加载脚本：暴露安全的 window.api 桥接层
├── src/                        # React 渲染进程前端源码
│   ├── main.tsx                # React 19 应用入口挂载点
│   ├── App.tsx                 # 👑 主应用：聊天区、终端模式、模型/思考选择器、侧边栏
│   ├── ChatMessage.tsx         # 消息组件：Markdown 渲染、思维链展开、代码高亮
│   ├── SettingsPanel.tsx       # ⚙️ 设置面板：通用设置、Providers、Skills/MCP、插件管理
│   ├── XtermTerminal.tsx       # 真实 PTY 终端组件（基于 xterm.js）
│   ├── types.ts                # TypeScript 类型定义
│   ├── settingsConfig.ts       # 内置 Providers/Plugins 配置与工具函数
│   └── index.css               # 全局样式：动画、TailwindCSS、滚动条隐藏
├── dist/                       # Vite 生产构建输出目录
├── vite.config.ts              # Vite 打包构建配置
├── tsconfig.json               # TypeScript 编译器配置
├── package.json                # 项目依赖与脚本指令集
└── README.md                   # 📄 本项目文档
```

---

## 👑 核心底层设计（新人打工人必读）

新加入项目的开发者在修改代码前，**务必仔细阅读以下核心设计，避免引入 regression 冲突**：

### 1. 物理级空间隔离的“窗口拖拽防碰撞系统” (`App.tsx` L508)
* **背景问题**：Electron 的 `-webkit-app-region: drag` 窗口拖拽区会直接被 OS 底层强行拦截，导致任何位于拖拽区内的标准 DOM 元素（如侧边栏的“收起/展开”按钮）被**无情吞掉点击事件**。
* **解法实现**：我们在 `App.tsx` 中对全局拖动条设置了**动态 X 轴物理坐标退缩机制**：
  * 当侧边栏**展开**时，拖动区左边界退缩至 `left-[260px]`，完全释放侧边栏顶部空间，保证收起按钮 100% 灵敏。
  * 当侧边栏**收起**时，拖动区左边界退缩至 `left-[120px]`，完美避开展开按钮。
  * **辅助右侧窗口拖曳抓手**：为了给用户提供更加便捷的窗口移动体验，我们在窗口最右侧内缩处（`fixed right-3 top-1/2 -translate-y-1/2`）新增了一个长 112px、宽 6px 的极细灰色圆角拖动条。它向内侧滑了 12px，从而**完美绕开了操作系统的原生窗口缩放边界（Resize border）检测**，保证既能 100% 灵敏地抓住拖拽，又能在最外侧边缘保留完美的拉伸缩放手势。
  * **修改规则**：若后续修改了侧边栏宽度，请务必同步调整此处的物理偏移量！

### 2. 状态常驻与窗口重置机制 (`SettingsPanel.tsx` L146)
* 为保证设置面板的极致响应速度，它在 React 树中为常驻渲染。
* **修改规则**：为防止用户在全屏或拉伸拖动后关闭面板、二次打开时布局错乱，每次 `isOpen` 激活时，必须强制重置 `position` (`{ x: 0, y: 0 }`) 以及 `isFullScreen` (`false`)，确保新打开时总是完美的窗口悬浮状态。

### 3. 多模态物理落地与 Agent 融合管道 (`App.tsx` & `electron/main.cjs`)
* **痛点**：第三方中转 API 网关常因为流量或策略限制，在传输时会**强行过滤或剔除**图片 base64 字节流。
* **物理落盘解法**：当用户在聊天框中粘贴/上传图片时：
  1. 前端 React (`App.tsx`) 的 `handlePaste` / `onChange` 读取并转化图片为 base64。
  2. 调用安全 IPC `window.api.saveUploadedFile(name, base64)`，由 Electron 主进程物理写入本地工作区的 `.uploaded_files/`。
  3. 前端会在 Prompt 中追加显式标注：`[用户附带了图片，已保存至项目根目录: .uploaded_files/${file.name}]`。
  4. 底层 `pi-agent` 即使在 API 级缺失了视觉，仍然能物理读取这个目录，实现本地代码/图片的完美解析！

### 4. 国际化多语言设计 (`SettingsPanel.tsx`)
* 通用设置中引入了 `blankAI_language` 选项（默认 `zh`），支持 `zh` (中文) 和 `en` (英文)。
* 修改 UI 时，请务必参照现有模式使用多语言字典对象或配合国际化文案，确保 GitHub 上的外国用户拥有顺畅的操作体验。

### 5. 本地持久化与会话自动恢复机制 (`App.tsx` / `SettingsPanel.tsx`)
* 会话数据利用本地缓存持久化存储。若在通用设置中开启了“保存历史对话” (`saveHistory`)，App 将在初始化时自动解密并恢复历史会话，确保对话历史绝不丢失。

---

## 🚀 开发者快速起步

### 0. 前置依赖：安装 pi CLI

PyriteLab 是 [pi](https://pi.dev) 的桌面 GUI 客户端，**必须依赖本地安装的 pi CLI 才能运行**。App 启动后会通过 PTY（伪终端）自动调用 pi CLI 执行 AI Agent 的所有核心能力（对话、工具调用、Session 管理等）。

**安装方式：**
```powershell
# 全局安装 pi CLI
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

> `--ignore-scripts` 禁用依赖生命周期脚本，pi 正常使用不需要 install scripts。详见 [pi Quick Start](https://github.com/earendil-works/pi-mono#quick-start)。

**配置 CLI 路径：**
默认情况下，App 会尝试从 `D:/pi-agent/packages/coding-agent/dist/cli.js` 加载 CLI。如果你的安装路径不同，请在 `.env` 中设置：
```env
PI_AGENT_CLI_PATH="/your/path/to/pi-coding-agent/dist/cli.js"
```

> ⚠️ 如果 pi CLI 未安装或路径配置错误，App 启动后会显示 `Pi Agent CLI not found` 错误，聊天和终端功能将无法使用。

### 1. 准备工作
确保本地已安装 [Node.js (LTS v18 或更高版本)](https://nodejs.org/)。

### 2. 获取源码并安装依赖
```powershell
# 切换至项目根目录
cd d:\PyriteLab

# 安装全部依赖包
npm install
```

### 3. 配置环境变量
复制 `.env.example` 并重命名为 `.env` 或 `.env.local`，填入您的 API 密钥：
```env
GEMINI_API_KEY="您的谷歌Gemini-API密钥"
```

### 4. 启动本地开发与调试
本项目支持 Electron 和 React 的双向热更新调试：
```powershell
# 启动热编译 Electron 客户端并在桌面窗口中渲染
npm run electron:dev
```
*提示：在窗口中按 `Ctrl + Shift + I` 可以直接开启 Chromium DevTools 调试前端控制台。由于 Electron 主进程代码（`main.cjs` 和 `preload.cjs`）不会随着 Vite HMR 自动刷新，若修改了主进程代码，**必须彻底关闭并重启终端的 electron:dev 进程**！*

### 5. 编译生产包
打包 Vite 静态资源并校验编译正确性：
```powershell
npm run build
```

---

## 🎨 贡献规范
1. **统一设计语言**：使用项目里精心编排的 TailwindCSS 颜色体系（如 `text-gray-700` , `border-gray-100` 等），禁止使用未经归纳的原生红蓝绿等强对比色彩。
2. **多语言配置**：新增任何通用 UI 设置，都应当提供对应的中英文对照文案，以保持其 GitHub 社区的开源品质。
3. **保持高可靠的 Exit Code**：提交代码或合并分支前，必须保证本地运行 `npm run build` 的返回值为 `0`。

如有疑问，请随时为本项目提 PR。让我们共同维护 Blank AI 的优雅！💻✨
