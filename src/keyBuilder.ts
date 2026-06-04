import * as path from 'path';
import * as vscode from 'vscode';

export function buildKey(
  enText: string,
  filePath: string,
  workspaceRoot: string
): string {
  const stripDirs: string[] = vscode.workspace
    .getConfiguration('fast-i18n')
    .get<string[]>('keyPrefixStrip', ['src', 'pages', 'components', 'views']);
  const prefix = inferPrefix(filePath, workspaceRoot, stripDirs);
  const suffix = toScreamingSnakeCase(enText);
  return prefix && suffix ? `${prefix}.${suffix}` : prefix || suffix;
}

function inferPrefix(filePath: string, workspaceRoot: string, stripDirs: string[]): string {

  // 转相对路径，统一用 /
  const rel = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
  const parts = rel.split('/');

  // 去掉文件名
  const dirs = parts.slice(0, -1);

  // 剥离顶层 strip 段（只剥一次匹配到的最长前缀）
  const filtered: string[] = [];
  let stripping = true;
  for (const dir of dirs) {
    if (stripping && stripDirs.includes(dir)) {
      continue;
    }
    stripping = false;
    filtered.push(dir);
  }

  return filtered.map(toScreamingSnakeCase).join('.');
}

/** SCREAMING_SNAKE → camelCase, e.g. QUERY_CUSTOMER_LIST → queryCustomerList */
export function screamingSnakeToCamel(s: string): string {
  return s.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Convert a dotted SCREAMING_SNAKE constant ref to a dotted camelCase i18n key.
 * e.g. BUSINESS_ERROR_CODE.QUERY_CUSTOMER_LIST → businessErrorCode.queryCustomerList
 */
export function constantRefToI18nKey(ref: string): string {
  return ref.split('.').map(screamingSnakeToCamel).join('.');
}

/** Returns true if text looks like a dotted SCREAMING_SNAKE constant reference */
export function isConstantRef(text: string): boolean {
  return /^[A-Z][A-Z0-9_]*(\.[A-Z][A-Z0-9_]*)+$/.test(text.trim());
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'so', 'yet',
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did',
  'no', 'not', 'of', 'in', 'on', 'at', 'to', 'for',
  'with', 'by', 'from', 'as', 'into', 'than', 'that',
  'this', 'it', 'its', 'if', 'will', 'can', 'may', 'when',
  'please', 'enter', 'your', 'you', 'we', 'i', 'my', 'our',
  'sure', 'want', 'need', 'get', 'set', 'use', 'make',
]);

export function toScreamingSnakeCase(text: string): string {
  const maxWords: number = vscode.workspace
    .getConfiguration('fast-i18n')
    .get<number>('keyMaxWords', 5);

  // 插入空格：camelCase / PascalCase 边界
  const spaced = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

  const words = spaced
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const meaningful = words.filter(w => !STOP_WORDS.has(w));
  const selected = (meaningful.length > 0 ? meaningful : words).slice(0, maxWords);

  return selected.join('_').toUpperCase();
}
