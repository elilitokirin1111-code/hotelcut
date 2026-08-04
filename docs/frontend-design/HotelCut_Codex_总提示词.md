# HotelCut 前端重构：Codex 总提示词

将下面整段复制给 Codex。先把本设计包放入仓库，例如：

```text
docs/frontend-design/
  HotelCut_前端产品设计与实施计划.md
  HotelCut_Codex_总提示词.md
  screens/*.png
  01-dashboard.html ... 05-render.html
  style.css
```

---

## 总提示词正文

你现在是 HotelCut 项目的资深前端架构师与产品工程师。请在当前仓库中完成 HotelCut Web 前端产品化重构。

### 目标

把当前 M5 编辑器原型和 M7 酒店选择入口，整合为一个真实可用的“酒店短视频 AI 生产工作台”，形成以下闭环：

1. 登录/开发种子账号；
2. 组织与酒店选择；
3. 酒店资料和 BrandKit；
4. 素材上传与 AI 分析；
5. VideoBrief 与模板选择；
6. 素材复核和确定性项目生成；
7. 轻量 Studio 编辑；
8. 自动保存不可变修订；
9. 渲染、质量检查、重试和交付文件下载。

视觉参考位于：

- `docs/frontend-design/screens/01-dashboard.png`
- `docs/frontend-design/screens/02-assets.png`
- `docs/frontend-design/screens/03-create-video.png`
- `docs/frontend-design/screens/04-editor.png`
- `docs/frontend-design/screens/05-render.png`

这些图片是布局、层级、密度和视觉气质参考，不得把截图直接嵌入页面，不得为了像截图而写死业务数据。

### 第一步：先审计，不要马上重写

请先读取并理解：

- 根目录 `README.md`、`AGENTS.md`；
- `docs/product-spec.md`；
- `docs/workspace.md`；
- `docs/architecture.md`；
- `docs/editing.md`；
- `docs/automatic-editing.md`；
- `docs/media-analysis.md`；
- `docs/rendering.md`；
- `docs/quality-control.md`；
- `apps/web/src/**`；
- `apps/web/package.json`；
- `apps/api/src/app.ts`；
- `apps/api/src/asset-routes.ts`；
- `apps/api/src/project-routes.ts`；
- `apps/api/src/render-routes.ts`；
- `packages/schemas/src/**`；
- `packages/editor/src/**`；
- `packages/timeline/src/**`。

运行并记录：

```bash
pnpm --filter @hotelcut/web typecheck
pnpm --filter @hotelcut/web test
pnpm --filter @hotelcut/web build
pnpm test
```

先输出一份简短审计结果：

- 已存在的能力；
- 可复用组件；
- API 与共享契约；
- 缺失页面；
- 风险；
- 你准备按什么顺序修改。

在审计完成后再开始编码。不要删除现有可用功能和测试。

### 必须保留的技术方向

- React 19；
- TypeScript 严格模式；
- Vite；
- Tailwind CSS；
- TanStack Router；
- TanStack Query；
- Zod 共享契约；
- Vitest、Testing Library、Playwright；
- pnpm workspace 与现有 monorepo 边界。

不要引入大型 UI 框架。可按需增加小型依赖，但每个依赖必须说明原因。优先考虑：

- `lucide-react`；
- `react-hook-form`；
- `@hookform/resolvers`；
- `clsx`；
- `tailwind-merge`。

### 产品边界

HotelCut 不是通用剪辑器，也不是社交平台发布工具。首版不要实现：

- 专业自由时间线；
- 数字人；
- 语音克隆；
- 生成式视频；
- 自动抓取或登录第三方平台；
- 自动发布；
- 实时多人协作；
- 插件市场。

AI 结果必须：

- 可编辑；
- 可解释；
- 可重试；
- 可恢复；
- 显示真实状态；
- 不编造 CTA 和酒店事实。

### 路由与页面

建立或整理以下路由：

```text
/login
/hotels
/hotels/$hotelId
/hotels/$hotelId/projects
/hotels/$hotelId/projects/new
/projects/$projectId/edit
/hotels/$hotelId/assets
/assets/$assetId
/hotels/$hotelId/brand
/hotels/$hotelId/templates
/hotels/$hotelId/renders
/render-jobs/$renderJobId
/hotels/$hotelId/audit
/settings
```

