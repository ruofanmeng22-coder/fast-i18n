# Fast I18n — 英文选中支持 设计文档

**日期：** 2026-06-04  
**状态：** 已确认，待实现

---

## 1. 需求概述

在现有"选中文 → 译英 → 写双语文件"流程基础上，新增"选英文 → 译中文 → 写双语文件"路径。

**改造前：** 只支持选中中文触发
**改造后：** 选中英文同样触发，key 从英文原文生成，中文译文写入 zh-CN，英文原文写入 en-US

---

## 2. 流程对比

| | 选中文路径 | 选英文路径 |
|--|--|--|
| 触发条件 | `containsChinese(text)` | `containsEnglish(text)`（含英文字母） |
| 翻译方向 | 中→英（`sl=zh-CN&tl=en`） | 英→中（`sl=en&tl=zh-CN`） |
| key 建议 | 英文译文 → SCREAMING_SNAKE_CASE | 英文原文 → SCREAMING_SNAKE_CASE（无需翻译） |
| zh-CN 写入 | 中文原文 | 中文译文 |
| en-US 写入 | 英文译文 | 英文原文 |

**优先级：** 选中内容同时含中英文 → 走中文路径（`containsChinese` 优先）。

---

## 3. 模块改动

### 3.1 `contextAnalyzer.ts`

新增导出函数：

```typescript
export function containsEnglish(text: string): boolean {
  return /[a-zA-Z]/.test(text);
}
```

选中内容含英文字母即返回 true（不要求纯英文，排除纯数字/符号）。

### 3.2 `translator.ts`

新增导出函数 `translateToZh`，复用现有缓存和降级逻辑：

```typescript
export async function translateToZh(text: string): Promise<string>
```

实现：与现有 `translate()` 相同结构，但请求参数改为 `sl=en&tl=zh-CN`。共享同一个 `cache` Map（key 可加前缀 `zh:` 区分方向，避免英文词条碰撞）。降级策略与 `translate()` 相同（Unicode hex）。

### 3.3 `extension.ts`

在校验阶段后，根据语言分支执行不同逻辑：

```
containsChinese(selectedText)
  → true：现有中文路径（不变）
  → false && containsEnglish(selectedText)：英文路径（新增）
  → false && !containsEnglish：showWarning "选中内容不含中文或英文"
```

**英文路径流程：**

```
suggestedKey = buildKey(selectedText, filePath, root)   // 直接用英文原文，不翻译
zhText = await translateToZh(selectedText)              // 中文译文（带 progress）
enText = selectedText                                   // 英文原文

showInputBox({ value: suggestedKey })                   // 用户确认 key
writeKeyValue(key, zhText, enText, configuredPath, root)
```

翻译失败时：`zhText = selectedText`（原文降级），状态栏提示"翻译失败，zh-CN 将写入英文原文"。

---

## 4. 异常场景

| 场景 | 处理 |
|------|------|
| `translateToZh` 失败 | zh-CN 写入英文原文；状态栏警告；替换和 en-US 写入正常完成 |
| 选中内容含中英混合 | `containsChinese` 优先，走中文路径 |
| 纯数字/符号 | 不含中文也不含英文 → showWarning |
| 缓存碰撞（同词有 zh→en 和 en→zh 两次缓存） | cache key 加 `zh:` 前缀区分方向 |

---

## 5. 不在本次范围内

- 其他语言支持（日/韩等）
- 自动检测语言方向（依赖 containsChinese / containsEnglish 显式判断）
- 批量替换
