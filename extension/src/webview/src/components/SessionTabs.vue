<script setup lang="ts">
import type { Session } from '../core/Session';
import SessionTabItem from './SessionTabItem.vue';

const props = defineProps<{
  sessions: Session[];
  activeSession?: Session;
}>();

const emit = defineEmits<{
  switchSession: [session: Session];
  createSession: [];
  closeSession: [session: Session];
}>();

function isActive(session: Session): boolean {
  return props.activeSession === session;
}
</script>

<template>
  <div class="session-tabs">
    <SessionTabItem
      v-for="(session, index) in sessions"
      :key="session.sessionId() ?? index"
      :session="session"
      :active="isActive(session)"
      @click="emit('switchSession', session)"
      @close="emit('closeSession', session)"
    />
    <button
      class="new-session-btn"
      title="新开对话"
      @click="emit('createSession')"
    >
      <span class="codicon codicon-plus" />
    </button>
  </div>
</template>

<style scoped>
.session-tabs {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--vscode-panel-border);
  background: var(--vscode-editor-background);
  overflow-x: auto;
  scrollbar-width: thin;
}

.session-tabs::-webkit-scrollbar {
  height: 4px;
}

.new-session-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.new-session-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-editor-foreground);
}

.new-session-btn .codicon {
  font-size: 12px;
}
</style>
