# 星罗Tab 2.0 规划实现审计、2.x 路线图与 3.0 候选方向

## 1. 文档信息

- 审计日期：2026-07-16
- 当前源码：`D:\workspace_test\xingluotab`
- 原始规划与 1.0 基线：`D:\workspace_test\Mumu-GoogleExtGet-Keep`
- 审计方式：只读检查原始 PRD、开发设计、行为契约、复扫报告、进度记录、Git 历史、当前源码、测试与构建产物
- 本文目的：回答“2.0 最初规划了什么、已经实现了什么、2.0.1—2.0.3 原计划继续做什么、什么时候适合进入 3.0、项目还有哪些优化空间”
- 本文不是新的需求定稿。第 8 节的 3.0 内容仅为候选池，需要后续产品评审。

## 2. 审计结论

### 2.1 总体判断

星罗Tab 2.0 的功能范围已经达到原始 `2.0.0` PRD 所定义的完成状态，且完成了对 TabTab 1.0 已确认核心行为的替代。这个“完成”主要指：

1. Space → Group → Tab 的核心管理闭环完成。
2. Current tabs、保存会话、搜索、标签、排序、四种视图和 Zen 模式完成。
3. 本地备份、单空间导入导出、Toby 导入、GitHub Gist、WebDAV 和自动同步完成。
4. 关键跨空间写入、导入写入具备失败回滚。
5. 大数据拖拽、虚拟化、展开/收纳和滚动体验经过专项优化。
6. 11 语种、完整视觉主题、Logo、favicon 兜底等产品化能力完成。
7. 2.0 作为独立扩展存在，不覆盖 1.0，不复用 1.0 的 manifest key、storage 或备份命名空间。

但当前仓库仍存在“功能完成”和“长期发布工程完成”之间的差距：

- TypeScript 和单元测试通过，但 ESLint 尚有 15 个错误。
- Chrome/Edge 可以构建和打包，但缺少统一 CI、覆盖率和正式发布流水线。
- 完整 Edge/CDP 回归工具主要仍位于原始仓库根目录，当前仓库没有完整继承。
- 当前工作区包含尚未提交的滚动/favicon 等优化，尚未形成干净版本标签。
- 权限、凭据、依赖漏洞、MV3 后台调度和包体积仍是明确技术债。

因此更准确的状态是：

> `2.0.0` 功能基线完成；当前仓库处于“功能完整、仍需发布治理收口”的 2.x 阶段。

### 2.2 当前重新验证结果

本次审计对当前仓库重新执行了以下检查：

| 检查项 | 结果 |
|---|---|
| `npm run compile` | 通过 |
| `npm test` | 30 个测试套件、164 个用例全部通过 |
| Chrome 构建与 ZIP | 通过，约 1.09 MB |
| Edge 构建与 ZIP | 通过，约 1.09 MB |
| ESLint | 未通过，共 15 个 error |
| 当前源码规模 | 72 个源码/入口文件，约 11,846 行 |
| 当前测试规模 | 31 个测试/辅助文件，约 2,528 行 |
| Chrome 主 options chunk | 约 950,818 B，超过 Vite 500 kB 警告阈值 |
| 动态图标 chunk | 约 1,495 个 |

本次没有重新运行原仓库的完整浏览器 CDP、真实 GitHub、真实 Koofr 测试。原始验收记录表明这些链路曾通过，但当前仓库在 2026-07-15 之后又发生布局、滚动和 favicon 变更，因此正式发布前仍应基于当前精确代码重新跑一次完整矩阵。

## 3. 项目来源与版本边界

### 3.1 项目来源

原仓库 `Mumu-GoogleExtGet-Keep` 同时包含：

- `0.4.8_0/`：TabTab 1.0 的只读构建产物，用于行为反推和兼容基线。
- `xingluotab/`：重新建立的 WXT + React + TypeScript 2.0 可维护源码。
- 根目录规划文档：PRD、开发设计、行为契约、运行探索报告、五轮复扫报告、版本策略和协作记录。
- 根目录 `tools/`：Edge/CDP 完整烟测、视觉基线、大数据夹具、快捷键和性能测试工具。

当前独立仓库 `D:\workspace_test\xingluotab` 是 2.0 源码的后续工作仓库：

- 2026-07-12 导入完整 2.0 基线。
- 2026-07-15 增加滚动停止、布局稳定和路由切换闪烁修复。
- 当前工作区继续包含 favicon 缓存和滚动体验相关的未提交改动。

### 3.2 2.0 与 1.0 的关系

原版本策略明确规定：

- 2.0 是独立产品线，不覆盖 1.0。
- 2.0 不携带旧 manifest `key`，安装时产生独立扩展 ID。
- 1.0 与 2.0 使用不同 `chrome.storage`，可以并存。
- 2.0 使用 `xingluotab:*` 存储键和带 schemaVersion 的独立备份结构。
- 2.0 不直接读取 1.0 本地 storage；历史数据迁移只能通过明确的导入流程。

这个边界已经在当前 `wxt.config.ts`、storage repository、backup schema 和同步命名中落实。

