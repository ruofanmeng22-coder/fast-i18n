import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

// ── 候选路径配对 ─────────────────────────────────────────
const CANDIDATES: Array<{ zh: string; en: string }> = [
  { zh: 'src/locales/zh-CN.ts',   en: 'src/locales/en-US.ts'   },
  { zh: 'src/locales/zh-CN.json', en: 'src/locales/en-US.json' },
  { zh: 'src/locales/zh.ts',      en: 'src/locales/en.ts'      },
  { zh: 'src/locales/zh.json',    en: 'src/locales/en.json'    },
  { zh: 'src/i18n/zh-CN.ts',      en: 'src/i18n/en-US.ts'      },
  { zh: 'src/i18n/zh-CN.json',    en: 'src/i18n/en-US.json'    },
];

// ── 公开 API ─────────────────────────────────────────────

/**
 * @param key       i18n key
 * @param zhValue   中文原文（写入 zh-CN 文件）
 * @param enValue   英文译文（写入 en-US 文件）
 * @param configuredPath  fast-i18n.i18nFilePath 配置值（可为空）
 * @param workspaceRoot   工作区根目录绝对路径
 */
export async function writeKeyValue(
  key: string,
  zhValue: string,
  enValue: string,
  configuredPath: string,
  workspaceRoot: string
): Promise<void> {
  const pair = await resolvePair(configuredPath, workspaceRoot);
  if (!pair) { return; }

  await writeSingleFile(key, zhValue, pair.zh);
  if (pair.en) {
    await writeSingleFile(key, enValue, pair.en);
  }
}

// ── 路径探测 ─────────────────────────────────────────────

interface FilePair {
  zh: string;
  en: string; // '' means skip en write
}

async function resolvePair(
  configuredPath: string,
  root: string
): Promise<FilePair | undefined> {
  if (configuredPath) {
    // 用户手动配置：zh = 配置路径，en = 同目录同后缀替换
    const abs = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(root, configuredPath);
    const en = abs.replace(/zh[-_]?CN/i, 'en-US').replace(/\bzh\b/i, 'en');

    if (!fs.existsSync(abs)) {
      const choice = await vscode.window.showWarningMessage(
        `Fast I18n: 配置的 i18n 文件不存在 ${configuredPath}，是否创建？`,
        '创建', '取消'
      );
      if (choice !== '创建') { return undefined; }
      ensureEmptyFile(abs, abs.endsWith('.ts'));
    }

    if (en !== abs && !fs.existsSync(en)) {
      const choice = await vscode.window.showWarningMessage(
        `Fast I18n: 未找到对应英文文件，是否创建？`,
        '创建', '跳过'
      );
      if (choice === '创建') {
        ensureEmptyFile(en, en.endsWith('.ts'));
      } else {
        return { zh: abs, en: '' };
      }
    }

    return { zh: abs, en };
  }

  // 自动探测
  for (const c of CANDIDATES) {
    const absZh = path.join(root, c.zh);
    if (fs.existsSync(absZh)) {
      const absEn = path.join(root, c.en);
      if (!fs.existsSync(absEn)) {
        const choice = await vscode.window.showWarningMessage(
          `Fast I18n: 未找到英文文件 ${c.en}，是否创建？`,
          '创建', '跳过'
        );
        if (choice === '创建') {
          ensureEmptyFile(absEn, c.en.endsWith('.ts'));
          return { zh: absZh, en: absEn };
        }
        return { zh: absZh, en: '' }; // en='' 表示跳过
      }
      return { zh: absZh, en: absEn };
    }
  }

  // 都不存在
  const choice = await vscode.window.showWarningMessage(
    `Fast I18n: 未找到 i18n 文件，是否在 src/locales/ 创建 zh-CN.ts 和 en-US.ts？`,
    '创建', '取消'
  );
  if (choice !== '创建') { return undefined; }

  const absZh = path.join(root, 'src/locales/zh-CN.ts');
  const absEn = path.join(root, 'src/locales/en-US.ts');
  ensureEmptyFile(absZh, true);
  ensureEmptyFile(absEn, true);
  return { zh: absZh, en: absEn };
}

// ── 单文件写入 ───────────────────────────────────────────

async function writeSingleFile(
  key: string,
  value: string,
  absPath: string
): Promise<void> {
  const isTs = absPath.endsWith('.ts');

  if (!fs.existsSync(absPath)) {
    ensureEmptyFile(absPath, isTs);
  }

  let obj: Record<string, string>;
  try {
    obj = isTs ? readTsFile(absPath) : readJsonFile(absPath);
  } catch (e) {
    vscode.window.showErrorMessage(
      `Fast I18n: 文件解析失败 ${absPath} — ${(e as Error).message}`
    );
    return;
  }

  if (key in obj && obj[key] !== value) {
    const choice = await vscode.window.showWarningMessage(
      `Fast I18n: Key "${key}" 已存在（值: "${obj[key]}"），是否覆盖？`,
      '覆盖', '取消'
    );
    if (choice !== '覆盖') { return; }
  }

  obj[key] = value;

  try {
    if (isTs) {
      writeTsFile(absPath, obj);
    } else {
      writeJsonFile(absPath, obj);
    }
  } catch (e) {
    vscode.window.showErrorMessage(
      `Fast I18n: 文件写入失败 ${absPath} — ${(e as Error).message}`
    );
  }
}

// ── .ts 读写 ─────────────────────────────────────────────

function readTsFile(absPath: string): Record<string, string> {
  const content = fs.readFileSync(absPath, 'utf-8');
  const match = content.match(/export\s+default\s+([\s\S]*?);?\s*$/);
  if (!match) {
    throw new Error('不是 `export default { ... }` 格式，无法解析');
  }
  try {
    const obj = vm.runInNewContext(`(${match[1]})`, {});
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      throw new Error('export default 值必须是对象');
    }
    return obj as Record<string, string>;
  } catch (e) {
    throw new Error(`对象解析失败: ${(e as Error).message}`);
  }
}

function writeTsFile(absPath: string, obj: Record<string, string>): void {
  const body = JSON.stringify(obj, null, 2);
  fs.writeFileSync(absPath, `export default ${body};\n`, 'utf-8');
}

// ── .json 读写 ───────────────────────────────────────────

function readJsonFile(absPath: string): Record<string, string> {
  return JSON.parse(fs.readFileSync(absPath, 'utf-8'));
}

function writeJsonFile(absPath: string, obj: Record<string, string>): void {
  fs.writeFileSync(absPath, JSON.stringify(obj, null, 2) + '\n', 'utf-8');
}

// ── 创建空文件 ───────────────────────────────────────────

function ensureEmptyFile(absPath: string, isTs: boolean): void {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const empty = isTs ? 'export default {\n};\n' : '{}\n';
  fs.writeFileSync(absPath, empty, 'utf-8');
}
