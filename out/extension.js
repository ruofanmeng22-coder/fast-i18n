"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const contextAnalyzer_1 = require("./contextAnalyzer");
const replacer_1 = require("./replacer");
const i18nWriter_1 = require("./i18nWriter");
const translator_1 = require("./translator");
const keyBuilder_1 = require("./keyBuilder");
const CONTEXT_LABEL = {
    [contextAnalyzer_1.ContextType.JSX_TEXT]: 'JSX文本',
    [contextAnalyzer_1.ContextType.JSX_ATTR_STR]: 'JSX属性',
    [contextAnalyzer_1.ContextType.JSX_ATTR_EXPR]: 'JSX表达式',
    [contextAnalyzer_1.ContextType.JS_STRING]: 'JS字符串',
    [contextAnalyzer_1.ContextType.TEMPLATE_EXPR]: '模板字符串',
    [contextAnalyzer_1.ContextType.UNKNOWN]: '未知',
};
function activate(context) {
    const cmd = vscode.commands.registerCommand('fast-i18n.replace', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
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
        if ((0, keyBuilder_1.isConstantRef)(selectedText)) {
            const replacement = `formatMessage({ id: '${selectedText.trim()}' })`;
            const ok = await editor.edit(builder => builder.replace(selection, replacement));
            if (!ok) {
                vscode.window.showErrorMessage('Fast I18n: 替换失败');
                return;
            }
            vscode.window.setStatusBarMessage(`Fast I18n ✓  ${selectedText}  →  ${replacement}`, 3000);
            return;
        }
        const isChinese = (0, contextAnalyzer_1.containsChinese)(selectedText);
        const isEnglish = !isChinese && (0, contextAnalyzer_1.containsEnglish)(selectedText);
        if (!isChinese && !isEnglish) {
            vscode.window.showWarningMessage('Fast I18n: 选中内容不含中文或英文');
            return;
        }
        // ── 上下文分析 ────────────────────────────────────────
        const analysis = (0, contextAnalyzer_1.analyzeContext)(editor.document, selection);
        // ── 翻译 + 生成建议 key ───────────────────────────────
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
        const filePath = editor.document.uri.fsPath;
        let zhText = '';
        let enText = '';
        let translationFailed = false;
        if (isChinese) {
            // 中文路径：译成英文，key 从英文生成
            try {
                enText = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Fast I18n: 正在翻译…', cancellable: false }, () => (0, translator_1.translate)(selectedText));
            }
            catch {
                translationFailed = true;
            }
            zhText = selectedText;
        }
        else {
            // 英文路径：译成中文，key 从英文原文生成
            enText = selectedText;
            try {
                zhText = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Fast I18n: 正在翻译…', cancellable: false }, () => (0, translator_1.translateToZh)(selectedText));
            }
            catch {
                translationFailed = true;
                zhText = selectedText; // 降级：zh-CN 写英文原文
            }
        }
        const suggestedKey = (0, keyBuilder_1.buildKey)(enText || selectedText, filePath, root);
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
                if (!val.trim()) {
                    return 'Key 不能为空';
                }
                if (/\s/.test(val)) {
                    return 'Key 不能含空格';
                }
                if (!/^[a-zA-Z0-9._-]+$/.test(val)) {
                    return '只允许：字母 数字 . _ -';
                }
                return undefined;
            },
        });
        if (key === undefined) {
            return;
        }
        // ── 生成替换文本 ──────────────────────────────────────
        const config = getConfig();
        const replacement = (0, replacer_1.buildReplacement)(key, analysis.contextType, config);
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
            .get('i18nFilePath', '');
        await (0, i18nWriter_1.writeKeyValue)(key, zhText || selectedText, enText || selectedText, configuredPath, root);
        // ── 状态栏提示 ────────────────────────────────────────
        vscode.window.setStatusBarMessage(`Fast I18n ✓  [${CONTEXT_LABEL[analysis.contextType]}]  ${selectedText}  →  ${replacement}`, 3000);
    });
    context.subscriptions.push(cmd);
}
function deactivate() { }
function getConfig() {
    const cfg = vscode.workspace.getConfiguration('fast-i18n');
    return {
        functionStyle: cfg.get('functionStyle', ''),
        functionTemplate: cfg.get('functionTemplate', ''),
    };
}
