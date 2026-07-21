# Chrome Web Store Listing Copy

## Short Description

### English

Browser research helper with DOI tools and specialized Web of Science and CNKI workflows.

### 中文

适用于普通网页的科研工作流辅助工具，提供 DOI 处理及 Web of Science、知网专用功能。

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

- Used to inject the extension UI and workflow helpers into ordinary web pages when needed.

Host permissions:

- `http://*/*` and `https://*/*`: allow general research and download helpers on publisher, institution proxy, and other ordinary web pages without repeated per-site permission prompts
- Site-specific WOS, CNKI, and ChatGPT behavior remains gated by the current page URL
- The same access covers user-requested OpenAI and EasyScholar calls and user-configured local LM Studio endpoints

### 中文

`storage`

- 用于保存用户输入的 API Key、服务提供方设置、面板状态、工作流偏好以及本地历史记录。

`clipboardWrite`

- 仅在用户主动复制内容时使用。

`activeTab`

- 用于操作用户当前正在使用的标签页。

`scripting`

- 用于在需要时向普通网页注入扩展界面和科研工作流辅助工具。

主机权限：

- `http://*/*` 与 `https://*/*`：让科研和下载辅助功能可在出版社、机构代理及其他普通网页运行，无需逐站点重复授权
- WOS、知网与 ChatGPT 专用行为仍会根据当前页面地址启用
- 同一权限也覆盖用户主动发起的 OpenAI、EasyScholar 请求和自行配置的本地 LM Studio 接口

## Reviewer Notes

### English

- The general content script is available on standard HTTP and HTTPS pages so research and download helpers work across publisher and proxy sites.
- WOS, CNKI, and ChatGPT-specific behavior activates only on matching pages.
- API keys are stored locally in Chrome extension storage.
- External requests are sent only when the user explicitly uses OpenAI, EasyScholar, or LM Studio features.
- Local directory access is user-initiated through the browser file picker.

### 中文

- 通用内容脚本可在普通 HTTP 和 HTTPS 页面运行，使科研和下载辅助功能适用于出版社及机构代理网站。
- WOS、知网和 ChatGPT 专用行为只在匹配页面启用。
- API Key 保存在 Chrome 扩展本地存储中。
- 只有当用户主动使用 OpenAI、EasyScholar 或 LM Studio 功能时，才会发送外部请求。
- 本地目录访问仅在用户通过浏览器文件选择器主动授权时发生。

## Submission Reminder

### English

Before submission:

- Verify the published privacy policy at `https://iihciyekub.github.io/wos-aide-extension/`.
- Make sure the Chrome Web Store privacy disclosure form matches the actual extension behavior.

### 中文

提交前请确认：

- 确认隐私政策已发布在 `https://iihciyekub.github.io/wos-aide-extension/`。
- 确保 Chrome Web Store 的隐私披露表单与扩展实际行为保持一致。