## 4. 2.0.0 原始规划与实现对照

### 4.1 产品原则和非目标

原始产品原则：本地优先、低干扰、快速整理、可迁移、可恢复。

原始非目标：

- 不建设账号、团队、邀请和在线协作体系。
- 不依赖星罗Tab自有服务器保存用户数据。
- 不在 2.0.0 实现浏览历史全文搜索、在线分享链接或订阅计费。
- 不兼容 Toby 私有云服务端协议。

当前实现保持了这些边界，没有引入账号、团队、遥测、订阅或自有服务端。

### 4.2 FR-01 空间管理

原规划：

- 创建、重命名、删除和拖动排序 Space。
- Space 图标选择。
- 单 Space 导入、导出；导入时重建内部 ID。
- 删除前二次确认。

当前状态：已实现。

实现要点：

- `SpaceSidebarPageLayout` 负责跨路由共用的创建、导入、Toby 导入、图标、导出和删除。
- PointerSensor 与 KeyboardSensor 均支持 Space 排序。
- 单空间导入会重新生成 Space/Group/Tab ID，并检查冲突。
- 零 Space 时跳转 About/引导页面，不再强制生成默认 Space。
- 图标白名单恢复到原版约 304 个，并兼容部分历史 PascalCase 名称。

剩余优化：Space 创建、重命名、删除仍可进一步统一到通用事务仓储，避免多键写入中途失败造成摘要与实体不一致。

### 4.3 FR-02 分组管理

原规划：

- 新建、重命名、删除、置顶、跨 Space 移动和拖动排序 Group。
- 单个与全部展开/收纳。
- 点击立即响应，持久化异步执行，快速连续操作以后一次为准。
- 大量内容下不做逐帧高度动画。

当前状态：已实现。

实现要点：

- Group 管理、pin/unpin、跨 Space 移动、标签编辑均已接入。
- 非 Drag & Drop 排序模式会禁用 Group 手动排序。
- Collapse 立即卸载内容，只进行一次虚拟列表尺寸修正；后续 Group 使用 transform 位移。
- 展开只对内容做轻量进入效果，并尊重 `prefers-reduced-motion`。
- 收纳设置采用有序持久化，避免快速操作乱序覆盖。

### 4.4 FR-03 标签管理

原规划：

- 保存当前窗口、拖入单个当前标签。
- 编辑标题与 URL、删除、组内/跨组/跨 Space 移动。
- 打开单个标签或整个 Group。
- 拒绝 `javascript:`、`data:`、`vbscript:` 等危险 URL。

当前状态：已实现。

实现要点：

- Tab 与 Group 跨 Space 移动统一使用 `saveSpaceTransfer()`。
- 任一目标/源写入失败都会尝试恢复两边原快照。
- 危险 URL 防护覆盖备份校验、Toby 解析、手动编辑和浏览器 tabs API 适配层。
- 单标签打开、整组打开、后台打开、Alt 点击删除等 1.0 行为已经对齐。

### 4.5 FR-04 拖拽与碰撞

原规划：

- 支持 Space、Group、收藏 Tab 和 Current Tab 拖拽。
- 拖动期间只更新轻量预览，不反复保存完整 Space。
- 跨组起始、中间、末尾均有稳定落位。
- 大数据下不因拖拽触发整页刷新或大量长任务。

当前状态：已实现，并经过多轮性能专项优化。

实现要点：

- 拖动时只记录落点，不移动真实 Space 数据；松手后一次提交。
- 对碰撞候选进行类型过滤和稳定等待，避免边界抖动。
- 拖动滚动期间暂停碰撞，滚动停止后恢复。
- Space 内 Group 始终虚拟化；单 Group 达到 60 Tabs 后启用卡片网格虚拟化。
- 大样本历史验证覆盖 97 Groups / 300 Tabs 的最大页面和 937 Tabs 全局数据。

剩余优化：`SpacePage` 仍集中承载 DnD、虚拟化、对话框和数据加载，是当前最大维护风险。

### 4.6 FR-05 搜索、标签筛选与排序

原规划：

- `Ctrl/Cmd + J` 全局搜索标题和 URL。
- Group 多标签、逗号输入、trim、去重。
- 具体标签和“无标签”筛选。
- Drag & Drop、Alphabetical、Starred To Top、Date Created 四种 Group 排序。

当前状态：已实现。

实现要点：

- 搜索使用 cmdk `defaultFilter` 进行模糊评分和相关度排序。
- 空查询可以浏览全部收藏记录。
- Search Dialog 使用 Radix Dialog，支持焦点约束、遮罩、Escape、键盘选择和 `aria-activedescendant`。
- 搜索索引监听共享 Space version，其他 options 页或同步拉取后会刷新。
- 排序和标签筛选只改变派生显示结果，不破坏手动顺序。

剩余优化：每次打开搜索仍会读取所有 Space；任一损坏 Space 可能让整个搜索索引加载失败。可考虑版本化缓存、分 Space 容错和增量索引。

### 4.7 FR-06 视图与信息密度

原规划：Card、List、Compact、Grid 四种视图，偏好持久化，并参与虚拟高度估算。

