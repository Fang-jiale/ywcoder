<template>
  <div class="sessions-page">
    <div class="page-header">
      <div class="header-left">
        <button class="back-btn" @click="$emit('switchToChat')">
          <span class="codicon codicon-arrow-left"></span>
        </button>
        <h2 class="page-title">会话</h2>
      </div>
      <div class="header-center">
      </div>
      <div class="header-right">
        <button class="icon-btn" @click="toggleSearch" :class="{ active: showSearch }">
          <span class="codicon codicon-search"></span>
        </button>
        <button class="icon-btn" @click="createNewSession">
          <span class="codicon codicon-add"></span>
        </button>
      </div>
    </div>

    <!-- 搜索栏 - 只在需要时显示 -->
    <Motion
      v-if="showSearch"
      class="search-bar"
      :initial="{ opacity: 0, y: -20 }"
      :animate="{ opacity: 1, y: 0 }"
      :exit="{ opacity: 0, y: -20 }"
      :transition="{ duration: 0.2, ease: 'easeOut' }"
    >
      <input
        ref="searchInput"
        v-model="searchQuery"
        type="text"
        placeholder="搜索智能体/会话"
        class="search-input"
        @keydown.escape="hideSearch"
      >
    </Motion>

    <div class="page-content custom-scroll-container">
      <!-- 加载状态 -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>加载会话历史中...</p>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="error" class="error-state">
        <p class="error-message">{{ error }}</p>
        <button class="btn-primary" @click="refreshSessions">重试</button>
      </div>

      <!-- 空状态 -->
      <div v-else-if="sessionList.length === 0" class="empty-state">
        <div class="empty-icon">
          <Icon icon="comment-discussion" :size="48" />
        </div>
        <h3>暂无历史会话</h3>
        <p class="empty-hint">开始与 YwCoder 对话后，会话历史将出现在这里</p>
        <button class="btn-primary" @click="startNewChat">开始新对话</button>
      </div>

      <!-- 会话列表 -->
      <div v-else class="sessions-container">
        <div
          v-for="(session, index) in filteredSessions"
          :key="session.sessionId.value || `temp-${index}`"
          class="session-card"
          @click="openSession(session)"
        >
            <div class="session-card-header">
              <h3 class="session-title">{{ session.summary.value || '新会话' }}</h3>
              <div class="session-date">{{ formatRelativeTime(session.lastModifiedTime.value) }}</div>
            </div>

            <div class="session-meta">
              <span class="session-messages">{{ session.messageCount.value }} 条消息</span>
              <span v-if="session.sessionId.value" class="session-id">{{ session.sessionId.value }}</span>
            </div>

        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, inject } from 'vue';
import { Motion } from 'motion-v';
import Icon from '../components/Icon.vue';
import { RuntimeKey } from '../composables/runtimeContext';
import { useSessionStore } from '../composables/useSessionStore';
import { useSession } from '../composables/useSession';
import type { Session } from '../core/Session';

// 注入运行时
const runtime = inject(RuntimeKey);
if (!runtime) {
  throw new Error('[SessionsPage] runtime not provided');
}

// 🔥 使用 useSessionStore 包装为 Vue-friendly API
const store = useSessionStore(runtime.sessionStore);

// 🔥 视图模型：将 alien-signals Session 转换为 Vue-friendly 包装
const sessionList = computed(() => {
  const rawSessions = (store.sessionsByLastModified.value || []).filter(Boolean) as Session[];
  return rawSessions.map(raw => useSession(raw));
});

// 定义事件
const emit = defineEmits<{
  switchToChat: [sessionId?: string];
}>();

// 组件状态
const loading = ref(true);
const error = ref('');
const searchQuery = ref('');
const showSearch = ref(false);
const searchInput = ref<HTMLInputElement | null>(null);


// 计算属性：过滤和排序会话列表
const filteredSessions = computed(() => {
  let sessions = [...sessionList.value];

  // 搜索过滤
  const query = searchQuery.value.trim().toLowerCase();
  if (query) {
    sessions = sessions.filter(session => {
      const summary = (session.summary.value || '').toLowerCase();
      const sessionId = (session.sessionId.value || '').toLowerCase();
      return summary.includes(query) || sessionId.includes(query);
    });
  }

  // 已经通过 sessionsByLastModified 按时间倒序排序，无需再排序
  return sessions;
});

