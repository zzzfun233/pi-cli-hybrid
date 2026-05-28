<div align="center">
  <img width="1200" height="475" alt="Blank AI Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
  <h1>Blank AI Desktop Client</h1>
  <p>一个轻量的 AI 桌面助手，基于 Electron + React 19 + TypeScript</p>
  <p>
    <img src="https://img.shields.io/badge/Electron-34+-47848F?logo=electron&logoColor=white" />
    <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" />
    <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
    <img src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white" />
  </p>
</div>

## 这是什么

Blank AI 是 [pi CLI](https://github.com/earendil-works/pi-mono) 的桌面 GUI 前端。它在 Electron 里套了一层好看的壳子，让你可以在 GUI 聊天界面和真实终端之间随意切换，不用盯着满屏的命令行输出。

**一句话总结：CLI 的能力 + GUI 的体验。**

## 主要功能

- **GUI / 终端双模切换** — 聊天界面和 PTY 终端一键切换，随时在图形化和命令行之间来回
- **思维链展示** — 模型的推理过程可折叠显示，不刷屏，想看就看
- **思考强度调节** — 6 档推理深度可调，从关闭到极限推理
- **MCP 插件** — 支持接入 MCP 服务器，让模型调用本地工具
- **Skills 指令** — 可配置的 Prompt 模板，拖拽启用
- **文件/截图粘贴** — `Ctrl+V` 直接粘贴图片和文件，自动落盘到本地供 Agent 读取
- **对话持久化** — 历史对话本地加密存储，关了再开还在
- **中英双语** — 界面支持中文/English 切换

## 技术栈

| 层 | 技术 |
| :--- | :--- |
| 容器 | Electron 34+ |
| 前端 | React 19 + TypeScript |
| 构建 | Vite 6 |
| 样式 | TailwindCSS 4 + Lucide Icons |
| 渲染 | React Markdown + PrismJS |

## 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) v18+
- 安装 pi CLI：

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

### 安装 & 运行

```bash
# 克隆项目
git clone https://github.com/zzzfun233/pi-cli-gui-ide.git
cd pi-cli-gui-ide

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 API Key

# 启动开发模式
npm run electron:dev
```

> **注意：** 如果你的 pi CLI 安装路径不是默认的，需要在 `.env` 中设置 `PI_AGENT_CLI_PATH`。

### 构建生产包

```bash
npm run build
```

## 项目结构

```
├── electron/
│   ├── main.cjs          # Electron 主进程
│   └── preload.cjs       # 预加载脚本
├── src/
│   ├── App.tsx            # 主应用组件
│   ├── ChatMessage.tsx    # 消息渲染组件
│   ├── SettingsPanel.tsx  # 设置面板
│   ├── XtermTerminal.tsx  # 终端组件
│   └── ...
├── .env.example           # 环境变量模板
├── package.json
└── vite.config.ts
```

## 参与贡献

欢迎 PR，提交前请确保：

1. 遵循项目现有的 TailwindCSS 配色规范
2. UI 文案提供中英双语
3. `npm run build` 能正常通过

架构设计细节见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

---

## Contributors

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/zzzfun233">
        <img src="https://github.com/zzzfun233.png" width="80px;" alt="zzzfun233"/>
        <br />
        <sub><b>zzzfun233</b></sub>
      </a>
      <br />
      <sub>创建者</sub>
    </td>
    <td align="center">
      <a href="https://claude.ai">
        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Anthropic_logo.svg/1200px-Anthropic_logo.svg.png" width="80px;" alt="Claude"/>
        <br />
        <sub><b>Claude</b></sub>
      </a>
      <br />
      <sub>AI 协作</sub>
    </td>
  </tr>
</table>
