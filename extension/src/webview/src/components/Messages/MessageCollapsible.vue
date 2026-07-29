<template>
  <div class="message-collapsible" :class="{ collapsed: isCollapsed }">
    <!-- 折叠态：只显示摘要行 -->
    <div v-if="isCollapsed" class="collapsed-summary" @click="toggle">
      <span class="codicon codicon-chevron-right" />
      <span class="summary-text">{{ summaryText }}</span>
      <span v-if="isStreaming" class="streaming-badge">生成中...</span>
    </div>

    <!-- 展开态：正常渲染消息内容 -->
    <template v-else>
      <div class="message-header" v-if="canCollapse">
        <button class="collapse-btn" title="折叠消息" @click="toggle">
          <span class="codicon codicon-chevron-down" />
        </button>
        <div class="message-actions">
          <button
            v-if="canRetry"
            class="action-btn retry-btn"
            title="重试"
            @click.stop="$emit('retry')"
          >
            <span class="codicon codicon-debug-restart" />
          </button>
          <button
            class="action-btn delete-btn"
            title="删除"
            @click.stop="$emit('delete')"
          >
            <span class="codicon codicon-trash" />
          </button>
        </div>
      </div>
      <slot />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Message } from '../../models/Message';

interface Props {
  message: Message;
  collapsed: boolean;
  busy: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'toggle'): void;
  (e: 'delete'): void;
  (e: 'retry'): void;
}>();

const isCollapsed = computed(() => props.collapsed && !props.busy && canCollapse.value);
const canCollapse = computed(() => props.message.type === 'user' || props.message.type === 'assistant');
const canRetry = computed(() => props.message.type === 'assistant');
const isStreaming = computed(() => props.busy && props.collapsed);

const summaryText = computed(() => {
  const type = props.message.type;
  if (type === 'user') {
    const text = extractUserText(props.message);
    return text.length > 50 ? text.slice(0, 50) + '...' : text || 'User';
  }
  if (type === 'assistant') {
    const stats = getAssistantStats(props.message);
    return `AI 回复 · ${stats}`;
  }
  return 'Message';
});

function extractUserText(message: Message): string {
  const content = message.message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    for (const wrapper of content) {
      const block = (wrapper as any).content ?? wrapper;
      if (block.type === 'text') {
        const text = (block as any).text || '';
        if (text) return text;
      }
    }
  }
  return '';
}

function getAssistantStats(message: Message): string {
  const content = message.message.content;
  if (typeof content === 'string') return '文本';
  if (!Array.isArray(content)) return '';

  let toolCount = 0;
  let textCount = 0;
  let otherCount = 0;

  for (const wrapper of content) {
    const block = (wrapper as any).content ?? wrapper;
    const type = block.type;
    if (type === 'tool_use') toolCount++;
    else if (type === 'text') textCount++;
    else otherCount++;
  }

  const parts: string[] = [];
  if (toolCount > 0) parts.push(`${toolCount} 个工具调用`);
  if (textCount > 0) parts.push(`${textCount} 段文本`);
  if (otherCount > 0) parts.push(`${otherCount} 个其他块`);

  return parts.join(' · ') || '空回复';
}

function toggle() {
  emit('toggle');
}
</script>

<style scoped>
.message-collapsible {
  position: relative;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.message-collapsible:hover .message-header {
  opacity: 1;
}

.collapse-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  border-radius: 3px;
}

.collapse-btn:hover {
  background-color: var(--vscode-toolbar-hoverBackground);
}

.message-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 2px 4px;
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  border-radius: 3px;
  cursor: pointer;
}

.action-btn:hover {
  background-color: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
}

.delete-btn:hover {
  color: var(--vscode-errorForeground);
}

.collapsed-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  margin: 4px 0;
  cursor: pointer;
  border-radius: 4px;
  color: var(--vscode-descriptionForeground);
  font-size: 13px;
  background-color: var(--vscode-editor-inactiveSelectionBackground, rgba(128, 128, 128, 0.1));
  transition: background-color 0.15s ease;
}

.collapsed-summary:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.collapsed-summary .codicon {
  font-size: 12px;
  opacity: 0.7;
}

.summary-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.streaming-badge {
  font-size: 11px;
  color: var(--vscode-charts-blue);
  font-style: italic;
}
</style>
