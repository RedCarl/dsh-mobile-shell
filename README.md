# 移动端外壳（Mobile Shell）

把 DeepSeek Harness 的 Web 界面在手机上变得可用：左侧栏变成**抽屉**，底部多一条**导航栏**，会话/项目列表的行操作在触屏上直接可见，插件页提供**桌面版视图**开关。

插件只做"叠加 + CSS 覆盖"，不改 DSH 安装包、不替换 `sidebar` 槽、不重写会话列表；桌面窗口完全不受影响。

## 能力

- **侧栏抽屉**：手机宽度下，原来的左侧栏变成从左侧滑出的**整屏宽**抽屉，只保留会话相关的内容（新建会话、搜索/筛选、工作区与会话列表）；面板入口、设置、账号/登录都收进「更多」，不再挤在抽屉里。抽屉下沿停在底部导航之上，点遮罩、按 Esc、选会话会自动收起。
- **底部导航**：`会话`（开/关抽屉）、`新会话`、`文件`（右侧栏文件页，手机上自动全屏）、`更多`。
- **顶栏 ☰**：会话标题前的菜单按钮，打开抽屉。
- **更多面板**：会话列表、所有侧栏面板入口（余额、MCP 技能、插件……）、**设置**、**账户与登录**（直接打开原生账号菜单，含登录/退出/意见反馈）、桌面版视图/移动适配/强制手机布局三个开关、刷新页面与适配状态。
- **节省纵向空间**：抽屉里隐藏面板入口与底部设置区，品牌行、新会话按钮压缩，把整块高度让给工作区与会话列表。
- **单行标题栏**：会话页顶部只留 ☰ 与标题——隐藏「对话 / 轨迹」切换、后台任务 chip、open-in-app 与右侧栏角标（文件入口在底部导航），标题行高度降到约 40px。
- **触屏优化**：会话行的「…」操作不再依赖 hover；行高与图标按钮加大；输入框 16px 防止 iOS 聚焦时整页放大；点击无 300ms 延迟；底部适配 iPhone Home Indicator。
- **插件页桌面视图**：当主列显示插件页时，右下角出现「桌面版」胶囊，点一下切到 1024px 布局（可双指放大），专治插件管理页、插件清单等桌面密度页面；再点「手机版」回来。
- **一键回退**：「更多 → 移动适配」关闭后立即恢复原生界面（保存在本机）；若关闭后浮出「手机模式」小胶囊，点它即可恢复。

## 配置（`cordis.patch.yml`）

```yaml
- id: mobile-shell
  config:
    enabled: true        # 全局开关
    breakpointPx: 767    # 视口宽度阈值，≤ 该值启用手机布局
    bottomBar: true      # 底部导航
    panelChip: true      # 插件页「桌面版」胶囊
    keyboardFit: true    # iOS 键盘打开时压缩 #root 高度
```

改完配置由 profile HMR 自动生效（或重启 `dsh web`）。

## 本机开关

| 存储键 | 含义 |
| --- | --- |
| `dsh-mobile-shell:enabled` | 本机是否启用移动布局 |
| `dsh-mobile-shell:desktop` | 本机是否处于桌面版视图 |
| `dsh-mobile-shell:force-mobile` | 在桌面窗口强制手机布局（调试用） |

## 实现要点

- 侧栏列、居中列在运行时用 CSS Module 类名子串定位，并打上 `data-dsh-ms-*` 标记；所有覆盖规则都要求 `html[data-dsh-mobile]`，所以桌面端只多一个 `<style>`，无任何布局变化。
- 侧栏改成绝对定位后脱离 Grid 流，不再参与自动排布，**居中列与右栏必须显式指定 `grid-column`**（否则居中列会被排进宽度为 0 的第一列，表现为"看不见会话内容"）。这条规则在 CSS 里带注释固定下来。
- 抽屉状态直接读 AppFrame 的 `data-sidebar-collapsed` 属性，开关统一走 `ctx.layout.toggleSidebar()`；会话切换通过 `ctx.sidebarRight.mounted` 观察。
- 新会话走 `ctx.uiWorkspace.startSession()`，文件页走 `ctx.sidebarRight.openTab('files')`，面板直达走 `ctx.layout.selectPanel(id)`。
- 定位不到侧栏时不渲染任何导航（避免半坏状态），状态显示在「更多」面板里。
- 侧栏抽屉下沿止于底部导航栏顶部（`bottom: 52px + 安全区`），打开抽屉时底部导航仍然可见、可点；遮罩同样让出这条区域。
- 兜底：启用手机布局 400ms 后若居中列宽度仍 < 40px，会自动回退到原生布局并在控制台告警，避免出现整屏空白。
- 「更多 → 设置」优先用 `shortcuts.catalog` 中 `settings.open` 的当前绑定派发一次按键事件来打开原生设置弹窗；若该命令被解绑或派发被拦，则退回打开账号菜单（菜单里同样有「设置」），账号菜单无法定位时再退回打开抽屉并临时露出底部设置区，保证登录/设置始终可达。

## 已知耦合

- 覆盖规则依赖 CSS Module 的**局部类名**（`_rowActions`、`_sessionRow`、`_panelRow`、`_headerUtilities`、`_handle` 等）。上游若改名，只会退化为"触摸增强失效"，抽屉与底部栏不受影响。
- 抽屉依赖 AppFrame 的 `data-sidebar-collapsed` 属性与 `narrowExpanded` 行为（<1024px）。上游若改变窄屏侧栏语义，需要同步调整 `syncAttributes()`。
- 需要 `:has()`（iOS 15.4+/Chrome 105+）的只有会话头内边距等细节规则。

## 自测

`test/smoke.mjs` 用最小 DOM / React / cordis 桩执行 `apply()`、`boot()` 和三个插槽组件，验证手机路径与桌面无操作路径：

```bash
node test/smoke.mjs            # 390x844 手机视口
WIDTH=1400 node test/smoke.mjs # 桌面：不设 data-dsh-mobile、不动 viewport、不渲染任何导航
```

## 回退

1. 「更多 → 移动适配」关闭（本机）。
2. 或桌面端「插件」页停用本插件。
3. 或从 `dsh.profile.bundles` 移除 `@local/dsh-mobile-shell` 后重启。
