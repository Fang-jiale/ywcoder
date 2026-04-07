<template>
  <div class="spinner" :data-permission-mode="permissionMode">
    <span class="icon" :style="{ fontSize: size + 'px' }">
      {{ currentIcon }}
    </span>
    <span class="text">{{ animatedText }}</span>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
  import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';

  interface Props {
    size?: number;
    permissionMode?: PermissionMode;
  }

  const props = withDefaults(defineProps<Props>(), {
    size: 16,
    permissionMode: undefined,
  });

  const SPINNER_ICONS = ['·', '✢', '*', '✶', '✻', '✽'];
  const ANIMATION_ICONS = [...SPINNER_ICONS, ...[...SPINNER_ICONS].reverse()];
  const VERBS = [
    '正在完成', '正在执行', '正在实现', '正在分析', '正在处理', '正在酝酿',
    '正在计算', '正在思考', '正在引导', '正在迭代', '正在编码', '正在优化',
    '正在思索', '正在运算', '正在组合', '正在调配', '正在考虑', '正在推理',
    '正在生成', '正在制作', '正在创造', '正在解析', '正在推断', '正在商议',
    '正在确定', '正在重排', '正在构建', '正在实现', '正在阐明', '正在设计',
    '正在构想', '正在谋划', '正在探索', '正在锻造', '正在形成', '正在演练',
    '正在编译', '正在整合', '正在孵化', '正在聚集', '正在核验', '正在构思',
    '正在想象', '正在培育', '正在预测', '正在显现', '正在提炼', '正在评估',
    '正在调试', '正在梳理', '正在研究', '正在召集', '正在总结', '正在筛选',
    '正在检索', '正在解析', '正在论证', '正在验证', '正在运行', '正在优化',
    '正在困惑', '正在编织', '正在反思', '正在策划', '正在编排', '正在调整',
    '正在合成', '正在构建', '正在探索', '正在旋转', '正在模拟', '正在确认',
    '正在集成', '正在思考', '正在修复', '正在转化', '正在展开', '正在解开',
    '正在感受', '正在漫游', '正在轰鸣', '正在摇摆', '正在工作', '正在驾驭'
  ];
  const MAX_VERB_LENGTH = Math.max(...VERBS.map(v => v.length));

  const iconIndex = ref(0);
  const verb = ref(randomVerb());
  const currentIcon = computed(() => ANIMATION_ICONS[iconIndex.value]);

  let iconTimer: any;
  let verbTimer: any;
  let rafId: number | null = null;

  // 文本动画状态
  const animatedText = ref(' '.repeat(MAX_VERB_LENGTH + 3));
  const animIndex = ref(0);
  const animTarget = ref(
    padTargetText(verb.value + '...', MAX_VERB_LENGTH + 3)
  );
  let lastTick = 0;
  const stepMs = 40;

  onMounted(() => {
    iconTimer = setInterval(() => {
      iconIndex.value = (iconIndex.value + 1) % ANIMATION_ICONS.length;
    }, 120);

    // 依次 2s/3s/5s，之后固定 5s 变更
    const intervals = [2000, 3000, 5000];
    let count = 0;
    const schedule = () => {
      verb.value = randomVerb();
      const next = count < intervals.length ? intervals[count++] : 5000;
      verbTimer = setTimeout(schedule, next);
    };
    verbTimer = setTimeout(schedule, intervals[0]);

    // 初次触发文本动画
    startTextAnimation(verb.value + '...');
  });

  onBeforeUnmount(() => {
    if (iconTimer) clearInterval(iconTimer);
    if (verbTimer) clearTimeout(verbTimer);
    stopTextAnimation();
  });

  function randomVerb(): string {
    return VERBS[Math.floor(Math.random() * VERBS.length)];
  }

  // 监听动词变化，重启文本动画
  watch(verb, v => {
    startTextAnimation(v + '...');
  });

  function padTargetText(text: string, width: number): string {
    return text.length >= width ? text : text + ' '.repeat(width - text.length);
  }

  function replaceAt(s: string, index: number, ch: string): string {
    if (index < 0 || index >= s.length) return s;
    return s.slice(0, index) + ch + s.slice(index + 1);
  }

  function randomChoice<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function transformChar(
    currentChar: string,
    targetChar: string,
    phase: number
  ): string {
    if (targetChar === ' ') return ' ';
    switch (phase) {
      case 3:
        return targetChar;
      case 2:
        return randomChoice(['.', '_', targetChar]);
      case 1:
        return randomChoice(['.', '_', targetChar]);
      case 0:
        return '▌';
      default:
        return currentChar;
    }
  }

  function startTextAnimation(text: string) {
    stopTextAnimation();
    animIndex.value = 0;
    lastTick = 0;
    const width = MAX_VERB_LENGTH + 3;
    animTarget.value = padTargetText(text, width);
    if (animatedText.value.length !== width) {
      animatedText.value = ' '.repeat(width);
    }

    const step = (ts: number) => {
      if (!lastTick) lastTick = ts;
      if (ts - lastTick < stepMs) {
        rafId = requestAnimationFrame(step);
        return;
      }
      lastTick = ts;

      const d = animIndex.value;
      // 完成条件：扫描位置超过 target 长度 + 3 个阶段
      if (d - 3 >= animTarget.value.length) {
        rafId = null;
        return;
      }

      animIndex.value++;
      const prev = animatedText.value;
      let nextStr = prev;
      for (let f = 0; f <= 3; f++) {
        const p = d - f;
        if (p >= 0 && p < animTarget.value.length) {
          nextStr = replaceAt(
            nextStr,
            p,
            transformChar(prev[p], animTarget.value[p], f)
          );
        }
      }
      animatedText.value = nextStr;

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
  }

  function stopTextAnimation() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  const permissionMode = computed(() => props.permissionMode);
  const size = computed(() => props.size);
</script>

<style scoped>
  .spinner {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    color: var(--app-primary-foreground, var(--vscode-foreground));
    padding-left: 24px;
  }
  .icon {
    color: var(--app-spinner-foreground, var(--vscode-descriptionForeground));
    font-family: monospace;
    display: inline-block;
    width: 1.5em;
    text-align: center;
  }
  .spinner[data-permission-mode='acceptEdits'] .icon {
    color: var(--app-primary-foreground, var(--vscode-foreground));
  }
  .spinner[data-permission-mode='plan'] .icon {
    color: var(--vscode-focusBorder, var(--app-button-background));
  }
  .text {
    font-weight: 500;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }
</style>