当前状态：已实现。

实现要点：

- 四种视图具有不同最小宽度、gap、cardHeight 和 rowHeight。
- 视图切换即时生效并保存。
- Group 和大 Group Tab Grid 都根据实际内容宽度动态估算列数。

### 4.8 FR-07 当前标签栏

原规划：

- 当前窗口标签显示、升降序、收纳、关闭、激活、保存全部和拖动保存。
- 是否包含 pinned browser tabs 由设置控制。
- 收藏、Current tabs、Search 和 DnD preview 使用统一 favicon 解析链路。

当前状态：已实现。

实现要点：

- Current tabs 使用独立虚拟列表。
- 新建/更新/移动/关闭事件分别处理，尽量保持卡片身份稳定。
- 保存后按设置保留 pinned browser tabs，关闭可关闭的普通标签。
- favicon 解析顺序为记录自带 URL → Chromium `_favicon` 本地缓存 → 稳定域名/特殊协议兜底。
- 当前工作区正在继续优化 favicon 缓存上限、负缓存、并发预热和 retained resource 管理。

### 4.9 FR-08 打开行为与快捷键

原规划：

- 单 Tab 支持新建或替换当前标签。
- 整 Group 支持普通 Tabs 或浏览器原生 Tab Group。
- action、Dashboard 命令和单实例命令行为明确。

当前状态：已实现。

实现要点：

- 浏览器适配层支持 active/background、replace、native group title。
- action 与单实例命令使用 `runtime.openOptionsPage()` 聚焦/复用 Dashboard。
- Dashboard new-tab 命令每次创建新页面。
- 快捷键建议值已写入 Manifest；物理快捷键最终分配仍受浏览器扩展快捷键页控制。

### 4.10 FR-09 外观与主题

原规划：

- Light、Dark、System。
- 9 套 Light Accent。
- 4 套 Light Visual Theme：Professional、Mica、Aurora、Paper。
- 4 套 Dark Visual Theme：Professional、Mica、Aurora、OLED。
- 2 MiB PNG/JPEG Logo，裁成 128×128 PNG。
- 主题语义色符合可读性要求。

当前状态：已实现。

实现要点：

- Color mode、Visual style、Accent、Zen theme 四层偏好独立。
- System 模式实时监听 `prefers-color-scheme`。
- Light/Dark visual preference 分别保存。
- Logo 经过文件类型、大小、居中裁切和缩放处理。
- 历史 Edge/CDP 视觉矩阵覆盖 8 套视觉风格和 9 套 Light Accent。

### 4.11 FR-10 Zen 模式

原规划：

- 隐藏 Sidebar、Current tabs 和编辑操作。
- Minimal、Ghibli、Glass 三种主题。
- 右上角退出控件仅 hover/focus 显示，Escape 退出。
- 偏好持久化。

当前状态：已实现。

实现要点：Zen 模式有独立静态主题映射，避免 Tailwind 裁掉动态类；进入 Zen 后管理与拖拽控件不渲染，Space 内容保持可浏览。

### 4.12 FR-11 备份、导入与同步

原规划：

- 完整本地备份导入导出、单 Space 导入导出、Toby 导入。
- GitHub Gist、WebDAV 手动推拉和自动同步。
- 冲突时不静默覆盖较新数据。
- 导入先完整校验，写入失败回滚。

当前状态：已实现。

实现要点：

- 完整备份使用 `type: xingluotab-backup` 和 `schemaVersion: 1`。
- 单 Space 使用 `type: xingluotab-space`。
- 校验覆盖结构、ID 唯一性、引用、pin、时间戳和 URL 安全。
- 完整/单 Space 导入在写入前快照所有 Space 相关键，中途失败时恢复。
- GitHub 使用私有 Gist；WebDAV 使用 `/xingluotab/xingluotab_backup.json`。
- push/pull/auto 均比较版本；手动冲突要求二次确认后才能 force。
- `SPACE_VERSION`、`data_pull_done`、`app_created` 和 options 跨页面刷新已形成共享闭环。

剩余优化：同步版本目前以 `Date.now()` 为核心，存在跨设备时钟偏差；自动同步调度仍依赖 Service Worker 内存 timer；凭据明文保存在 extension local storage。

### 4.13 FR-12 国际化

原规划：英语、简体中文、繁体中文、德语、西班牙语、法语、意大利语、日语、韩语、葡萄牙语、俄语。

当前状态：已实现。

实现要点：

- 11 个 UI 字典由同一 TranslationKey 类型约束。
- 浏览器 Manifest 使用 `_locales`。
- languageStore 是共享 external store，避免每个 Space row 重复读取 storage、重复注册监听器。

## 5. 2.0 非功能需求审计

### 5.1 性能

已完成：

- Group 外层虚拟化。
- 单 Group 达到 60 Tabs 后的网格虚拟化。
- Current tabs 虚拟化。
- 拖动期间不写 storage。
- Collapse 不做逐帧高度动画。
- 滚动中使用轻量静态预览，停止后分帧准备完整交互层并原子揭示。
- 历史大样本覆盖 17 Spaces / 266 Groups / 937 Tabs。

