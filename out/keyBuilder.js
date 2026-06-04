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
exports.screamingSnakeToCamel = screamingSnakeToCamel;
exports.constantRefToI18nKey = constantRefToI18nKey;
exports.isConstantRef = isConstantRef;
exports.toScreamingSnakeCase = toScreamingSnakeCase;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
function buildKey(enText, filePath, workspaceRoot) {
    const stripDirs = vscode.workspace
        .getConfiguration('fast-i18n')
        .get('keyPrefixStrip', ['src', 'pages', 'components', 'views']);
    const prefix = inferPrefix(filePath, workspaceRoot, stripDirs);
    const suffix = toScreamingSnakeCase(enText);
    return prefix && suffix ? `${prefix}.${suffix}` : prefix || suffix;
}
function inferPrefix(filePath, workspaceRoot, stripDirs) {
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
/** SCREAMING_SNAKE → camelCase, e.g. QUERY_CUSTOMER_LIST → queryCustomerList */
function screamingSnakeToCamel(s) {
    return s.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
/**
 * Convert a dotted SCREAMING_SNAKE constant ref to a dotted camelCase i18n key.
 * e.g. BUSINESS_ERROR_CODE.QUERY_CUSTOMER_LIST → businessErrorCode.queryCustomerList
 */
function constantRefToI18nKey(ref) {
    return ref.split('.').map(screamingSnakeToCamel).join('.');
}
/** Returns true if text looks like a dotted SCREAMING_SNAKE constant reference */
function isConstantRef(text) {
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
function toScreamingSnakeCase(text) {
    const maxWords = vscode.workspace
        .getConfiguration('fast-i18n')
        .get('keyMaxWords', 5);
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
