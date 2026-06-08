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
exports.writeKeyValue = writeKeyValue;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const CANDIDATES = [
    { zh: 'src/locales/zh-CN.ts', en: 'src/locales/en-US.ts' },
    { zh: 'src/locales/zh-CN.json', en: 'src/locales/en-US.json' },
    { zh: 'src/locales/zh.ts', en: 'src/locales/en.ts' },
    { zh: 'src/locales/zh.json', en: 'src/locales/en.json' },
    { zh: 'src/i18n/zh-CN.ts', en: 'src/i18n/en-US.ts' },
    { zh: 'src/i18n/zh-CN.json', en: 'src/i18n/en-US.json' },
];
async function writeKeyValue(key, zhValue, enValue, configuredPath, workspaceRoot) {
    const pair = await resolvePair(configuredPath, workspaceRoot);
    if (!pair) {
        return;
    }
    await writeSingleFile(key, zhValue, pair.zh);
    if (pair.en) {
        await writeSingleFile(key, enValue, pair.en);
    }
}
async function resolvePair(configuredPath, root) {
    if (configuredPath) {
        const abs = path.isAbsolute(configuredPath)
            ? configuredPath
            : path.join(root, configuredPath);
        const en = abs.replace(/zh[-_]?CN/i, 'en-US').replace(/\bzh\b/i, 'en');
        if (!fs.existsSync(abs)) {
            const choice = await vscode.window.showWarningMessage(`Fast I18n: 配置的 i18n 文件不存在 ${configuredPath}，是否创建？`, '创建', '取消');
            if (choice !== '创建') {
                return undefined;
            }
            await ensureEmptyFile(abs, abs.endsWith('.ts'));
        }
        if (en !== abs && !fs.existsSync(en)) {
            const choice = await vscode.window.showWarningMessage(`Fast I18n: 未找到对应英文文件，是否创建？`, '创建', '跳过');
            if (choice === '创建') {
                await ensureEmptyFile(en, en.endsWith('.ts'));
            }
            else {
                return { zh: abs, en: '' };
            }
        }
        return { zh: abs, en };
    }
    for (const c of CANDIDATES) {
        const absZh = path.join(root, c.zh);
        if (fs.existsSync(absZh)) {
            const absEn = path.join(root, c.en);
            if (!fs.existsSync(absEn)) {
                const choice = await vscode.window.showWarningMessage(`Fast I18n: 未找到英文文件 ${c.en}，是否创建？`, '创建', '跳过');
                if (choice === '创建') {
                    await ensureEmptyFile(absEn, c.en.endsWith('.ts'));
                    return { zh: absZh, en: absEn };
                }
                return { zh: absZh, en: '' };
            }
            return { zh: absZh, en: absEn };
        }
    }
    const choice = await vscode.window.showWarningMessage(`Fast I18n: 未找到 i18n 文件，是否在 src/locales/ 创建 zh-CN.ts 和 en-US.ts？`, '创建', '取消');
    if (choice !== '创建') {
        return undefined;
    }
    const absZh = path.join(root, 'src/locales/zh-CN.ts');
    const absEn = path.join(root, 'src/locales/en-US.ts');
    await ensureEmptyFile(absZh, true);
    await ensureEmptyFile(absEn, true);
    return { zh: absZh, en: absEn };
}
async function writeSingleFile(key, value, absPath) {
    const isTs = absPath.endsWith('.ts');
    if (!fs.existsSync(absPath)) {
        await ensureEmptyFile(absPath, isTs);
    }
    if (isTs) {
        const raw = await fs.promises.readFile(absPath, 'utf-8');
        if (isBarrelFile(raw)) {
            const subFile = await resolveSubFile(key, absPath, raw);
            if (!subFile) {
                return;
            }
            const subRaw = fs.existsSync(subFile)
                ? await fs.promises.readFile(subFile, 'utf-8')
                : 'export default {\n};\n';
            if (!isFlatTsFile(subRaw)) {
                vscode.window.showErrorMessage(`Fast I18n: 子文件 ${path.basename(subFile)} 也是 barrel，不支持二层嵌套，请手动写入`);
                return;
            }
            try {
                await appendToFlatFile(key, value, subFile, subRaw);
            }
            catch (e) {
                handleAppendError(e, key, subFile);
            }
            return;
        }
        if (isFlatTsFile(raw)) {
            try {
                await appendToFlatFile(key, value, absPath, raw);
            }
            catch (e) {
                handleAppendError(e, key, absPath);
            }
            return;
        }
        let obj;
        try {
            obj = await readTsFile(absPath);
        }
        catch (e) {
            vscode.window.showErrorMessage(`Fast I18n: 文件解析失败 ${absPath} — ${e.message}`);
            return;
        }
        await writeObjToTs(key, value, absPath, obj);
        return;
    }
    let obj;
    try {
        obj = await readJsonFile(absPath);
    }
    catch (e) {
        vscode.window.showErrorMessage(`Fast I18n: 文件解析失败 ${absPath} — ${e.message}`);
        return;
    }
    if (key in obj && obj[key] !== value) {
        const choice = await vscode.window.showWarningMessage(`Fast I18n: Key "${key}" 已存在（值: "${obj[key]}"），是否覆盖？`, '覆盖', '取消');
        if (choice !== '覆盖') {
            return;
        }
    }
    obj[key] = value;
    try {
        await writeJsonFile(absPath, obj);
    }
    catch (e) {
        vscode.window.showErrorMessage(`Fast I18n: 文件写入失败 ${absPath} — ${e.message}`);
    }
}
function isBarrelFile(content) {
    return /^\s*import\s+\w/m.test(content) &&
        /export\s+default\s*\{/.test(content);
}
function isFlatTsFile(content) {
    return !(/^\s*import\s+\w/m.test(content)) &&
        /export\s+default\s*\{/.test(content);
}
function parseBarrelImports(content, barrelAbsPath) {
    const dir = path.dirname(barrelAbsPath);
    const results = [];
    const re = /^\s*import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/gm;
    let m;
    while ((m = re.exec(content)) !== null) {
        const name = m[1];
        const rawPath = m[2];
        if (!rawPath.startsWith('.')) {
            continue;
        }
        const resolved = path.resolve(dir, rawPath);
        const absPath = fs.existsSync(resolved)
            ? resolved
            : fs.existsSync(resolved + '.ts')
                ? resolved + '.ts'
                : null;
        if (absPath) {
            results.push({ name, absPath });
        }
    }
    return results;
}
async function resolveSubFile(key, barrelAbsPath, content) {
    const imports = parseBarrelImports(content, barrelAbsPath);
    if (imports.length === 0) {
        vscode.window.showErrorMessage(`Fast I18n: 无法解析 ${path.basename(barrelAbsPath)} 的子文件列表，请手动写入`);
        return undefined;
    }
    const prefix = key.split('.')[0];
    const autoMatch = imports.find(i => i.name === prefix);
    if (autoMatch) {
        return autoMatch.absPath;
    }
    const items = imports.map(i => ({
        label: i.name,
        description: path.relative(path.dirname(barrelAbsPath), i.absPath),
        absPath: i.absPath,
    }));
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `选择写入 "${key}" 的子文件`,
    });
    return picked?.absPath;
}
function detectStyle(content) {
    const singleKeyCount = (content.match(/^\s*'[\w.]+'\s*:/gm) || []).length;
    const doubleKeyCount = (content.match(/^\s*"[\w.]+"\s*:/gm) || []).length;
    const keyQuote = singleKeyCount >= doubleKeyCount ? "'" : '"';
    const singleValCount = (content.match(/:\s*'[^']*'/g) || []).length;
    const doubleValCount = (content.match(/:\s*"[^"]*"/g) || []).length;
    const valueQuote = singleValCount >= doubleValCount ? "'" : '"';
    const indentMatch = content.match(/^(\s+)['"][\w.]+['"]\s*:/m);
    const indent = indentMatch ? indentMatch[1] : '  ';
    return { keyQuote, valueQuote, indent };
}
function quoteValue(s, q) {
    return q + s.replace(/\\/g, '\\\\').replace(new RegExp(q, 'g'), `\\${q}`) + q;
}
async function appendToFlatFile(key, value, absPath, content) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`["']${escapedKey}["']\\s*:`).test(content)) {
        throw new Error(`Key "${key}" 已存在于文件中，跳过写入`);
    }
    const exportStart = content.search(/export\s+default\s*\{/);
    if (exportStart === -1) {
        throw new Error('无法定位 export default {，请手动写入');
    }
    let depth = 0;
    let closingIdx = -1;
    for (let i = exportStart; i < content.length; i++) {
        if (content[i] === '{') {
            depth++;
        }
        else if (content[i] === '}') {
            depth--;
            if (depth === 0) {
                closingIdx = i;
                break;
            }
        }
    }
    if (closingIdx === -1) {
        throw new Error('无法定位 export default 结尾 }，请手动写入');
    }
    const style = detectStyle(content);
    const insertion = `${style.indent}${quoteValue(key, style.keyQuote)}: ${quoteValue(value, style.valueQuote)},\n`;
    const updated = content.slice(0, closingIdx) + insertion + content.slice(closingIdx);
    await fs.promises.writeFile(absPath, updated, 'utf-8');
}
function handleAppendError(e, key, absPath) {
    const msg = e.message;
    if (msg.startsWith(`Key "${key}" 已存在`)) {
        vscode.window.showWarningMessage(`Fast I18n: ${msg}`);
    }
    else {
        vscode.window.showErrorMessage(`Fast I18n: 文件写入失败 ${absPath} — ${msg}`);
    }
}
async function writeObjToTs(key, value, absPath, obj) {
    if (key in obj && obj[key] !== value) {
        const choice = await vscode.window.showWarningMessage(`Fast I18n: Key "${key}" 已存在（值: "${obj[key]}"），是否覆盖？`, '覆盖', '取消');
        if (choice !== '覆盖') {
            return;
        }
    }
    obj[key] = value;
    try {
        await writeTsFile(absPath, obj);
    }
    catch (e) {
        vscode.window.showErrorMessage(`Fast I18n: 文件写入失败 ${absPath} — ${e.message}`);
    }
}
async function readTsFile(absPath) {
    const content = await fs.promises.readFile(absPath, 'utf-8');
    const objMatch = content.match(/export\s+default\s*\{([\s\S]*)\}\s*;?\s*$/);
    if (!objMatch) {
        throw new Error('不是 `export default { ... }` 格式，无法解析');
    }
    const body = objMatch[1];
    const result = {};
    const lines = body.split('\n');
    for (const line of lines) {
        const lineMatch = line.match(/^\s*['"]?([\w.]+)['"]?\s*:\s*'((?:[^'\\]|\\.)*)'\s*,?\s*$/) || line.match(/^\s*['"]?([\w.]+)['"]?\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$/);
        if (lineMatch) {
            const rawValue = lineMatch[2];
            result[lineMatch[1]] = rawValue.replace(/\\(['"])/g, '$1');
        }
    }
    if (Object.keys(result).length === 0 && body.trim().length > 0) {
        throw new Error('对象解析失败: 无法提取键值对');
    }
    return result;
}
async function writeTsFile(absPath, obj) {
    const body = JSON.stringify(obj, null, 2);
    await fs.promises.writeFile(absPath, `export default ${body};\n`, 'utf-8');
}
async function readJsonFile(absPath) {
    const content = await fs.promises.readFile(absPath, 'utf-8');
    return JSON.parse(content);
}
async function writeJsonFile(absPath, obj) {
    await fs.promises.writeFile(absPath, JSON.stringify(obj, null, 2) + '\n', 'utf-8');
}
async function ensureEmptyFile(absPath, isTs) {
    await fs.promises.mkdir(path.dirname(absPath), { recursive: true });
    const empty = isTs ? 'export default {\n};\n' : '{}\n';
    await fs.promises.writeFile(absPath, empty, 'utf-8');
}