实现统一 AppShell：

- 236 px 左侧导航；
- 72 px 顶栏；
- 酒店切换器；
- 面包屑；
- 页面标题与主操作；
- 用户菜单；
- 全局 Toast；
- ErrorBoundary；
- 404；
- 会话过期处理。

Studio 编辑器使用单独的深色布局，不强制放在浅色 AppShell 内。

### 视觉要求

运营页面：

- 背景 `#F3F5F5`；
- 侧栏 `#10242B`；
- 品牌金 `#D09A59`；
- 成功色 `#2C9B82`；
- 卡片白色、细边框、16–20 px 圆角；
- 清晰、克制、酒店品牌质感；
- 不使用大面积高饱和渐变；
- 不使用 Emoji 作为正式图标。

编辑器：

- 主背景 `#0D1417`；
- 面板 `#162226`；
- 竖屏预览居中；
- 左场景、右检查器、底部多轨时间线；
- 保存状态、修订号、撤销重做和渲染按钮始终可见。

字体栈：

```css
Inter, "Noto Sans SC", "Microsoft YaHei", sans-serif
```

建立 CSS Variables / Tailwind Theme Token，不要在大量组件中重复硬编码颜色。

### 推荐代码结构

```text
apps/web/src/
  app/
    router.tsx
    query-client.ts
    app-shell.tsx
  routes/
  features/
    auth/
    hotel/
    brand-kit/
    assets/
    project-wizard/
    editor/
    rendering/
  components/
    ui/
    feedback/
    layout/
  api/
  styles/
```

现有 `apps/web/src/editor` 可逐步迁移，不要一次性删除。保证每个阶段可以运行。

### API 规则

必须使用现有 API 和 `@hotelcut/schemas` 的 Zod 契约。不要在 Web 中复制一套漂移的 DTO。

统一 API Client：

- Base URL 继续使用 same-origin `/api`；
- 自动附加当前 Actor/Session；
- 解析结构化错误；
- 保留 `requestId`；
- AbortSignal 支持；
- 401/403/404/409/429/500 分别处理；
- 不记录上传签名、Token、敏感 Header。

Query Key 必须包含租户边界：

```ts
['assets', hotelId, filters][('video-projects', hotelId)][('brand-kit', hotelId)];
```

切换酒店时，不能显示前一个酒店的缓存数据。

### 工作台

按 `01-dashboard.png` 实现：

- 内容准备度；
- 项目、素材、可用镜头、渲染任务指标；
- 最近项目；
- 渲染队列；
- 一条可执行的 AI 内容建议；
- 主 CTA“创建视频”。

数据缺失时不要伪造指标。可以显示“尚无数据”或基于现有接口计算的值。

### BrandKit

实现：

- 酒店基础信息；
- Logo；
- 品牌色；
- 字体；
- 字幕预设；
- CTA；
- 默认片尾；
- 实时 9:16 预览；
- 未保存提示；
- Zod 校验；
- 保存成功/失败反馈。

任何 CTA 事实只能来自 BrandKit 或用户明确输入。

### 素材库

按 `02-assets.png` 实现：

- 分类与状态筛选；
- 搜索文件名、标签和转写；
- 网格/列表；
- 批量选择；
- 上传队列；
- 详情抽屉；
- 分析状态；
- 分析重试；
- 人工标签/时间区间；
- 衍生文件下载。

Multipart 上传：

1. 使用 Web Crypto 计算 SHA-256；
2. 创建上传会话；
3. 分片并发默认 3；
4. 显示文件级与分片级进度；
5. 收集 ETag；
6. 完成上传；
7. 进入分析状态；
8. 支持取消和失败重试；
9. 不要一次把大文件复制到多个 ArrayBuffer。

分析轮询使用 TanStack Query，任务终态后停止。

### AI 成片向导

按 `03-create-video.png` 实现四步：

1. Brief；
2. 模板；
3. 素材复核；
4. 生成项目。

初始模板：

- Host presentation + B-roll；
- Room selling-point montage；
- Hotel promotion。

素材复核支持：

- 锁定；
- 排除；
- 替换；
- 查看候选评分；
- 显示素材缺口；
- 估算时长与镜头数；
- 展示模板版本和 Seed。