// 方法
const refreshSessions = async () => {
  loading.value = true;
  error.value = '';

  try {
    // 🔥 使用包装后的方法
    await store.listSessions();
  } catch (err) {
    error.value = `加载会话失败: ${err}`;
  } finally {
    loading.value = false;
  }
};


const openSession = (wrappedSession: ReturnType<typeof useSession> | undefined) => {
  if (!wrappedSession) return;
  // 🔥 从包装对象中获取原始 Session 实例
  const rawSession = wrappedSession.__session;
  store.setActiveSession(rawSession);
  emit('switchToChat', wrappedSession.sessionId.value);
};


const createNewSession = async () => {
  // 🔥 使用包装后的方法（返回原始 Session）
  const rawSession = await store.createSession({ isExplicit: true });
  store.setActiveSession(rawSession);
  // 🔥 访问 alien-signals 需要函数调用
  emit('switchToChat', rawSession.sessionId());
};

const startNewChat = () => {
  emit('switchToChat');
};

// 搜索功能
const toggleSearch = async () => {
  showSearch.value = !showSearch.value;
  if (showSearch.value) {
    await nextTick();
    searchInput.value?.focus();
  } else {
    searchQuery.value = '';
  }
};

const hideSearch = () => {
  showSearch.value = false;
  searchQuery.value = '';
};

// 格式化相对时间
function formatRelativeTime(input?: number | string | Date): string {
  if (input === undefined || input === null) return '刚刚';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '刚刚';

  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}分钟前`;
  if (diff < 86_400_000) return `${Math.max(1, Math.round(diff / 3_600_000))}小时前`;
  const days = Math.max(1, Math.round(diff / 86_400_000));
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString('zh-CN');
}

// 生命周期
onMounted(() => {
  refreshSessions();
});
</script>

<style scoped>
.sessions-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  /* background: var(--vscode-editor-background); */
  color: var(--vscode-editor-foreground);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--vscode-panel-border);
  min-height: 32px;
  padding: 0 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-center {
  display: flex;
  align-items: center;
  flex: 1;
  justify-content: center;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--vscode-titleBar-activeForeground);
  border-radius: 3px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.back-btn .codicon {
  font-size: 12px;
}

.back-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
}

.page-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--vscode-titleBar-activeForeground);
}

.header-right {
  display: flex;
  gap: 4px;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--vscode-titleBar-activeForeground);
  border-radius: 3px;
  cursor: pointer;
  transition: background-color 0.2s;
  opacity: 0.7;
}

.icon-btn .codicon {
  font-size: 12px;
}

.icon-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
  opacity: 1;
}

.icon-btn.active {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  opacity: 1;
}

.search-bar {
  border-bottom: 1px solid var(--vscode-panel-border);
  background: var(--vscode-sideBar-background);
}

.search-bar .search-input {
  width: 100%;
  padding: 2px 8px;
  border: 1px solid var(--vscode-input-border);
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border-radius: 4px;
  font-size: 14px;
  outline: none;
}

.search-bar .search-input:focus {
  border-color: var(--vscode-focusBorder);
}

.btn-primary, .btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: baseline;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.2s;
}

.btn-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.btn-primary:hover {
  background: var(--vscode-button-hoverBackground);
}

.btn-secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

.btn-secondary:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.page-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.loading-state, .error-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
  flex: 1;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--vscode-progressBar-background);
  border-top: 2px solid var(--vscode-progressBar-activeForeground);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-message {
  color: var(--vscode-errorForeground);
  margin-bottom: 16px;
}

.empty-state {
  gap: 16px;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.6;
}

.empty-icon .codicon {
  font-size: 48px;
}

.empty-state h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
}

.empty-hint {
  color: var(--vscode-descriptionForeground);
  font-size: 14px;
  margin: 0;
}

.sessions-container {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.session-card {
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  padding: 6px 12px;
  background: var(--vscode-editor-background);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 80px;
  gap: 8px;
}

.session-card:hover {
  border-color: var(--vscode-focusBorder);
  background: var(--vscode-list-hoverBackground);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.session-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.session-title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  flex: 1;
  /* 限制标题长度，避免溢出 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-date {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  white-space: nowrap;
}

.session-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
}

.session-id {
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 10px;
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

</style>
