import * as vscode from 'vscode';
import { analyzeContext, containsChinese, containsEnglish, ContextType } from './contextAnalyzer';
import { buildReplacement, I18nConfig } from './replacer';
import { writeKeyValue } from './i18nWriter';
import { translate, translateToZh } from './translator';
import { buildKey, isConstantRef, constantRefToI18nKey } from './keyBuilder';

const CONTEXT_LABEL: Record<ContextType, string> = {
  [ContextType.JSX_TEXT]:      'JSX文本',
  [ContextType.JSX_ATTR_STR]:  'JSX属性',
  [ContextType.JSX_ATTR_EXPR]: 'JSX表达式',
  [ContextType.JS_STRING]:     'JS字符串',
  [ContextType.TEMPLATE_EXPR]: '模板字符串',
  [ContextType.UNKNOWN]:       '未知',
};

export function activate(context: vscode.ExtensionContext) {
  const cmd = vscode.commands.registerCommand('fast-i18n.replace', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

    const selection = editor.selection;

    // ── 校验 ──────────────────────────────────────────────
    if (selection.isEmpty) {
      vscode.window.showWarningMessage('Fast I18n: 请先选中中文文本');
      return;
    }
    if (selection.start.line !== selection.end.line) {
      vscode.window.showWarningMessage('Fast I18n: 暂不支持多行选区');
      return;
    }

    const selectedText = editor.document.getText(selection);

    // ── 常量引用快捷路径：SCREAMING_SNAKE.DOTTED → formatMessage({ id: '...' }) ──
    if (isConstantRef(selectedText)) {
      const replacement = `formatMessage({ id: '${selectedText.trim()}' })`;
      const ok = await editor.edit(builder => builder.replace(selection, replacement));
      if (!ok) { vscode.window.showErrorMessage('Fast I18n: 替换失败'); return; }
      vscode.window.setStatusBarMessage(`Fast I18n ✓  ${selectedText}  →  ${replacement}`, 3000);
      return;
    }

    const isChinese = containsChinese(selectedText);
    const isEnglish = !isChinese && containsEnglish(selectedText);

    if (!isChinese && !isEnglish) {
      vscode.window.showWarningMessage('Fast I18n: 选中内容不含中文或英文');
      return;
    }

    // ── 上下文分析 ────────────────────────────────────────
    const analysis = analyzeContext(editor.document, selection);

    // ── 翻译 + 生成建议 key ───────────────────────────────
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    const filePath = editor.document.uri.fsPath;

    let zhText = '';
    let enText = '';
    let translationFailed = false;

    if (isChinese) {
      // 中文路径：译成英文，key 从英文生成
      try {
        enText = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Fast I18n: 正在翻译…', cancellable: false },
          () => translate(selectedText)
        );
      } catch {
        translationFailed = true;
      }
      zhText = selectedText;
    } else {
      // 英文路径：译成中文，key 从英文原文生成
      enText = selectedText;
      try {
        zhText = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Fast I18n: 正在翻译…', cancellable: false },
          () => translateToZh(selectedText)
        );
      } catch {
        translationFailed = true;
        zhText = selectedText; // 降级：zh-CN 写英文原文
      }
    }

    const suggestedKey = buildKey(enText || selectedText, filePath, root);

    if (isChinese && (translationFailed || !enText)) {
      vscode.window.setStatusBarMessage('Fast I18n ⚠ 翻译失败，已使用备用 key', 4000);
    }
    if (!isChinese && translationFailed) {
      vscode.window.setStatusBarMessage('Fast I18n ⚠ 翻译失败，zh-CN 将写入英文原文', 4000);
    }

    // ── 输入 Key ──────────────────────────────────────────
    const key = await vscode.window.showInputBox({
      prompt: `[${CONTEXT_LABEL[analysis.contextType]}] 确认/修改 i18n Key —— 原文：${selectedText}`,
      value: suggestedKey,
      validateInput: (val) => {
        if (!val.trim()) { return 'Key 不能为空'; }
        if (/\s/.test(val)) { return 'Key 不能含空格'; }
        if (!/^[a-zA-Z0-9._-]+$/.test(val)) { return '只允许：字母 数字 . _ -'; }
        return undefined;
      },
    });
    if (key === undefined) { return; }

    // ── 生成替换文本 ──────────────────────────────────────
    const config = getConfig();
    const replacement = buildReplacement(key, analysis.contextType, config);

    // ── 执行替换 ──────────────────────────────────────────
    const ok = await editor.edit((builder) => {
      builder.replace(analysis.replaceRange, replacement);
    });
    if (!ok) {
      vscode.window.showErrorMessage('Fast I18n: 替换失败');
      return;
    }

    // ── 写入双语 i18n 文件 ────────────────────────────────
    const configuredPath = vscode.workspace
      .getConfiguration('fast-i18n')
      .get<string>('i18nFilePath', '');

    await writeKeyValue(key, zhText || selectedText, enText || selectedText, configuredPath, root);

    // ── 状态栏提示 ────────────────────────────────────────
    vscode.window.setStatusBarMessage(
      `Fast I18n ✓  [${CONTEXT_LABEL[analysis.contextType]}]  ${selectedText}  →  ${replacement}`,
      3000
    );
  });

  context.subscriptions.push(cmd);
}

export function deactivate() {}

function getConfig(): I18nConfig {
  const cfg = vscode.workspace.getConfiguration('fast-i18n');
  return {
    functionStyle:    cfg.get<string>('functionStyle',    ''),
    functionTemplate: cfg.get<string>('functionTemplate', ''),
  };
}