仍需优化：

- `SpacePage.tsx` 约 2,918 行，职责过重。
- 主 options chunk 约 951 kB。
- `lucide-react/dynamicIconImports` 让构建生成约 1,495 个图标 chunk，实际白名单只有约 304 个。
- 11 个语言字典和全部页面目前进入同一主入口，可进一步懒加载。

### 5.2 可靠性

已完成：

- 关键领域更新使用纯函数和不可变快照。
- 跨 Space Tab/Group 双写回滚。
- 完整与单 Space 导入回滚。
- Collapse 快速操作有序持久化。
- 生产 build 有清理 `.output` 的命令，防止开发入口污染。

仍需优化：

- create/rename/delete Space 等多键写入没有统一事务抽象。
- `getLocalJson()` 直接 `JSON.parse()`，缺少通用损坏数据隔离、备份和恢复策略。
- 缺少应用级 Error Boundary。
- Sync 设置输入写入没有统一串行 patch repository。
- 当前测试以领域单测为主，缺少当前仓库内可直接运行的 UI 集成/E2E 门禁。

### 5.3 安全与隐私

已完成：

- 外部 JSON 深度校验。
- 危险 URL 四层拒绝。
- 用户文本由 React 文本节点渲染。
- favicon 不访问第三方在线图标服务。
- 备份不包含同步设置和凭据。

仍需优化：

- `host_permissions: ["*://*/*"]` 权限面较大。
- GitHub Token、WebDAV 用户名和密码明文存储在 extension local storage。
- 缺少仓库内正式隐私政策、发布说明和凭据风险说明。
- 原始记录曾出现第三方依赖漏洞，当前需要重新执行并归档依赖安全审计。

### 5.4 可访问性

已完成：

- Radix Dialog/AlertDialog 焦点管理。
- Search combobox/listbox/active descendant。
- 图标按钮普遍具有 title 或屏幕阅读器文本。
- 支持 reduced motion。
- Space 支持 KeyboardSensor 排序和快捷键切换。

仍需优化：

- 缺少自动化 axe/ARIA 回归。
- DnD 键盘提示和批量操作的读屏语义需要在后续功能中单独设计。

## 6. 历史复扫问题关闭情况

2026-07-10 的两阶段复扫报告曾记录大量中间状态缺口。后续提交已经关闭主要 P0/P1/P2，不能把旧报告直接当成当前缺陷列表。

| 历史缺口 | 当前状态 |
|---|---|
| 缺少 `app_created` 启动同步 | 已关闭，共享 SpaceVersion store 启动时发送 |
| 缺少 `data_pull_done` 页面刷新 | 已关闭，storage/runtime 共享订阅覆盖 Space/Search/Sync |
| 跨 options tab 数据长期不刷新 | 已关闭 |
| Group 打开错误抢焦点 | 已关闭 |
| Alt 点击打开并删除语义缺失 | 已关闭 |
| 保存 Current tabs 后 pin 顺序错误 | 已关闭 |
| 搜索无模糊评分、空查询无结果 | 已关闭，使用 cmdk defaultFilter |
| Search 焦点圈定、遮罩关闭和 ARIA 不完整 | 已关闭 |
| Space Icon 只有 18 个 | 已关闭，恢复约 304 个白名单 |
| Settings/Sync/About Sidebar 操作被禁用 | 已关闭，统一共享 Layout |
| Sidebar 折叠后没有 Space/Settings 导航 | 已关闭 |
| Space 键盘切换和 KeyboardSensor 缺失 | 已关闭 |
| System theme 不实时跟随 | 已关闭 |
| 跨 Space Tab 写入可能丢数据 | 已关闭，使用回滚双写 |
| package/manifest 版本源不统一 | 已关闭，manifest 使用 package version |
| DnD 大样本高频整页重渲染 | 已完成虚拟化与静态预览重构 |
| Current tabs 更新导致全部身份重建 | 已按 tabId 做渐进更新 |
| i18n 每个 Space row 重复 storage listener | 已改共享 languageStore |

仍然保留或重新出现的工程风险：

- lint/CI/依赖/权限/凭据治理。
- MV3 timer 持久性。
- 包体积和图标 chunk 数量。
- `SpacePage` 体积。
- 当前最新工作区尚未重新跑完整历史 CDP 矩阵。

## 7. 2.0.1—2.0.3 原规划完整展开

以下功能来自原始《星罗Tab参考版功能补充建议》。它们是 2.x 增量路线，不是 2.0.0 遗漏，也不需要为了实现它们直接升级到 3.0。

### 7.1 2.0.1：缩短高频操作路径与发布治理

#### 2.0.1-A Popup 快速保存

当前状态：未实现。当前 action 点击后直接打开 Dashboard。

建议范围：

- 增加轻量 Popup 入口。
- 显示当前标签、当前窗口标签数量和最近使用目标。
- 支持“保存当前标签”“保存当前窗口”。
- 支持选择 Space 和 Group。
- 提供“新建 Group 后保存”。
- 提供明确的“打开 Dashboard”按钮。
- Popup 与 Dashboard 复用 domain/repository，不复制保存逻辑。
- 保存完成后根据现有设置决定是否关闭浏览器标签。

