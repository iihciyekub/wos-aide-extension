# Chrome Web Store Listing Copy

## Short Description

### English

Research workflow helper for Web of Science, including DOI tools, WOS query generation, and journal lookup.

### 中文

面向 Web of Science 的科研工作流辅助工具，提供 DOI 处理、WOS 查询生成与期刊查询等功能。

## Detailed Description

### English

WOS Aide helps researchers work more efficiently on Web of Science.

Main features:

- DOI batch query tools on Web of Science pages
- WOS query generation with OpenAI or a user-configured local LM Studio endpoint
- Journal lookup with EasyScholar
- DOI workflow helpers and related export utilities
- PDF batch downloads with configurable batch size and second-based delays
- Drag-and-drop DOI extraction from user-selected text files
- A top-center floating shortcut toolbar with one-click SID copy

WOS Aide stores settings locally in the browser. It only sends data to third-party services when the user explicitly enables and uses those features.

Third-party services used only on user request:

- OpenAI
- EasyScholar
- User-configured local LM Studio endpoint

WOS Aide does not use a developer-operated backend server.

### 中文

WOS Aide 用于提升研究人员在 Web of Science 上的工作效率。

主要功能包括：

- 在 Web of Science 页面中提供 DOI 批量查询工具
- 使用 OpenAI 或用户自行配置的本地 LM Studio 生成 WOS 查询语句
- 使用 EasyScholar 进行期刊查询
- 提供 DOI 工作流辅助与相关导出工具
- 提供可调整批次大小及秒级延迟的 PDF 批量下载功能
- 支持拖入用户选择的文本文件并自动提取 DOI
- 提供位于页面顶部中央的悬浮快捷工具栏及 SID 一键复制

WOS Aide 将设置保存在浏览器本地，只有在用户主动启用并使用相关功能时，才会向第三方服务发送请求。

仅在用户主动使用时可能调用的第三方服务：

- OpenAI
- EasyScholar
- 用户自行配置的本地 LM Studio 接口

WOS Aide 不使用开发者自建后端服务器。

## Single Purpose

### English

This extension helps researchers perform Web of Science query building, journal lookup, DOI handling, and related research workflow tasks directly in the browser.

### 中文

本扩展用于帮助研究人员直接在浏览器中完成 Web of Science 查询构建、期刊查询、DOI 处理及相关科研工作流任务。

## Permissions Justification

### English

`storage`

- Stores API keys entered by the user, provider settings, panel state, workflow preferences, and local history.

`clipboardWrite`

- Used only when the user explicitly copies content, including one-click SID copy.

`activeTab`

- Used to work with the tab the user is currently using.

`scripting`

- Used to inject the extension UI and workflow tools into supported pages when needed.

Host permissions:

- `https://*.webofscience.com/*`: supported Web of Science pages
- `*://*.webofknowledge.com/*` and `*://*.isiknowledge.com/*`: legacy Web of Science compatibility
- `https://api.openai.com/*`: used only when the user selects OpenAI for WOS query generation
- `https://www.easyscholar.cc/*`: used only for EasyScholar journal lookup
- `http://127.0.0.1/*` and `http://localhost/*`: used only for a user-configured local LM Studio endpoint

### 中文

`storage`

- 用于保存用户输入的 API Key、服务提供方设置、面板状态、工作流偏好以及本地历史记录。

`clipboardWrite`

- 仅在用户主动复制内容时使用。

`activeTab`

- 用于操作用户当前正在使用的标签页。

`scripting`

- 用于在需要时向受支持页面注入扩展界面和工作流工具。

主机权限：

- `https://*.webofscience.com/*`：受支持的 Web of Science 页面
- `*://*.webofknowledge.com/*` 与 `*://*.isiknowledge.com/*`：兼容旧版 Web of Science 入口
- `https://api.openai.com/*`：仅在用户选择 OpenAI 生成 WOS 查询时使用
- `https://www.easyscholar.cc/*`：仅用于 EasyScholar 期刊查询
- `http://127.0.0.1/*` 与 `http://localhost/*`：仅用于用户自行配置的本地 LM Studio 接口

## Reviewer Notes

### English

- The extension primarily runs on Web of Science pages.
- A lightweight helper also runs on ChatGPT pages for prompt quickload support.
- API keys are stored locally in Chrome extension storage.
- External requests are sent only when the user explicitly uses OpenAI, EasyScholar, or LM Studio features.
- Local directory access is user-initiated through the browser file picker.

### 中文

- 扩展主要运行在 Web of Science 页面上。
- 另有一个轻量辅助功能会运行在 ChatGPT 页面上，用于提示词快速加载。
- API Key 保存在 Chrome 扩展本地存储中。
- 只有当用户主动使用 OpenAI、EasyScholar 或 LM Studio 功能时，才会发送外部请求。
- 本地目录访问仅在用户通过浏览器文件选择器主动授权时发生。

## Submission Reminder

### English

Before submission:

- Publish the privacy policy at a public HTTPS URL.
- Make sure the Chrome Web Store privacy disclosure form matches the actual extension behavior.

### 中文

提交前请确认：

- 将隐私政策发布到可公开访问的 HTTPS 页面。
- 确保 Chrome Web Store 的隐私披露表单与扩展实际行为保持一致。
