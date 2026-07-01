<script setup lang="ts">
import { useSession } from '../composables/useSession';
import type { Session } from '../core/Session';

const props = defineProps<{
  session: Session;
  active: boolean;
}>();

const emit = defineEmits<{
  click: [];
  close: [];
}>();

const wrapped = useSession(props.session);
</script>

<template>
  <div
    class="session-tab"
    :class="{ active, busy: wrapped.busy.value }"
    @click="emit('click')"
  >
    <span class="tab-title">{{ wrapped.summary.value || '新会话' }}</span>
    <span
      v-if="wrapped.busy.value"
      class="tab-busy codicon codicon-loading codicon-modifier-spin"
    />
    <button
      class="tab-close"
      title="关闭会话"
      @click.stop="emit('close')"
    >
      <span class="codicon codicon-close" />
    </button>
  </div>
</template>

<style scoped>
.session-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 160px;
  min-width: 60px;
  padding: 4px 8px;
  border-right: 1px solid var(--vscode-panel-border);
  background: var(--vscode-editor-background);
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  user-select: none;
}

.session-tab:hover {
  background: var(--vscode-list-hoverBackground);
}

.session-tab.active {
  background: var(--vscode-sideBar-background);
  color: var(--vscode-editor-foreground);
}

.tab-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-busy {
  font-size: 10px;
  opacity: 0.8;
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border: none;
  background: transparent;
  color: inherit;
  border-radius: 2px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, background-color 0.15s ease;
}

.session-tab:hover .tab-close,
.session-tab.active .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-errorForeground);
}

.tab-close .codicon {
  font-size: 10px;
}
</style>
