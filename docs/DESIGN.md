---
name: Soothsay 设计语言
description: 迁移自 OpenDesign 收录的 Claude 设计系统——暖色单色、衬线主导、克制留白、无强调色。
source: https://opendesign.cc/packs/claude/
migrated: 仅迁移设计语言（tokens 与原则），不复制任何品牌资产、Logo 或文案
principle: 温暖 · 平静 · 高端克制 · 内容主导
tokens:
  colors: { bg: "#FAF9F5", bgSoft: "#E8E6DC", ink: "#141413", inkSoft: "#30302E", muted: "#87867F", line: "rgba(209,207,197,1)", accent: none }
  type: { display: transitional-serif/56/500/-0.02em, heading: humanist-sans/30/400/-0.01em, body: humanist-sans/16/400, caption: 12/400 }
  spacing: [4, 8, 12, 16, 24, 32, 48, 64, 96]
  radius: { sm: 4, md: 8, lg: 12, pill: 999 }
  layout: { container: 1280, paragraph: 680, columns: 12, gutter: 24, breakpoints: [768, 1024] }
  motion: { micro: 200, small: 300, medium: 500, easing: "cubic-bezier(0.165,0.84,0.44,1)" }
---

# Soothsay 设计语言

本文件提炼自 [OpenDesign · Claude pack](https://opendesign.cc/packs/claude/) 的 11 层设计规格，作为 Soothsay 的设计语言基线。**只迁移设计语言（颜色/字体/间距/形状/动效/语气等 tokens 与原则），不复制任何品牌资产、Logo、插画或文案。** 文中所有示例文案均为 Soothsay 自有场景。

> 核心气质：温暖、平静、高端克制；让留白与内容主导，拒绝视觉噪音、霓虹饱和、厚重阴影与激进动画。

---

## 1. 设计气质 DNA

- **一句话**：精致、以衬线字体主导的界面，在高端克制与温暖、以人为本之间取得平衡。
- **关键词**：深思熟虑 · 能力出众 · 精致考究 · 智慧 · 可靠。
- **类比**：一位成熟的助手，融合学术的严谨与现代、亲切的设计。
- **落到 Soothsay**：命理解读是"复杂思想徐徐展开"的场景，界面应像一张安静、有质感的纸，托住内容而不抢戏。

## 2. 颜色

暖色**单色**调色板：灰白底、深墨字、暖灰线。目的不是吸睛，而是提供宁静易读的基底。**没有强调色（accent = 无）**——这是该设计语言最关键的约束。

| Token | 值 | 用途 |
|---|---|---|
| `--bg` | `#FAF9F5` | 主背景（暖灰白，非纯白） |
| `--bg-soft` | `#E8E6DC` | 卡片/次级背景 |
| `--ink` | `#141413` | 正文（深炭灰，非纯黑） |
| `--ink-soft` | `#30302E` | 次级文字 |
| `--muted` | `#87867F` | 占位符/弱化文字 |
| `--line` | `rgba(209,207,197,1)` | 分割线/边框（暖中性灰） |

- 强调与状态靠**明度对比、墨色实底、留白**表达，而非彩色高亮。
- 危险/警示等不可避免的语义色（如 `--danger`）应低饱和、暖调，少用且小面积。

## 3. 字体

两种声音：衬线负责展示标题的自信权威，无衬线负责正文的明晰，形成"既有编辑感又平易近人"的层次。

| Token | Size | Line-height | Weight | Letter-spacing | 用途 |
|---|---|---|---|---|---|
| display | 56px | 1.0 | 500 | -0.02em | 主标题/大字 |
| heading | 30px | 1.2 | 400 | -0.01em | 章节标题、层级标题 |
| body | 16px | 1.5 | 400 | normal | 正文与 UI 元素 |
| caption | 12px | 1.5 | 400 | normal | 小字、元数据、辅助说明 |

**字体角色与推荐栈：**

- Display（过渡衬线 transitional-serif）：`"Iowan Old Style", "Palatino Linotype", Georgia, "Songti SC", "SimSun", serif`
- Body（人文无衬线 humanist-sans）：`Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif`
- Mono：`ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace`

**规则：** 主标题与展示文本一律用衬线；正文、导航、组件一律用无衬线；正文字重恒为 400，维持平静、易读的韵律。大标题可用 `clamp()` 做响应式（如 `clamp(32px, 7vw, 56px)`）。

## 4. 间距

统一 **4px 基线网格**，节奏可预测、宽松。

- **基数**：`4px`
- **阶梯**：`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96` px
- **韵律**：容器内保留充足垂直内边距；宁可多留白，不要拥挤。

## 5. 表面（圆角 / 阴影 / 边线）

深度靠轻柔阴影 + 最细边框暗示层次，表面像"精致有质感的纸"，而非塑料。

- **圆角**：`sm 4px · md 8px · lg 12px · pill 999px`
- **阴影**：
  - 柔影：`rgba(0,0,0,0.1) 0 4px 16px 0`
  - 描边阴影（线框）：`rgba(209,207,197,1) 0 0 0 1px`
- **边框**：1px 暖中性灰 `rgba(209,207,197,1)`。
- 不叠厚重阴影；卡片优先用 1px 边框 + 极轻柔影。

## 6. 布局

宽敞骨架，留白作为**主动元素**定义焦点与层次。

- **容器最大宽**：`1280px`
- **正文段落最大宽**：`680px`（保证阅读舒适，命理解读长文尤其重要）
- **栅格**：12 列，列间距 `24px`
- **断点**：`768px` / `1024px`
- **骨架**：居中 12 列、宽间距、区块界限清晰；命盘表/解读区等用分栏 + 留白分隔，不堆叠。

## 7. 组件

| 组件 | 配方 |
|---|---|
| Button | 实心墨色（主操作）或描边/浅底（次操作）；圆角 4–8px（**不是**到处药丸形）；无衬线标签；hover 仅做微妙底色变化。 |
| Card | 1px 暖灰边框 + 宽松内边距 + 圆角 12px；阴影极轻或仅描边。 |
| Chip / 列表项 | 勾选标记 + 文本标签的轻量组合，用于要素/特性罗列（契合命盘要素、神煞标签等）。 |
| Input | 干净、微边框、重可读性；聚焦用中性焦点环而非彩色高亮。 |
| 分栏区块 | 左标题/正文、右示意或数据；以留白而非分隔线划分。 |

> 主操作默认"圆角矩形 + 墨色实底"；药丸形仅用于真正的标签/胶囊场景。

## 8. 动效

极简、流畅、不抢注意力；用有目的的时间尺度确认操作或引导过渡。

- **时长**：micro `200ms` · small `300ms` · medium `500ms`（交互态过渡可更短，0.15–0.2s）。
- **缓动**：`cubic-bezier(0.165, 0.84, 0.44, 1)`（自然、从容）。
- **常用模式**：hover/focus 的平滑颜色过渡；内容出现的微妙淡入；交互元素背景色平滑变化。

## 9. 交互

- **Hover**：交互元素的微妙颜色/背景变化。
- **Click**：即时状态变化，反馈最小化（不夸张）。
- **Transition**：所有过渡短促（0.15–0.2s）且平滑。
- **Keyboard**：标准焦点管理，焦点可见——用中性焦点环（如 `0 0 0 3px rgba(20,20,19,0.12)`）或微妙底色变化，**不**用彩色高亮环。

## 10. 文案语气

编辑语言冷静、专业、令人安心；标题简洁、以利益为导向；CTA 直接、动作导向。

- **语气**：专业、智慧、异常平静。
- **标题**：用衬线表达清晰、以利益为导向的陈述。
- **CTA**：直接简短、动词开头（Soothsay 场景示例：「开始排盘」「查看命盘」「请大师解读」）。
- **避免**：面向用户文案里堆术语/黑话；夸张、炒作或过于随意的语气。

## 11. 禁用清单

- ❌ 不用明亮/霓虹/高饱和强调色——调色板是温暖单色。
- ❌ 标题不用厚重、方块感的无衬线——展示字体是精致过渡衬线。
- ❌ 不用紧凑、密集、小内边距的布局——优先充足留白。
- ❌ 不用纯黑 `#000000` / 纯白 `#FFFFFF`——用暖米白 `#FAF9F5` 与深炭灰 `#141413`。
- ❌ 不用激进、弹性或复杂的缓动曲线——过渡平滑微妙。
- ❌ 不到处用药丸形按钮——主操作默认圆角矩形（4–8px）。

---

## 设计 Tokens（CSS `:root` 参考）

下方为这套设计语言的完整变量基线。Soothsay 现有 `src/styles.css` 已对齐**颜色 / 圆角 / 阴影 / 缓动 / 字体 / 字阶**；以下用 `/* 待补 */` 标出当前缺失、建议补入的变量（间距阶梯、动效时长、布局容器），以统一硬编码数值。

```css
:root {
  color-scheme: light;

  /* —— 颜色（暖色单色，无强调色） —— */
  --bg: #faf9f5;
  --bg-soft: #e8e6dc;
  --surface: #fffdf8;          /* 项目内更亮的卡面，仍属暖白家族 */
  --ink: #141413;
  --ink-soft: #30302e;
  --muted: #87867f;
  --line: rgba(209, 207, 197, 1);
  --line-soft: rgba(209, 207, 197, 0.64);
  --danger: #9f2f2f;           /* 低饱和暖调语义色，少用 */

  /* —— 字体 —— */
  --font-display: "Iowan Old Style", "Palatino Linotype", Georgia, "Songti SC", "SimSun", serif;
  --font-body: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  --font-mono: ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace;

  /* —— 字阶 —— */
  --text-display: clamp(32px, 7vw, 56px);
  --text-heading: 30px;
  --text-body: 16px;
  --text-caption: 12px;
  --lh-display: 1.0;
  --lh-heading: 1.2;
  --lh-body: 1.5;
  --ls-display: -0.02em;
  --ls-heading: -0.01em;
  --weight-display: 500;
  --weight-body: 400;

  /* —— 间距阶梯（基数 4px） /* 待补：统一替换硬编码 px */ —— */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
  --space-2xl: 32px;
  --space-3xl: 48px;
  --space-4xl: 64px;
  --space-5xl: 96px;

  /* —— 圆角 —— */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-pill: 999px;

  /* —— 表面 / 阴影 / 焦点 —— */
  --shadow-soft: rgba(0, 0, 0, 0.1) 0 4px 16px 0;
  --shadow-line: rgba(209, 207, 197, 1) 0 0 0 1px;
  --focus-ring: 0 0 0 3px rgba(20, 20, 19, 0.12);  /* 中性焦点环，无彩色 */

  /* —— 布局   /* 待补 */ —— */
  --container-max: 1280px;
  --paragraph-max: 680px;
  --grid-columns: 12;
  --grid-gutter: 24px;

  /* —— 动效 —— */
  --dur-micro: 200ms;    /* 待补：时长变量化 */
  --dur-small: 300ms;
  --dur-medium: 500ms;
  --ease: cubic-bezier(0.165, 0.84, 0.44, 1);
}

/* 响应式断点：768px / 1024px */
```

## 落地到 Soothsay：现状与待办

**已对齐（保持）**

- 颜色全套（`--bg/--bg-soft/--ink/--ink-soft/--muted/--line`）与暖白底、深炭字。
- 圆角 `4/8/12/999`、柔影与描边阴影、缓动 `cubic-bezier(0.165,0.84,0.44,1)`。
- 字体（衬线 display + Inter body）与字阶（display/heading/body/caption）。
- 中性焦点环 `rgba(20,20,19,0.12)`，无彩色高亮——符合"无强调色"。

**建议补齐（统一与收口）**

- [ ] 引入**间距阶梯变量** `--space-*` 并替换 `App.vue`/`styles.css` 中散落的硬编码 px，落到 4px 网格。
- [ ] 引入**动效时长变量** `--dur-*`，过渡统一为 `var(--dur-*) var(--ease)`，交互态用 0.15–0.2s。
- [ ] 引入**布局容器变量** `--container-max/--paragraph-max/--grid-gutter`；解读长文限宽到 `680px` 提升可读性。
- [ ] 复核 display 字重为 `500`，heading 为 `400`。
- [ ] 审查全站：确认无高饱和强调色、无纯黑纯白、主按钮非药丸形、布局留白充足。

## AI 设计指令（通用约束版，可粘贴给生成工具）

```
为一个平静、克制、高端的工具型界面生成/改造页面。使用以暖米白（#FAF9F5）为底、深炭灰（#141413）为字的暖色单色调色板，不使用任何明亮强调色。展示标题用过渡衬线字体，正文与 UI 用人文无衬线字体，正文字重恒为 400。布局基于 12 列、24px 列间距、1280px 容器、正文限宽 680px，留白充足。过渡平滑微妙（200–500ms，缓动 cubic-bezier(0.165,0.84,0.44,1)）。硬约束：不发明高饱和颜色；标题不用方块感无衬线；不做密集杂乱布局；不用纯黑纯白；不到处用药丸按钮；不用激进/弹性动画。文案保持专业、智慧、异常平静，优先清晰与克制。
```