不建议在首版 Popup 中加入：

- 完整 Group 编辑。
- 复杂拖拽。
- 远端同步配置。
- 大型搜索和批量治理中心。

验收建议：

1. 三次点击以内可把当前标签保存到指定 Group。
2. 最近目标可一步保存。
3. pinned tabs、危险 URL、重复 URL 使用统一策略。
4. Popup 关闭后保存操作仍完整落盘。
5. Action 行为变化必须保留 Dashboard 的明确入口。

预计复杂度：中。

#### 2.0.1-B 重复标签检测与治理

当前状态：未实现。现有 duplicate 校验只处理备份里的重复 ID，不是 URL 重复治理。

建议范围：

- 定义 URL 规范化规则：协议/host 大小写、默认端口、尾斜杠、hash、追踪参数是否参与比较。
- 保存前可检查当前 Group、当前 Space 或全部 Space。
- 策略：仍然保存、跳过重复、移动已有项。
- 增加独立重复项扫描器。
- 支持批量删除、合并或定位重复来源。
- 默认不自动删除；查询参数不同的业务链接应谨慎处理。

验收建议：

1. 规范化行为有纯函数和固定样本测试。
2. 同 URL 不同标题能正确提示。
3. 不会误合并明显不同的查询参数页面。
4. 批量治理具备数量、来源和撤销/确认提示。

预计复杂度：中到高，取决于 URL 策略。

#### 2.0.1-C 同步状态与冲突中心

当前状态：部分实现。当前已有单次操作 loading、结果提示和冲突确认，但缺少持续可见的同步状态中心。

建议范围：

- 顶栏或 Sync 入口显示：已同步、待推送、待拉取、冲突、错误。
- 显示最近成功同步时间、Provider 和方向。
- 显示本地/远端 version、更新时间和数据摘要。
- 冲突页明确展示将覆盖的 Space/Group/Tab 数量。
- 保留 force push/pull 二次确认。
- 为自动同步失败提供可恢复入口，而不是只依赖瞬时提示。

验收建议：

1. 状态在页面切换和浏览器重启后仍可解释。
2. 自动同步失败不会静默。
3. 冲突操作前可看清方向和数据规模。
4. 不显示或记录 Token/密码。

预计复杂度：中。

#### 2.0.1-D 基础多选与批量操作

当前状态：未实现。

建议第一阶段范围：

- 显式进入/退出多选模式，避免正常点击语义冲突。
- Tab：批量移动、删除、打开、导出。
- Group：批量移动、删除、导出；合并可推迟到第二阶段。
- 全选当前 Group、当前筛选结果、当前 Space 要有明确边界。
- 破坏性操作显示数量、目标和确认。
- 长操作支持进度和失败摘要。

验收建议：

1. 搜索/筛选/排序变化时，选择集合不会错误指向其他对象。
2. 被删除或跨页更新的对象自动移出选择集合。
3. 批量跨 Space 写入具备回滚或可恢复语义。
4. 键盘和读屏可以理解当前选择数量。

预计复杂度：高。

#### 2.0.1-E 工程稳定化（建议作为发版门槛）

这部分在原路线图中属于 `2.0.1+` 工程 backlog，建议与 2.0.1 用户功能同时完成：

- 清零 ESLint error，并增加 `npm run lint`。
- 建立 CI：compile、test、lint、Chrome build、Edge build、ZIP manifest 校验。
- 将原仓库 `tools/Test-XingLuoTab*.mjs` 迁入当前仓库并脚本化。
- 增加覆盖率报告；为 routes/components 增加 UI 测试。
- 增加 Error Boundary 和损坏 storage 恢复说明。
- 重新执行依赖安全审计。
- 完成隐私政策、权限说明、商店发布材料。

### 7.2 2.0.2：增强知识整理与浏览器入口

#### 2.0.2-A 分组笔记

当前状态：未实现，Group schema 目前没有 note 字段。

建议范围：

- Group 增加可选纯文本或受限 Markdown note。
- 默认折叠，支持查看与编辑。
- Zen 模式可显示。
- note 进入完整备份、单 Space 备份、同步、导入校验和搜索索引。
- 设置合理长度限制，避免将扩展存储变成大型文档库。

首版不建议：复杂富文本、附件、多人协作、在线图片代理。

验收建议：旧 schema 数据自动兼容；note 不存在时不影响旧 Group；搜索可以标明命中来源是标题、URL 或笔记。

预计复杂度：中，并涉及 schema 兼容。

#### 2.0.2-B 书签导入

当前状态：未实现，Manifest 没有 bookmarks 权限。

建议范围：

- 优先支持浏览器导出的 HTML 文件，无需新增运行时权限。
- 第二阶段再评估 `chrome.bookmarks` 可选权限直接读取。
- 文件夹可映射为 Space 或 Group。
- 导入前显示层级预览、数量、危险 URL 和重复统计。
- 复用单 Space 导入的 ID 重建与事务框架。