相同输入、模板版本和 Seed 必须保持确定性。页面不可暗示随机“再来一个”会保持同样结果，除非明确改变 Seed。

### Studio 编辑器

在现有 M5 功能上按 `04-editor.png` 重构，而不是重新发明编辑引擎。

必须保留/接入：

- `@hotelcut/editor` 命令；
- `HotelVideoProjectV1`；
- SceneRail；
- StudioPreview；
- Inspector；
- SimpleTimeline；
- 撤销/重做；
- 自动保存；
- 不可变修订。

增强：

- 真实项目 API 加载；
- 保存状态；
- 修订号；
- 409 冲突处理；
- 离开页面保护；
- 选镜解释；
- 锁定场景；
- 质量问题定位。

自动保存：

- 本地命令立即更新；
- 800 ms 防抖；
- 保存请求携带 `baseRevision`；
- 成功后更新 revision；
- 409 时停止覆盖，并提供：加载远端、下载本地 JSON、复制为新项目。

### 渲染与质检

按 `05-render.png` 实现：

- 创建任务；
- 阶段进度；
- 取消；
- 失败重试；
- 尝试历史；
- 结构化日志；
- 质量分数与检查项；
- MP4、SRT、封面、项目 JSON、媒体清单、解释日志、质量报告下载；
- 下载 URL 过期后重新生成；
- 从质量问题跳到编辑器对应场景。

轮询：

- 0–30 秒：2 秒；
- 30–120 秒：4 秒；
- 之后：8 秒；
- 页面隐藏时降低频率；
- 终态停止。

### 状态与反馈

每个异步页面必须包含：

- Skeleton；
- Empty State；
- Error State；
- Retry；
- 404/无权限；
- 局部失败；
- Toast；
- 危险操作确认；
- 乐观更新回滚。

禁止仅在 Console 打印错误。

### 响应式

主要目标是桌面 1280–1920。

- 1280 以上完整三栏；
- 小于 1280 时右侧详情改为 Drawer；
- 小于 1024 时侧栏折叠；
- Studio 小于 1180 时检查器可收起；
- 移动端只保证工作台、项目状态和下载可用，不要求在手机上完成时间线编辑。

### 可访问性

- WCAG AA 对比度；
- 所有 icon button 有 `aria-label`；
- 焦点状态清晰；
- 表单错误关联字段；
- Dialog 管理焦点；
- Space 播放/暂停；
- Cmd/Ctrl+Z 撤销；
- 方向键移动播放头；
- 支持 `prefers-reduced-motion`。

### 测试

至少新增/保持：

- 路由与酒店上下文测试；
- API 解析与错误测试；
- BrandKit 表单测试；
- 上传状态机测试；
- 素材筛选测试；
- Brief/模板向导测试；
- 编辑器自动保存与 409 冲突测试；
- 渲染轮询、取消和重试测试；
- E2E 核心闭环；
- E2E 跨租户 404。

每一阶段完成后运行：

```bash
pnpm --filter @hotelcut/web typecheck
pnpm --filter @hotelcut/web test
pnpm --filter @hotelcut/web build
```

最后运行仓库级测试。

### 实施顺序

按小步可回滚方式实施：

1. 设计 Token、AppShell、路由、错误边界；
2. 登录与酒店选择；
3. 工作台；
4. 酒店与 BrandKit；
5. 素材库与上传；
6. 项目列表与 AI 成片向导；
7. 现有 Studio 接入真实项目；
8. 渲染与质检；
9. 操作记录与配额；
10. 响应式、无障碍、E2E 和文档。

每完成一阶段：

- 总结改动文件；
- 说明接口映射；
- 给出测试结果；
- 列出未完成项；
- 不要在同一提交中夹带无关重构。

### 完成定义

只有满足以下条件才算完成：

- 主闭环能用真实 API 走通；
- 现有编辑能力未回退；
- 所有关键异步状态可见；
- 失败可重试；
- 跨租户数据不泄漏；
- typecheck、test、build 通过；
- 视觉与参考图在信息架构、密度和层级上接近；
- 没有用截图、硬编码数据或静默 Mock 冒充完成。

现在先执行“仓库审计与实施计划”，不要立即大规模修改代码。审计后从 Phase 1 开始逐步实施。
