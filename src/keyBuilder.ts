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

export function toScreamingSnakeCase(text: string): string {
  // 插入空格：camelCase / PascalCase 边界
  const spaced = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

  return spaced
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join('_')
    .toUpperCase();
}