验收建议：深层目录、同名目录、空目录、大量书签、重复 URL 和非法 URL 均有固定样本。

预计复杂度：中。

#### 2.0.2-C 右键菜单快捷保存

当前状态：未实现，Manifest 没有 `contextMenus` 权限或注册逻辑。

建议范围：

- 保存当前标签到最近使用 Group。
- 保存当前窗口为新 Group。
- 打开 Dashboard 搜索。
- 菜单保持少量固定入口；复杂目标选择放入 Popup。
- 后台和 Popup 共用统一 command/service 层。

验收建议：后台 Service Worker 重启后菜单可以恢复；目标 Group 被删除后不会保存到无效引用；内部页和危险 URL 不保存。

预计复杂度：中。

#### 2.0.2-D 搜索当前打开标签

当前状态：未实现。Search 当前只索引已收藏 TabRecord。

建议范围：

- 将当前窗口或全部窗口的打开标签加入搜索。
- 结果标记来源：已收藏、当前打开。
- 当前打开标签支持激活、关闭、保存。
- 同一 URL 同时存在于收藏和当前标签时可以聚合或并列显示，但语义必须清楚。
- 不需要 history 权限。

验收建议：浏览器 tab 更新/关闭后结果及时刷新；大量打开标签不阻塞搜索对话框。

预计复杂度：中。

### 7.3 2.0.3：高级浏览器整合

#### 2.0.3-A 原生 Tab Group 完整保存与恢复

当前状态：部分实现。当前可以把一个收藏 Group 打开为浏览器原生 Tab Group，但保存当前窗口时不会完整保留原生分组结构、标题和颜色。

建议范围：

- 读取当前窗口原生 tabGroups。
- 保存窗口时按原生组拆分星罗 Group。
- 保存组标题、颜色和未分组标签策略。
- 恢复时可选恢复原生标题和颜色。
- Chromium 不支持或权限不可用时降级为普通 Tabs。

预计复杂度：中到高。

#### 2.0.3-B 分组颜色与视觉标记

当前状态：未实现。

建议范围：

- Group 增加可选语义色或有限色板。
- 亮暗模式使用配套色值，而不是直接复用同一颜色。
- 不允许任意低对比度自由颜色。
- 颜色进入备份、同步、导入校验和原生 Tab Group 映射。

预计复杂度：低到中，但会修改 schema。

#### 2.0.3-C Omnibox 快速检索

当前状态：未实现，Manifest 没有 omnibox 配置。

建议范围：

- 注册简短关键词，例如 `xl` 或最终确认的品牌缩写。
- 输入关键词后搜索已收藏标签。
- 建议项显示 Space / Group 路径。
- Enter 直接打开；保留进入 Dashboard 查看更多结果的入口。
- 后台使用可缓存的小型索引，避免每次输入都读取全部 storage。

预计复杂度：中。

#### 2.0.3-D 可选历史搜索

当前状态：未实现，符合 2.0.0 非目标。

建议范围：

- 使用 optional `history` 权限，只有用户主动开启时申请。
- 搜索结果明确标记为“历史记录”，不能看起来像已收藏内容。
- 提供时间范围和最大结果数限制。
- 默认关闭，不上传或同步历史数据。

预计复杂度：中，隐私审查优先级高。

#### 2.0.3-E 只读分享包

当前状态：未实现。

建议范围：

- 选择一个或多个 Space/Group，生成脱敏 JSON 或静态 HTML 包。
- 默认排除同步凭据、设置、内部 ID 和未选择数据。
- 可由用户自行保存、发送或上传到自有 WebDAV/Gist。
- 不建设星罗Tab自有公共分享服务。

预计复杂度：中到高，取决于是否生成完整离线 HTML。

#### 2.0.3-F “关闭全部并打开此 Group”

当前状态：未实现。

建议范围：

- 作为 Group 打开菜单中的高级操作。
- 执行前显示将关闭的标签数量。
- 默认排除 pinned browser tabs 和扩展/内部页面。
- 支持取消，必要时提供短时间撤销提示。

预计复杂度：低到中，但破坏性较高。

### 7.4 建议版本顺序

推荐顺序不是简单按页面开发，而是按底层能力解锁：

1. 先完成 2.0.1-E 工程稳定化。
2. 建立统一“保存命令服务”，供 Dashboard、Popup、Context Menu、Search 共用。
3. 实现 Popup，缩短最高频保存路径。
4. 建立 URL normalization 和选择集合模型。
5. 实现重复治理与基础多选。
6. 建立持久化同步状态模型。
7. 进入 2.0.2 notes/bookmarks/context menu/current-tabs search。
8. 最后进入 2.0.3 原生 Tab Group、Omnibox、History 和分享。

## 8. 3.0 候选方向（非承诺清单）

以下内容可以先作为头脑风暴，不代表全部都应该做，也不建议一次性塞进 3.0。

### 8.1 数据与同步引擎 2.0

