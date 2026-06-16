/**
 * 根据模型 value 推断上下文窗口大小（单位：token）。
 *
 * 当前 YwCoder 依赖的 CLI 模型列表默认不返回 contextWindow，
 * 但前端需要根据所选模型动态调整 usage 进度条，因此由 extension
 * 侧在返回模型列表前补齐该字段。若未来 CLI 原生返回 contextWindow，
 * 可直接使用其值，无需再推断。
 */

export function inferContextWindow(modelValue: string | null | undefined): number | undefined {
    if (modelValue === null || modelValue === undefined || modelValue === 'default') {
        return 200000;
    }

    const value = String(modelValue);

    // 1M context variants（例如 sonnet[1m]、opus[1m]、claude-sonnet-4-6[1m]）
    if (value.endsWith('[1m]') || value.endsWith('[1m')) {
        return 1000000;
    }

    // 标准 200k 上下文窗口的已知模型别名/ID
    const standard200k = [
        'sonnet',
        'opus',
        'haiku',
        'opusplan',
        'claude-sonnet-4-6',
        'claude-sonnet-4-5',
        'claude-opus-4',
        'claude-opus-4-1',
        'claude-haiku-4-5',
        'claude-haiku-3-5',
        'claude-3-7-sonnet',
        'claude-3-5-sonnet',
        'claude-3-5-haiku',
        'claude-3-opus',
    ];
    if (standard200k.some((prefix) => value === prefix || value.startsWith(prefix + '-') || value.startsWith(prefix + '@'))) {
        return 200000;
    }

    // 未知/自定义模型保持 undefined，由前端回退到 200k
    return undefined;
}

interface ModelLike {
    value?: string | null;
    contextWindow?: number;
    [key: string]: unknown;
}

export function augmentModelsWithContextWindow(models: ModelLike[]): ModelLike[] {
    if (!Array.isArray(models)) {
        return [];
    }
    return models.map((m) => {
        if (!m || typeof m !== 'object') {
            return m;
        }
        if (typeof m.contextWindow === 'number' && m.contextWindow > 0) {
            return m;
        }
        const inferred = inferContextWindow(m.value);
        return inferred !== undefined ? { ...m, contextWindow: inferred } : m;
    });
}
