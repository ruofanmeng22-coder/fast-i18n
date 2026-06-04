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
exports.ContextType = void 0;
exports.containsChinese = containsChinese;
exports.containsEnglish = containsEnglish;
exports.analyzeContext = analyzeContext;
const vscode = __importStar(require("vscode"));
var ContextType;
(function (ContextType) {
    ContextType["JSX_TEXT"] = "JSX_TEXT";
    ContextType["JSX_ATTR_STR"] = "JSX_ATTR_STR";
    ContextType["JSX_ATTR_EXPR"] = "JSX_ATTR_EXPR";
    ContextType["JS_STRING"] = "JS_STRING";
    ContextType["TEMPLATE_EXPR"] = "TEMPLATE_EXPR";
    ContextType["UNKNOWN"] = "UNKNOWN";
})(ContextType || (exports.ContextType = ContextType = {}));
function containsChinese(text) {
    return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text);
}
function containsEnglish(text) {
    return /[a-zA-Z]/.test(text);
}
function analyzeContext(document, selection) {
    const selectedText = document.getText(selection);
    const line = document.lineAt(selection.start.line).text;
    const before = line.substring(0, selection.start.character);
    const after = line.substring(selection.end.character);
    // ① JSX 属性字符串：placeholder="中文" / placeholder='中文'
    if (/=["']$/.test(before) && /^["']/.test(after)) {
        return {
            contextType: ContextType.JSX_ATTR_STR,
            replaceRange: expandSurroundingQuotes(document, selection),
            originalText: selectedText,
        };
    }
    // ② JSX 文本节点：> ... 中文 ... <
    const lastGT = before.lastIndexOf('>');
    const lastLT = before.lastIndexOf('<');
    if (lastGT !== -1 && lastGT > lastLT && /^\s*</.test(after)) {
        return {
            contextType: ContextType.JSX_TEXT,
            replaceRange: selection,
            originalText: selectedText,
        };
    }
    // ③ 模板字符串内：`...中文...`
    if (isInsideTemplateLiteral(before)) {
        return {
            contextType: ContextType.TEMPLATE_EXPR,
            replaceRange: selection,
            originalText: selectedText,
        };
    }
    // ④ 普通 JS 字符串："中文" / '中文'
    if (/["']$/.test(before.trimEnd())) {
        return {
            contextType: ContextType.JS_STRING,
            replaceRange: expandSurroundingQuotes(document, selection),
            originalText: selectedText,
        };
    }
    // ⑤ 兜底
    return {
        contextType: ContextType.UNKNOWN,
        replaceRange: selection,
        originalText: selectedText,
    };
}
/** 奇数个反引号 → 在模板字符串内 */
function isInsideTemplateLiteral(before) {
    let count = 0;
    for (let i = 0; i < before.length; i++) {
        if (before[i] === '\\') {
            i++;
            continue;
        }
        if (before[i] === '`') {
            count++;
        }
    }
    return count % 2 === 1;
}
/** 将选区扩展到包含前后引号（字符相同才扩展） */
function expandSurroundingQuotes(document, selection) {
    const line = document.lineAt(selection.start.line).text;
    const start = selection.start.character;
    const end = selection.end.character;
    const qBefore = start > 0 ? line[start - 1] : '';
    const qAfter = end < line.length ? line[end] : '';
    if ((qBefore === '"' || qBefore === "'") &&
        qBefore === qAfter) {
        return new vscode.Range(new vscode.Position(selection.start.line, start - 1), new vscode.Position(selection.end.line, end + 1));
    }
    return selection;
}