- 将 `SPACE_VERSION = Date.now()` 升级为逻辑版本或复合版本。
- 引入 `deviceId + updatedAt + contentHash`。
- 支持逐 Space 或逐 Group 的差异摘要，而不是整包覆盖。
- 冲突时支持保留两份、字段级或对象级合并。
- 建立正式 schema migration pipeline。
- 备份支持增量、压缩、完整性 hash 和恢复点。

如果这些变化导致旧备份/同步协议必须迁移，它们很适合作为 3.0 的核心理由。

### 8.2 统一采集入口

- Popup、Context Menu、快捷键、Omnibox 使用同一 Command API。
- “收件箱 Space/Group”：无法立即分类的内容先快速保存。
- 最近目标、固定目标、智能推荐目标。
- 保存后自动执行去重、标签建议和关闭策略。

### 8.3 智能集合与规则

- 基于域名、URL、标签、标题关键词的本地规则。
- 自动把新保存标签路由到指定 Group。
- 动态 Smart Group，只保存查询规则，不复制数据。
- 到期、长期未访问、失效链接等本地维护视图。

首版应保持完全本地，不必引入云端 AI。

### 8.4 本地知识整理

- Group note、Tab note、摘要字段统一。
- 双向链接或引用，而不是复制同一 Tab。
- 标签体系升级为可管理实体：重命名、合并、颜色、统计。
- 本地全文索引，支持 notes、标题、URL、标签和域名。
- 导出为 Markdown/HTML 知识包。

### 8.5 工作区与浏览会话

- 保存多窗口布局，而不仅是当前窗口 Tabs。
- 窗口、原生 Tab Group、pinned tabs 完整恢复。
- 临时 Session 与长期收藏分离。
- Session 时间线、最近关闭会话和可恢复快照。
- 浏览器崩溃后的本地恢复入口。

### 8.6 跨设备体验

- 设备列表和最后同步状态。
- 指定 Space 是否参与同步。
- 大数据按 Space 分片同步。
- 设备离线时记录本地变更队列。
- 冲突中心显示来源设备和变更摘要。

### 8.7 权限与安全模型重构

- WebDAV host 改为 optional host permission。
- History、Bookmarks、Context Menus 等能力按功能申请。
- 凭据与普通 SyncSetting 分离，增加清除、轮换和过期提示。
- 发布包自动进行权限差异检查。
- 提供用户可读的“当前启用能力与权限”页面。

### 8.8 多浏览器与平台

- Chrome/Edge 保持主支持矩阵。
- 明确 Firefox 是否进入正式支持，而不仅是存在 build script。
- 统一 browser capability detection。
- 原生 tabGroups、favicon、commands 不支持时提供显式降级。

### 8.9 可选的本地智能能力

- 本地相似页面聚类。
- 根据标题/域名建议标签。
- 重复和近重复 URL 解释。
- 为大量未整理标签生成本地整理建议。
- 所有智能功能默认关闭，明确数据不上传。

如果未来接入外部模型，应单独设计权限、隐私、费用和失败降级，不能悄悄把浏览数据发送到第三方。

### 8.10 不建议作为 3.0 默认目标

- 账号、团队、组织、成员邀请。
- 自建公共云同步服务。
- 实时多人协作和 WebSocket。
- 订阅、配额、功能锁。
- 默认遥测和第三方分析 SDK。
- 为对齐 Toby 而复制其商业后端能力。

这些方向会显著改变本地优先定位和维护成本，除非产品战略明确改变，否则不建议进入 3.0。

## 9. 什么时候开始 3.0

建议分为“设计开始”和“代码开始”两个时间点。

### 9.1 可以立即开始的工作

- 收集 2.0 实际使用反馈。
- 确定 3.0 是否真的有 breaking change。
- 设计 schema migration、同步版本和权限模型。
- 做交互原型和技术验证分支。
- 从第 8 节候选池选出一个真正的 3.0 主轴。

### 9.2 正式代码开发前的门槛

1. 当前工作区改动整理、审查、提交并形成干净版本。
2. 2.0.1 工程稳定化完成。
3. 当前精确代码重新跑 Chrome/Edge 完整回归。
4. 建立可回退的 2.x tag 和发布包。
5. 至少完成一轮真实用户使用或 beta 观察。
6. 明确 2.x 后续只做维护，还是会继续实现 2.0.2/2.0.3。
7. 3.0 有明确的迁移策略，不能让现有本地数据和远端备份失去恢复路径。

如果集中处理工程收口，可以从 2026 年 7 月底至 8 月初开始 3.0 正式分支；如果先完整实现 2.0.1—2.0.3，3.0 应相应后移。

最重要的版本判断原则：

- Popup、重复治理、批量操作、笔记、书签、Context Menu、Omnibox 等属于向后兼容增强，应继续使用 2.x。
- 数据 schema、同步协议、扩展身份、产品定位或兼容策略发生破坏性变化，才值得使用 3.0。

## 10. 项目优化优先级

### P0：正式发布前

