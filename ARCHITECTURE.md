# 架构设计笔记

修改代码前建议先读完这个文件，避免踩坑。

## 1. 窗口拖拽防碰撞

**问题：** Electron 的 `-webkit-app-region: drag` 会被 OS 拦截，导致拖拽区内的按钮（比如侧边栏收起按钮）点击事件被吞掉。

**解法：** `App.tsx` 中对拖动条设置了动态 X 轴偏移：
- 侧边栏展开时，拖动区左边界退缩到 `left-[260px]`
- 侧边栏收起时，退缩到 `left-[120px]`

右侧有一个辅助拖动条（112×6px），向内缩了 12px 避开 OS 的窗口缩放边界检测。

> ⚠️ 改了侧边栏宽度就要同步改这里的偏移量。

## 2. 设置面板状态管理

设置面板在 React 树中**常驻渲染**（不是按需创建），所以打开速度很快。

每次 `isOpen` 变为 `true` 时，必须重置 `position` 为 `{ x: 0, y: 0 }` 并把 `isFullScreen` 设为 `false`，否则用户拖拽/全屏后再打开会布局错乱。

## 3. 文件上传的物理落盘

**问题：** 第三方 API 网关可能过滤掉图片 base64 数据。

**解法：**
1. 前端 `handlePaste` / `onChange` 读取图片转 base64
2. 通过 IPC `window.api.saveUploadedFile(name, base64)` 写入 `.uploaded_files/`
3. 在 Prompt 中标注文件路径
4. Agent 可以直接从本地读取文件

## 4. 多语言

通用设置中的 `blankAI_language` 控制界面语言，支持 `zh` 和 `en`。新增 UI 文案时请提供双语。

## 5. 会话持久化

开启 `saveHistory` 后，对话数据加密存储在本地。App 启动时自动恢复。
