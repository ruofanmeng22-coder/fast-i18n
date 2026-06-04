import * as vscode from 'vscode';

export enum ContextType {
  JSX_TEXT     = 'JSX_TEXT',      // <div>|中文|</div>
  JSX_ATTR_STR = 'JSX_ATTR_STR',  // placeholder="|中文|"
  JSX_ATTR_EXPR= 'JSX_ATTR_EXPR', // placeholder={|expr|}
  JS_STRING    = 'JS_STRING',     // const x = "|中文|"
  TEMPLATE_EXPR= 'TEMPLATE_EXPR', // `prefix|中文|suffix`
  UNKNOWN      = 'UNKNOWN',
}

export interface AnalysisResult {
  contextType: ContextType;
  /** 实际替换的范围，可能大于原选区（含引号扩展） */
  replaceRange: vscode.Range;
  originalText: string;
}

export function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text);
}

export function containsEnglish(text: string): boolean {
  return /[a-zA-Z]/.test(text);
}

export function analyzeContext(
  document: vscode.TextDocument,
  selection: vscode.Selection
): AnalysisResult {
  const selectedText = document.getText(selection);
  const line   = document.lineAt(selection.start.line).text;
  const before = line.substring(0, selection.start.character);
  const after  = line.substring(selection.end.character);

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
function isInsideTemplateLiteral(before: string): boolean {
  let count = 0;
  for (let i = 0; i < before.length; i++) {
    if (before[i] === '\\') { i++; continue; }
    if (before[i] === '`') { count++; }
  }
  return count % 2 === 1;
}

/** 将选区扩展到包含前后引号（字符相同才扩展） */
function expandSurroundingQuotes(
  document: vscode.TextDocument,
  selection: vscode.Selection
): vscode.Range {
  const line    = document.lineAt(selection.start.line).text;
  const start   = selection.start.character;
  const end     = selection.end.character;
  const qBefore = start > 0           ? line[start - 1] : '';
  const qAfter  = end < line.length   ? line[end]       : '';

  if (
    (qBefore === '"' || qBefore === "'") &&
    qBefore === qAfter
  ) {
    return new vscode.Range(
      new vscode.Position(selection.start.line, start - 1),
      new vscode.Position(selection.end.line,   end   + 1)
    );
  }
  return selection;
}
