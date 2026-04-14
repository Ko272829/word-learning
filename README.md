# word-learning

一个基于 React 的背单词小应用，支持：

- 本地导入词库 `txt` / `json`
- 内置四级、六级默认词书
- 基于 SM-2 的复习节奏
- 三阶段学习流程
- 拼写与例句练习
- 本地备份与恢复

## 启动

```bash
npm install
npm run dev
```

## Netlify 与 DeepSeek

AI 词书生成功能通过 Netlify Functions 调用 DeepSeek，不会把 API Key 暴露到前端。

在 Netlify 项目里添加环境变量：

```bash
DEEPSEEK_API_KEY=你的 DeepSeek API Key
```

然后重新部署站点。

## 构成

- `src/App.jsx`: 从原始 `背单词.txt` 提取的主应用代码
- `src/main.jsx`: React 入口
- `index.html`: 页面入口，使用 Tailwind CDN 提供样式类
- `netlify/functions/generate-book.mjs`: AI 词书生成服务端函数
