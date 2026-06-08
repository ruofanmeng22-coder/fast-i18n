# Fast I18n：一键完成 React 项目国际化的 VS Code 插件

> 从硬编码中文到 i18n 函数调用，只需一次右键。

## 一、痛点：React 国际化改造有多繁琐？

当一个 React 项目需要从中文单语言扩展到多语言支持时，开发者面对的是一套极其机械但容易出错的流程：

1. **找到硬编码文本** — 在成百上千个组件中逐个搜索中文
2. **确定 i18n Key** — 按什么规则命名？模块前缀？语义描述？团队统一？
3. **翻译成英文** — 用于生成 key 和 en-US 资源文件
4. **替换代码** — 但不同位置的替换语法不同：
   - JSX 文本要加 `{}`：`<div>中文</div>` → `<div>{t('key')}</div>`
   - JSX 属性要去掉引号加 `{}`：`placeholder="中文"` → `placeholder={t('key')}`
   - 模板字符串要加 `${}`：`` `共${n}条` `` → `` `共${t('key')}条` ``
5. **写入资源文件** — zh-CN 和 en-US 两个文件都要写，key 还不能重复
6. **重复 1-5** — 几百次

一个中等规模的项目，这个过程可能需要数天。而且手动操作极易出错：key 命名不一致、替换语法错误、资源文件遗漏……

**Fast I18n** 就是来解决这个问题的——选中文字，右键，一键完成。

## 二、Fast I18n 是什么？

Fast I18n 是一个 VS Code 扩展插件，核心功能只有一个命令：**选中文本 → 右键 "Fast I18n: Replace with i18n Key" → 自动完成翻译、生成 Key、替换代码、写入资源文件**。

它不是一个框架，不引入任何运行时依赖，不改变项目结构。它只是一个编辑器级别的自动化工具，把开发者从重复劳动中解放出来。

