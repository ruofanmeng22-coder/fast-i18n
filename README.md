# Fast I18n

一键将 React 项目中的硬编码中文/英文文本替换为 i18n 国际化调用的 VS Code 扩展。

## 功能概览

- **一键替换**：选中文本 → 右键执行命令 → 自动翻译、生成 key、替换代码、写入资源文件
- **智能上下文感知**：自动识别 JSX 文本、JSX 属性、JS 字符串、模板字符串等场景，生成正确的替换语法
- **多翻译引擎**：支持 Google、百度、DeepL、OpenAI、自定义翻译服务
- **灵活函数风格**：支持 `t()`、`formatMessage()`、`intl.formatMessage()`、自定义模板、裸 key
- **双语资源文件**：自动写入 `zh-CN` / `en-US` 文件，支持 `.ts` 和 `.json` 格式
- **Barrel 文件支持**：识别 `import + export default {}` 结构，自动路由 key 到子文件
- **常量引用快捷路径**：选中 `MODULE.CONSTANT_NAME` 格式直接转为 `formatMessage({ id: '...' })`

## 安装

1. 在 VS Code 扩展市场搜索 `Fast I18n` 安装，或通过 `.vsix` 文件手动安装：
   ```bash
   code --install-extension fast-i18n-0.1.0.vsix
   ```
2. 重新加载 VS Code 窗口

## 使用方法

1. 在编辑器中**选中**需要国际化的中文或英文文本
2. **右键** → 选择 **"Fast I18n: Replace with i18n Key"**
3. 插件自动翻译文本并生成建议 key，在弹出的输入框中**确认或修改** key
4. 代码自动替换为 i18n 函数调用，双语资源文件自动写入

### 替换示例

| 上下文 | 原代码 | 替换后 |
|---|---|---|
| JSX 文本 | `<div>查询客户</div>` | `<div>{t('USER_LIST.QUERY_CUSTOMER')}</div>` |
| JSX 属性字符串 | `placeholder="请输入"` | `placeholder={t('USER_LIST.PLEASE_ENTER')}` |
| JSX 属性表达式 | `title={expr}` | `title={t('KEY')}` |
| JS 字符串 | `const msg = "成功"` | `const msg = t('COMMON.SUCCESS')` |
| 模板字符串 | `` `共${total}条` `` | `` `共${t('COMMON.TOTAL')}条` `` |
| 常量引用 | `MODULE.CONSTANT_NAME` | `formatMessage({ id: 'MODULE.CONSTANT_NAME' })` |

## 配置项

在 VS Code 设置中搜索 `fast-i18n` 进行配置：

| 配置项 | 说明 | 默认值 |
|---|---|---|
| `fast-i18n.functionStyle` | i18n 函数调用风格 | `""`（裸 key） |
| `fast-i18n.functionTemplate` | `functionStyle` 为 `custom` 时的模板，用 `{{key}}` 占位 | `""` |
| `fast-i18n.i18nFilePath` | i18n 文件路径（相对工作区根目录），为空则自动查找 | `""` |
| `fast-i18n.keyPrefixStrip` | 生成 key 前缀时从文件路径中剥离的目录名 | `["src", "pages", "components", "views"]` |
| `fast-i18n.translationService` | 翻译服务提供商 | `"google"` |
| `fast-i18n.translationApiKey` | 翻译 API Key（DeepL / OpenAI / 自定义服务） | `""` |
| `fast-i18n.translationAppId` | 百度翻译 App ID | `""` |
| `fast-i18n.translationSecretKey` | 百度翻译密钥 | `""` |
| `fast-i18n.translationApiUrl` | 自定义翻译服务 URL 或 OpenAI 兼容 API Base URL | `""` |
| `fast-i18n.translationModel` | OpenAI 模型名称 | `"gpt-3.5-turbo"` |

### 函数风格选项

| 值 | 输出格式 |
|---|---|
| `""` | `key`（仅输出 key） |
| `"t"` | `t('key')` |
| `"formatMessage"` | `formatMessage({ id: 'key' })` |
| `"intl.formatMessage"` | `intl.formatMessage({ id: 'key' })` |
| `"custom"` | 使用 `functionTemplate` 配置的模板，如 `i18n.get('{{key}}')` → `i18n.get('key')` |

### 翻译服务选项

| 值 | 说明 | 所需配置 |
|---|---|---|
| `"google"` | Google 翻译免费 API（默认，国内可能不可用） | 无 |
| `"baidu"` | 百度翻译 API | `translationAppId` + `translationSecretKey` |
| `"deepl"` | DeepL 翻译 API | `translationApiKey` |
| `"openai"` | OpenAI 兼容 API | `translationApiKey`，可选 `translationApiUrl`、`translationModel` |
| `"custom"` | 自定义翻译服务 | `translationApiUrl`，可选 `translationApiKey` |

## i18n 文件查找策略

1. 如果配置了 `i18nFilePath`，使用配置路径
2. 否则按以下顺序自动查找：
   - `src/locales/zh-CN.ts` / `en-US.ts`
   - `src/locales/zh-CN.json` / `en-US.json`
   - `src/locales/zh.ts` / `en.ts`
   - `src/locales/zh.json` / `en.json`
   - `src/i18n/zh-CN.ts` / `en-US.ts`
   - `src/i18n/zh-CN.json` / `en-US.json`
3. 均未找到时，提示在 `src/locales/` 下创建

## Key 生成规则

Key 由 **文件路径前缀** + **英文翻译后缀** 组成：

- **前缀**：从文件相对路径推导，自动剥离 `src`、`pages`、`components`、`views` 等目录段，转为 `SCREAMING_SNAKE` 格式
  - 例：`src/pages/userList/index.tsx` → 前缀为 `USER_LIST`
- **后缀**：从英文翻译中提取关键词（过滤停用词），转为 `SCREAMING_SNAKE` 格式，最多 5 个词
  - 例：`"Please enter your name"` → `PLEASE_ENTER_NAME`
- 最终 key：`USER_LIST.PLEASE_ENTER_NAME`

## 开发

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 监听模式
npm run watch

# 打包 vsix
npx vsce package
```

## 项目结构

```
src/
├── extension.ts        # 插件入口，注册命令，编排主流程
├── contextAnalyzer.ts  # 上下文分析，识别选区所在代码结构
├── keyBuilder.ts       # Key 生成，路径前缀 + 翻译后缀
├── replacer.ts         # 替换文本生成，根据上下文和函数风格
├── translator.ts       # 翻译服务，支持 5 种引擎 + 缓存
└── i18nWriter.ts       # 资源文件写入，支持 .ts/.json/barrel
```
