---
name: vision
description: 当用户分享图片路径、消息中出现"Saved attachments:"并列出图片、要求分析/描述/识别图片内容时，调用 vision.cjs 识图。
---

# 识图能力

你的底层模型不具备原生识图能力。遇到图片时，**不要用 Read 工具**，改用 vision.cjs：

```
node ".claude/skills/vision/vision.cjs" "<图片路径>" "用中文描述这张图片"
```

注意：对于 Windows 路径中的反斜杠，请使用正斜杠或双反斜杠，例如 `D:/PyriteLab/图片.png`

## 触发场景

- 用户分享图片路径（本地或网络 URL）
- 消息中出现 "Saved attachments:" 并列出图片
- 用户要求分析、描述、识别图片内容