## 三、整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    extension.ts (入口)                    │
│                                                         │
│  选中文本 → 校验 → 常量引用? ──是──→ 直接替换            │
│                  │                                      │
│                  否                                      │
│                  ↓                                      │
│         ┌─────────────────┐                             │
│         │ contextAnalyzer │  上下文分析                   │
│         └────────┬────────┘                             │
│                  ↓                                      │
│         ┌─────────────────┐                             │
│         │   translator    │  翻译 (中→英 / 英→中)        │
│         └────────┬────────┘                             │
│                  ↓                                      │
│         ┌─────────────────┐                             │
│         │   keyBuilder    │  生成 i18n Key               │
│         └────────┬────────┘                             │
│                  ↓                                      │
│            用户确认 Key                                  │
│                  ↓                                      │
│         ┌─────────────────┐                             │
│         │    replacer     │  生成替换文本                 │
│         └────────┬────────┘                             │
│                  ↓                                      │
│         ┌─────────────────┐                             │
│         │   i18nWriter    │  写入双语资源文件             │
│         └─────────────────┘                             │
└─────────────────────────────────────────────────────────┘
```

六个模块各司其职，通过数据流串联，没有交叉依赖。下面逐一深入分析。

## 四、核心模块深度解析

### 4.1 上下文分析：基于字符特征的轻量推断

这是整个插件最精巧的模块。它要解决的问题是：**选中的文字在代码中扮演什么角色？** 不同角色的替换语法完全不同。

#### 为什么不用 AST？

AST（抽象语法树）解析是理论上最准确的方案——Babel 可以精确地告诉你每个节点的类型和位置。但对于一个 VS Code 插件来说，引入 Babel 意味着：

- 插件体积从几十 KB 膨胀到数 MB
- 需要为不同框架（React/Vue/Svelte）配置不同的解析器
- 解析整个文件的性能开销远超只分析一行

Fast I18n 选择了另一条路：**只分析选区所在行，通过选区前后的字符特征推断上下文**。

#### 五级优先级匹配算法

```typescript
analyzeContext(document, selection) {
  const line   = document.lineAt(selection.start.line).text;
  const before = line.substring(0, selection.start.character);  // 选区前的文本
  const after  = line.substring(selection.end.character);        // 选区后的文本

  // ① JSX 属性字符串
  if (/=["']$/.test(before) && /^["']/.test(after)) → JSX_ATTR_STR

  // ② JSX 文本节点
  if (before 最后一个 > 在最后一个 < 之后 && after 匹配 \s*<) → JSX_TEXT

  // ③ 模板字符串
  if (before 中反引号出现奇数次) → TEMPLATE_EXPR

  // ④ 普通 JS 字符串
  if (before 末尾是引号) → JS_STRING

  // ⑤ 兜底
  → UNKNOWN
}
```

每条规则的检测成本极低（一次正则匹配或一次遍历），但覆盖了 React 项目中 99% 的硬编码文本场景。

#### 关键细节：引号扩展

当识别到 JSX 属性字符串或 JS 字符串时，替换范围需要**包含引号**：

```
placeholder="中文"  →  placeholder={t('key')}
           ^^^^          ^^^^^^^^^^^^
           选区           替换范围（含引号被吃掉）
```

如果不扩展选区，结果会变成 `placeholder="t('key')"` 或 `placeholder="{t('key')}"`——都是语法错误。

实现方式很简洁：检查选区前后各一个字符，如果都是相同类型的引号，就把替换范围向两端各扩展一位。

#### 关键细节：模板字符串的奇偶校验

判断选区是否在模板字符串内部，用的是**反引号奇偶校验法**：

```
`prefix中文suffix`    →  before 中有 1 个反引号 → 奇数 → 在模板内 ✓
`a` + `中文`          →  before 中有 2 个反引号 → 偶数 → 在模板外 ✗
`a${b}中文`           →  before 中有 1 个反引号 → 奇数 → 在模板内 ✓
```

这个方法虽然简单，但在单行分析的场景下完全够用。同时还会跳过转义字符 `\``，避免误判。

### 4.2 翻译引擎：策略模式 + 五路分发

翻译模块采用**策略模式**，根据用户配置的服务类型分发到不同的翻译实现：

```
doTranslate(text, from, to)
  ├── google   → HTTP GET  → translate.googleapis.com
  ├── baidu    → HTTP GET  → fanyi-api.baidu.com (MD5签名鉴权)
  ├── deepl    → HTTP POST → api.deepl.com (auth_key鉴权)
  ├── openai   → HTTP POST → api.openai.com/v1/chat/completions
  └── custom   → HTTP POST → 用户自定义URL
```

#### 百度翻译的 MD5 签名

百度翻译 API 要求请求携带签名，签名的生成逻辑：

```
sign = MD5(appId + text + salt + secretKey)
```

这是百度翻译 API 的标准鉴权方式，确保请求不可伪造。Fast I18n 使用 Node.js 内置的 `crypto` 模块实现，无需额外依赖。

#### OpenAI 翻译的 Prompt 设计

```typescript
{
  role: 'system',
  content: `You are a translator. Translate the following text from ${fromLabel} to ${toLabel}. Only output the translation, nothing else.`
}
```

关键在最后一句 "Only output the translation, nothing else"——限制模型只输出翻译结果，避免返回解释性文字。`temperature` 设为 0.3，追求翻译的确定性和一致性。

#### 缓存机制

翻译结果缓存在内存中的 `Map` 里，key 格式为 `zh2en:${text}` 或 `en2zh:${text}`。缓存策略是**FIFO 批量淘汰**——容量达到 500 时，删除最早的 100 条。这不是严格的 LRU，但对于翻译缓存场景足够：同一个词的重复翻译是最常见的，而 Map 的插入顺序天然保证了 FIFO 语义。

#### 降级策略

翻译失败时不会阻断整个流程，而是降级为 Unicode 转义：

```
"查询" → "67E5BE8F"
```

虽然这个 key 可读性差，但保证了流程不中断。用户在确认 key 的步骤中可以手动修改。

### 4.3 Key 生成：路径语义 + 翻译语义

i18n Key 的命名是团队协作中最容易产生分歧的环节。Fast I18n 的方案是**自动生成 + 用户确认**，自动生成的 key 由两部分组成：

```
key = 路径前缀 + 翻译后缀
例：USER_LIST.QUERY_CUSTOMER
     ───────── ──────────────
     路径前缀    翻译后缀
```

#### 路径前缀：贪心剥离算法

```
文件路径: src/pages/userList/index.tsx
  → 分段: ["src", "pages", "userList"]
  → 贪心剥离 stripDirs (src, pages, components, views):
     "src"   → 匹配，跳过，继续剥离
     "pages" → 匹配，跳过，继续剥离
     "userList" → 不匹配，停止剥离，保留
  → 结果: ["userList"]
  → 转 SCREAMING_SNAKE: "USER_LIST"
```

**贪心**的含义是：从左到右连续匹配就跳过，一旦遇到不匹配的目录名就立即停止。这避免了把深层目录中的同名目录误剥离。比如 `src/components/src/feature` 只会剥离第一个 `src`，第二个 `src` 因为前面遇到了 `components`（也在 stripDirs 中）会继续被剥离，但 `feature` 会被保留。

#### 翻译后缀：停用词过滤

```
英文翻译: "Please enter your name"
  → camelCase 边界插空格: "Please enter your name"
  → 小写 + 分词: ["please", "enter", "your", "name"]
  → 过滤停用词: ["enter", "name"]    ← please/your 被过滤
  → 取前 5 个词: ["enter", "name"]
  → 转 SCREAMING_SNAKE: "ENTER_NAME"
```

停用词表包含 40+ 个英文虚词和常见动词（a/an/the/is/are/of/in/please/your/enter/get/set...），确保 key 只保留**语义核心词**。这个策略的权衡是：key 更短更可读，但可能丢失一些区分度（比如 "enter name" 和 "input name" 可能生成相同的 key）。

### 4.4 替换文本生成：上下文驱动的映射表

这是最简洁的模块，核心是一个 switch-case：

| 上下文类型 | 原代码 | 替换后 | 包裹规则 |
|---|---|---|---|
| JSX_TEXT | `<div>中文</div>` | `<div>{t('key')}</div>` | 加 `{}` |
| JSX_ATTR_STR | `placeholder="中文"` | `placeholder={t('key')}` | 去引号加 `{}` |
| JSX_ATTR_EXPR | `title={expr}` | `title={t('key')}` | 不加 `{}`（外面已有） |
| JS_STRING | `const x = "中文"` | `const x = t('key')` | 不加 `{}` |
| TEMPLATE_EXPR | `` `prefix中文suffix` `` | `` `prefix${t('key')}suffix` `` | 加 `${}` |

**设计要点**：JSX 中字符串和表达式是两个不同的世界。`placeholder="中文"` 中的引号表示字符串字面量，替换为函数调用后必须用 `{}` 切换到表达式模式。而 `title={expr}` 中外面已经有 `{}` 了，直接替换表达式内容即可。

### 4.5 资源文件写入：最复杂的模块

这个模块占了整个项目 40% 的代码量，因为它要处理现实项目中各种各样的 i18n 文件组织方式。

#### 文件格式自动检测

```
.ts 文件
  ├── Barrel 文件 (有 import + export default {})  → 解析 import 找子文件
  ├── Flat TS 文件 (无 import + export default {})  → 直接追加到对象
  └── 其他 TS 文件                                   → 解析 → 修改 → 重写

.json 文件
  └── JSON.parse → 修改 → JSON.stringify
```

#### Barrel 文件路由

很多项目会把 i18n 资源按模块拆分：

```typescript
// zh-CN.ts (barrel 文件)
import user from './user';
import common from './common';
export default { ...user, ...common };
```

Fast I18n 检测到 barrel 结构后，会根据 key 的第一段自动匹配子文件：

```
key = "USER_LIST.QUERY_NAME"
  → prefix = "USER_LIST"
  → 遍历 import 列表: import user from './user'
  → user !== USER_LIST → 不匹配
  → 弹出 QuickPick 让用户选择写入哪个子文件
```

如果 import 的变量名和 key 前缀匹配（如 `import USER_LIST from './userList'`），则自动路由，无需用户干预。

#### 风格检测：保持文件一致性

新增 key-value 时，插件会检测文件已有的代码风格：

- **引号风格**：统计文件中单引号 key 和双引号 key 的数量，多数派胜出
- **缩进风格**：从已有的 key-value 行中提取缩进字符串

这样无论原文件用单引号还是双引号、2 空格还是 4 空格缩进，新增的内容都能保持一致。

#### Key 冲突处理

写入前检查 key 是否已存在：
- key 不存在 → 直接写入
- key 已存在且值相同 → 跳过
- key 已存在但值不同 → 弹窗询问是否覆盖

## 五、设计哲学

### 5.1 零运行时依赖

整个插件只依赖 `vscode` API 和 Node.js 内置模块（`fs`、`path`、`https`、`crypto`），没有引入任何第三方 npm 包。这意味着：

- 插件体积极小（编译后不到 100KB）
- 安装速度快
- 不会有依赖冲突
- 不会有供应链安全风险

### 5.2 单行分析 vs 全文件 AST

这是一个有意的权衡。单行正则分析的限制是：

- 不支持多行选区
- 极端嵌套场景可能误判
- 无法理解代码的语义上下文

但优势也很明显：

- **快**：不需要解析整个文件，毫秒级响应
- **轻**：不需要 Babel/TypeScript 解析器
- **通用**：不绑定特定框架，JSX/Vue 模板/纯 JS 都能工作

对于"选中一段文字右键替换"这个交互场景，单行分析是性价比最高的选择。

### 5.3 自动生成 + 人工确认

Key 的命名没有完全自动化——插件生成建议 key，但最终由用户确认。这是对"自动化 vs 可控性"的平衡：

- 完全自动化：key 可能不符合团队规范，后期难以修改
- 完全手动：失去了自动化的效率优势
- 自动生成 + 人工确认：兼顾效率和可控性，用户只需确认或微调

### 5.4 优雅降级

整个流程中每一步都有降级策略：

- 翻译失败 → Unicode 转义作为备用 key
- 找不到 i18n 文件 → 提示创建
- 找不到英文文件 → 只写中文文件
- Key 已存在 → 询问是否覆盖
- 文件格式不支持 → 提示手动写入

**绝不静默失败**——每一步出错都会通过状态栏或弹窗告知用户，不会悄悄产生错误结果。

## 六、适用场景与局限

### 适用场景

- React 项目的国际化改造（从零开始或增量补充）
- 中英文双语项目
- 使用 `t()` / `formatMessage()` / `intl.formatMessage()` 等 i18n 函数的项目
- i18n 资源文件为 `.ts` 或 `.json` 格式的项目

### 局限性

| 局限 | 原因 | 可能的改进方向 |
|---|---|---|
| 不支持多行选区 | 单行正则分析的限制 | 切换到 AST 方案 |
| 不支持 Vue SFC | 未适配 Vue 模板语法 | 增加 Vue 上下文识别规则 |
| 翻译质量依赖第三方 API | 无自建翻译能力 | 接入更多翻译引擎或本地模型 |
| 不支持嵌套 key 结构（如 `{a: {b: "值"}}`） | 写入时只处理扁平结构 | 增加嵌套对象的解析和写入能力 |
| 停用词表固定 | 硬编码在代码中 | 改为可配置 |

## 七、总结

Fast I18n 的核心价值不在于技术复杂度，而在于**精准地识别了一个高频痛点，并用最简方案解决**。它的技术选型体现了务实的工程判断：

- 用正则代替 AST，换取零依赖和毫秒级响应
- 用策略模式分发翻译引擎，保持扩展性
- 用路径+翻译双重语义生成 key，平衡自动化和可读性
- 用风格检测保持文件一致性，避免工具产生的代码成为技术债

对于一个 VS Code 插件来说，**轻量、快速、不侵入**比功能完备更重要。Fast I18n 在这个平衡点上做得恰到好处。

---

## 项目链接

- **GitHub 仓库**：[fast-i18n](https://github.com/your-username/fast-i18n)
- **VS Code Marketplace**：[Fast I18n](https://marketplace.visualstudio.com/items?itemName=your-publisher.fast-i18n)
- **问题反馈**：[Issues](https://github.com/your-username/fast-i18n/issues)

> 如果这个工具对你有帮助，欢迎 Star ⭐ 和分享！