1. 清零 ESLint error，增加 `lint` script。
2. 建立 CI 和产物校验。
3. 把完整 CDP 工具迁入当前仓库。
4. 基于当前未提交改动重新跑完整 Chrome/Edge 回归。
5. 整理版本、Changelog、Release notes、隐私政策和权限说明。
6. 重新执行依赖漏洞审计。
7. 评估 MV3 自动同步 timer 是否需要 `chrome.alarms` 或持久化调度。

### P1：2.0.1 工程优化

1. 拆分 `SpacePage`。
2. 统一 UserSetting/SyncSetting 串行 patch repository。
3. 增加 Error Boundary 和损坏 storage 隔离恢复。
4. 为 create/rename/delete 等多键操作建立事务抽象。
5. 限制 dynamic icon import map 到实际白名单。
6. 路由与语言包拆分，降低 options 初始 chunk。
7. 搜索索引缓存和分 Space 容错。
8. 建立 UI/E2E、可访问性和截图回归。

### P2：2.0.2—2.0.3

1. 可选权限与 host permission 收敛。
2. 凭据清除、轮换和安全说明。
3. Popup/Context Menu/Omnibox 的共享后台命令层。
4. notes、group color、native tab group 等 schema 兼容迁移。
5. 历史搜索和分享能力的隐私审查。

### P3：3.0 才处理

1. 新同步协议和逻辑版本。
2. 分片/增量同步。
3. 正式 schema migration pipeline。
4. 多设备冲突模型。
5. 智能集合、会话时间线或知识整理模型的结构性升级。

## 11. 建议的版本 Definition of Done

### 2.0.1 DoD

- 至少完成 Popup、重复治理、同步状态、多选中的优先子集，并明确未完成项是否顺延。
- compile/test/lint/Chrome build/Edge build 全绿。
- 当前仓库内可一条命令运行核心浏览器回归。
- 无未解释的高危依赖或新增宽权限。
- 备份向后兼容，2.0.0 数据可无损使用。

### 2.0.2 DoD

- note/bookmark/context menu/current-tabs search 的 schema、权限和隐私边界明确。
- 旧数据自动兼容。
- 导入和批量操作失败不会产生半写状态。
- 11 语种和可访问性同步完成。

### 2.0.3 DoD

- 原生 Tab Group、Omnibox、History 等浏览器能力具备 capability detection 和降级。
- optional permissions 只在用户主动启用时申请。
- 分享包不泄露凭据、设置和未选择数据。
- 2.x 最终备份格式和迁移承诺明确。

### 3.0 DoD

- 有单一明确的 major 版本理由。
- 提供从 2.x 到 3.0 的数据和备份迁移。
- 同步协议变化有回滚方案。
- 2.x 稳定版仍可读取其原有数据，不被 3.0 测试覆盖。
- 完整自动化、发布矩阵、隐私和权限审查通过。

## 12. 证据来源

原始规划文档：

- `D:\workspace_test\Mumu-GoogleExtGet-Keep\星罗Tab产品需求文档.md`
- `D:\workspace_test\Mumu-GoogleExtGet-Keep\星罗Tab开发设计文档.md`
- `D:\workspace_test\Mumu-GoogleExtGet-Keep\星罗Tab参考版功能补充建议.md`
- `D:\workspace_test\Mumu-GoogleExtGet-Keep\重建行为契约.md`
- `D:\workspace_test\Mumu-GoogleExtGet-Keep\V2对比1.0五轮复扫报告.md`
- `D:\workspace_test\Mumu-GoogleExtGet-Keep\VERSION_POLICY.md`
- `D:\workspace_test\Mumu-GoogleExtGet-Keep\AI协作规范.md`

原始运行时工具：

- `tools/Test-XingLuoTabRuntime.mjs`
- `tools/Test-XingLuoTabRuntimeBaseline.mjs`
- `tools/Test-XingLuoTabLargeFixture.mjs`
- `tools/Test-XingLuoTabInputCollapse.mjs`
- `tools/Test-XingLuoTabCommandShortcuts.mjs`

当前实现关键入口：

- `package.json`
- `wxt.config.ts`
- `entrypoints/background.ts`
- `src/app/App.tsx`
- `src/routes/SpacePage.tsx`
- `src/routes/SettingsPage.tsx`
- `src/routes/SyncPage.tsx`
- `src/domain/space/repository.ts`
- `src/domain/import/backupRepository.ts`
- `src/domain/import/validation.ts`
- `src/features/storage/spaceVersionStore.tsx`
- `src/features/sync/remoteSync.ts`
- `src/features/search/searchIndex.ts`
- `src/features/space/spaceIcons.tsx`
- `src/components/ui/Favicon.tsx`
- `src/components/ui/faviconCache.ts`

## 13. 最终建议

1. 不要把原计划的 2.0.1—2.0.3 功能改名成 3.0；它们本质上是兼容增强。
2. 当前优先把 2.0 做成“可重复验证、可正式发布、可长期维护”的稳定底座。
3. 3.0 现在可以做设计，但应先确认一个真正需要 major 版本的核心变化。
4. 如果没有同步协议、schema、扩展身份或产品定位的破坏性变化，继续迭代 2.x 更合理。
5. 最值得优先投入的用户价值仍是三条链路：更快保存、批量治理、同步状态可解释。
