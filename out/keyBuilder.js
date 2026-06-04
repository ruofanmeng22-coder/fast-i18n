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
exports.buildKey = buildKey;
exports.toScreamingSnakeCase = toScreamingSnakeCase;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
function buildKey(enText, filePath, workspaceRoot) {
    const prefix = inferPrefix(filePath, workspaceRoot);
    const suffix = toScreamingSnakeCase(enText);
    return prefix ? `${prefix}.${suffix}` : suffix;
}
function inferPrefix(filePath, workspaceRoot) {
    const stripDirs = vscode.workspace
        .getConfiguration('fast-i18n')
        .get('keyPrefixStrip', ['src', 'pages', 'components', 'views']);
    // 转相对路径，统一用 /
    const rel = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
    const parts = rel.split('/');
    // 去掉文件名
    const dirs = parts.slice(0, -1);
    // 剥离顶层 strip 段（只剥一次匹配到的最长前缀）
    const filtered = [];
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
function toScreamingSnakeCase(text) {
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
