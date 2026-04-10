<template>
  <SettingsTab title="环境变量">
    <SettingsSection title="环境变量">
      <SettingsSubSection caption="启动时传递给 YW Coder 的自定义环境变量。其他标签页管理的环境变量（模型、网络、沙盒等）在此不显示。">
        <!-- 表头 -->
        <SettingsCell>
          <template #label>
            <div class="env-table-header">
              <span class="env-col-key">变量名</span>
              <span class="env-col-value">值</span>
              <span class="env-col-actions"></span>
            </div>
          </template>
        </SettingsCell>

        <!-- 作用域级别的条目（可编辑） -->
        <SettingsCell
          v-for="entry in scopeEntries"
          :key="'scope-' + entry.key"
          :divider="true"
        >
          <template #label>
            <div class="env-row">
              <!-- 键显示 -->
              <div class="env-col-key">
                <span class="env-key-text">{{ entry.key }}</span>
                <Tooltip v-if="isOverriddenByHigherScope(entry.key)" :content="`被 ${overriddenByLabel(entry.key)} 作用域覆盖`">
                  <Badge variant="warning">已覆盖</Badge>
                </Tooltip>
              </div>

              <!-- 值显示/编辑 -->
              <div class="env-col-value">
                <template v-if="editingKey === entry.key">
                  <TextInput
                    ref="editValueInputRef"
                    :model-value="editValue"
                    @update:model-value="editValue = $event"
                    monospace
                    size="small"
                    class="env-value-input"
                    placeholder="值"
                    @keydown.enter.prevent="commitEdit(entry.key)"
                    @keydown.escape.prevent="cancelEdit"
                  />
                </template>
                <template v-else>
                  <span
                    class="env-value-text"
                    :title="entry.value"
                    @dblclick="startEdit(entry.key, entry.value)"
                  >
                    {{ entry.value }}
                  </span>
                </template>
              </div>

              <!-- 操作 -->
              <div class="env-col-actions">
                <template v-if="editingKey === entry.key">
                  <Tooltip content="保存">
                    <button class="env-action-btn" @click="commitEdit(entry.key)">
                      <span class="codicon codicon-check" />
                    </button>
                  </Tooltip>
                  <Tooltip content="取消">
                    <button class="env-action-btn" @click="cancelEdit">
                      <span class="codicon codicon-close" />
                    </button>
                  </Tooltip>
                </template>
                <template v-else>
                  <Tooltip content="编辑值">
                    <button class="env-action-btn" @click="startEdit(entry.key, entry.value)">
                      <span class="codicon codicon-edit" />
                    </button>
                  </Tooltip>
                  <Tooltip content="从此作用域移除">
                    <button class="env-action-btn env-action-btn-danger" @click="removeEnvVar(entry.key)">
                      <span class="codicon codicon-trash" />
                    </button>
                  </Tooltip>
                </template>
              </div>
            </div>
          </template>
        </SettingsCell>

        <!-- 继承的条目（只读，可覆盖） -->
        <SettingsCell
          v-for="entry in inheritedEntries"
          :key="'inherited-' + entry.key"
          :divider="true"
          class="env-inherited-cell"
        >
          <template #label>
            <div class="env-row env-row-inherited">
              <div class="env-col-key">
                <span class="env-key-text">{{ entry.key }}</span>
                <Tooltip content="继承自低优先级作用域">
                  <Badge variant="subtle">已继承</Badge>
                </Tooltip>
              </div>
              <div class="env-col-value">
                <span class="env-value-text env-value-inherited" :title="entry.value">
                  {{ entry.value }}
                </span>
              </div>
              <div class="env-col-actions">
                <Tooltip content="在此作用域覆盖">
                  <button class="env-action-btn" @click="overrideEnvVar(entry.key, entry.value)">
                    <span class="codicon codicon-arrow-up" />
                  </button>
                </Tooltip>
              </div>
            </div>
          </template>
        </SettingsCell>

        <!-- 空状态 -->
        <SettingsCell
          v-if="scopeEntries.length === 0 && inheritedEntries.length === 0"
          :divider="true"
        >
          <template #label>
            <span class="env-empty-text">未设置环境变量。</span>
          </template>
        </SettingsCell>

        <!-- 添加新变量行 -->
        <SettingsCell :divider="true">
          <template #label>
            <div class="env-row">
              <!-- 键：组合框自动完成 -->
              <div class="env-col-key">
                <ComboboxRoot
                  v-model="newKeySelected"
                  v-model:open="comboboxOpen"
                  :ignore-filter="true"
                  class="env-combobox-root"
                  @update:model-value="onComboboxSelect"
                >
                  <ComboboxAnchor class="env-combobox-anchor">
                    <ComboboxInput
                      v-model="newKeySearch"
                      class="env-combobox-input"
                      placeholder="变量名"
                      @keydown.enter.prevent="handleKeyEnter"
                      @keydown.tab.prevent="focusNewValue"
                    />
                    <ComboboxTrigger class="env-combobox-trigger">
                      <span class="codicon codicon-chevron-down" />
                    </ComboboxTrigger>
                  </ComboboxAnchor>

                  <ComboboxPortal>
                    <ComboboxContent
                      class="env-combobox-content"
                      position="popper"
                      :side-offset="4"
                      side="bottom"
                      align="start"
                    >
                      <ComboboxViewport class="env-combobox-viewport">
                        <ComboboxItem
                          v-for="suggestion in filteredSuggestions"
                          :key="suggestion.key"
                          :value="suggestion.key"
                          class="env-combobox-item"
                        >
                          <div class="env-suggestion-row">
                            <span class="env-suggestion-key">{{ suggestion.key }}</span>
                            <span v-if="suggestion.description" class="env-suggestion-desc">{{ suggestion.description }}</span>
                          </div>
                        </ComboboxItem>
                        <ComboboxEmpty class="env-combobox-empty">
                          <span v-if="newKeySearch.trim()">按回车使用 "{{ newKeySearch.trim() }}"</span>
                          <span v-else>输入以搜索已知变量...</span>
                        </ComboboxEmpty>
                      </ComboboxViewport>
                    </ComboboxContent>
                  </ComboboxPortal>
                </ComboboxRoot>
              </div>

              <!-- 值 -->
              <div class="env-col-value">
                <TextInput
                  ref="newValueInputRef"
                  v-model="newValue"
                  monospace
                  size="small"
                  class="env-value-input"
                  placeholder="值"
                  @keydown.enter.prevent="addEnvVar"
                />
              </div>

              <!-- 操作 -->
              <div class="env-col-actions">
                <Tooltip content="添加变量">
                  <button
                    class="env-action-btn env-action-btn-add"
                    :disabled="!newKeySearch.trim()"
                    @click="addEnvVar"
                  >
                    <span class="codicon codicon-add" />
                  </button>
                </Tooltip>
              </div>
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- 重置所有按钮 -->
    <div v-if="hasScopeEntries" class="env-reset-section">
      <Button variant="tertiary" size="small" @click="resetAllEnvVars">
        <span class="codicon codicon-discard" />
        重置此作用域的所有环境变量
      </Button>
    </div>
  </SettingsTab>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import {
  ComboboxRoot,
  ComboboxAnchor,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxPortal,
  ComboboxContent,
  ComboboxViewport,
  ComboboxItem,
  ComboboxEmpty,
} from 'reka-ui'
import SettingsTab from '../SettingsTab.vue'
import SettingsSection from '../SettingsSection.vue'
import SettingsSubSection from '../SettingsSubSection.vue'
import SettingsCell from '../SettingsCell.vue'
import Badge from '../../Common/Badge.vue'
import Button from '../../Common/Button.vue'
import TextInput from '../../Common/TextInput.vue'
import Tooltip from '../../Common/Tooltip.vue'
import { useSettingsStore } from '../../../composables/useSettingsStore'
import { useSettingsScope } from '../../../composables/useSettingsScope'

const { settings, activeProfile, inspect, updateSetting, resetSetting } = useSettingsStore()
const scope = useSettingsScope()

// ── 已被占用的环境变量键（由其他标签页管理） ──

const CLAIMED_ENV_KEYS = new Set([
  // 模型标签页
  'ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL', 'CLAUDE_CODE_EFFORT_LEVEL',
  'MAX_THINKING_TOKENS', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS',
  // 网络标签页
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'CLAUDE_CODE_CLIENT_CERT',
  'CLAUDE_CODE_CLIENT_KEY', 'CLAUDE_CODE_CLIENT_KEY_PASSPHRASE', 'CLAUDE_CODE_PROXY_RESOLVES_HOSTS',
  'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_SKIP_BEDROCK_AUTH', 'AWS_BEARER_TOKEN_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_SKIP_VERTEX_AUTH',
  'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_SKIP_FOUNDRY_AUTH',
  'ANTHROPIC_FOUNDRY_API_KEY', 'ANTHROPIC_FOUNDRY_BASE_URL', 'ANTHROPIC_FOUNDRY_RESOURCE',
  // 沙盒标签页
  'CLAUDE_CODE_SHELL', 'CLAUDE_CODE_SHELL_PREFIX', 'CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR',
  'BASH_DEFAULT_TIMEOUT_MS', 'BASH_MAX_TIMEOUT_MS', 'BASH_MAX_OUTPUT_LENGTH',
  // MCP 标签页（保留）
  'MCP_TIMEOUT', 'MCP_TOOL_TIMEOUT', 'MCP_CLIENT_SECRET',
  'MCP_OAUTH_CALLBACK_PORT', 'MAX_MCP_OUTPUT_TOKENS', 'ENABLE_TOOL_SEARCH',
])

// ── 已知的环境变量建议（此标签页可用的未占用变量） ──

interface EnvSuggestion {
  key: string
  description: string
}

const KNOWN_ENV_VARS: EnvSuggestion[] = [
  // 端点配置（用于 OpenAI 兼容的内部大模型）
  { key: 'ANTHROPIC_BASE_URL', description: 'API 基础 URL（用于内部 OpenAI 兼容端点，如 http://localhost:1234/v1）' },
  { key: 'ANTHROPIC_AUTH_TOKEN', description: 'API 认证令牌（用于内部 OpenAI 兼容端点）' },
  // 认证
  { key: 'ANTHROPIC_API_KEY', description: 'API 密钥，用于认证服务' },
  { key: 'ANTHROPIC_CUSTOM_HEADERS', description: 'API 请求的自定义 HTTP 头' },
  // 遥测与报告
  { key: 'CLAUDE_CODE_ENABLE_TELEMETRY', description: '启用 OpenTelemetry' },
  { key: 'DISABLE_TELEMETRY', description: '禁用 Statsig 遥测' },
  { key: 'DISABLE_ERROR_REPORTING', description: '禁用 Sentry 错误报告' },
  { key: 'CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY', description: '禁用会话质量调查' },
  { key: 'DISABLE_COST_WARNINGS', description: '禁用成本警告' },
  { key: 'OTEL_METRICS_EXPORTER', description: 'OTel 指标导出器' },
  // 功能
  { key: 'CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION', description: '启用提示建议' },
  { key: 'CLAUDE_CODE_ENABLE_TASKS', description: '启用任务列表功能' },
  { key: 'CLAUDE_CODE_DISABLE_AUTO_MEMORY', description: '禁用自动记忆' },
  { key: 'CLAUDE_CODE_DISABLE_BACKGROUND_TASKS', description: '禁用后台任务' },
  { key: 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', description: '禁用所有非必要流量' },
  { key: 'DISABLE_AUTOUPDATER', description: '禁用自动更新' },
  { key: 'DISABLE_PROMPT_CACHING', description: '禁用所有提示缓存' },
  { key: 'DISABLE_PROMPT_CACHING_HAIKU', description: '禁用 Haiku 提示缓存' },
  { key: 'DISABLE_PROMPT_CACHING_SONNET', description: '禁用 Sonnet 提示缓存' },
  { key: 'DISABLE_PROMPT_CACHING_OPUS', description: '禁用 Opus 提示缓存' },
  { key: 'DISABLE_NON_ESSENTIAL_MODEL_CALLS', description: '禁用非必要模型调用' },
  // UI / 显示
  { key: 'CLAUDE_CODE_HIDE_ACCOUNT_INFO', description: '隐藏账户信息显示' },
  { key: 'CLAUDE_CODE_DISABLE_TERMINAL_TITLE', description: '禁用终端标题更新' },
  // 执行
  { key: 'CLAUDE_CODE_EXIT_AFTER_STOP_DELAY', description: '停止后退出前的延迟（毫秒）' },
  { key: 'CLAUDE_CODE_TASK_LIST_ID', description: '自定义任务列表 ID' },
  { key: 'CLAUDE_CODE_TEAM_NAME', description: '归属团队名称' },
  { key: 'CLAUDE_CODE_API_KEY_HELPER_TTL_MS', description: 'API 密钥助手缓存的 TTL（毫秒）' },
  { key: 'CLAUDE_CODE_AUTOCOMPACT_PCT_OVERRIDE', description: '覆盖自动压缩阈值（%）' },
  // 文件与存储
  { key: 'CLAUDE_CONFIG_DIR', description: '自定义配置/数据目录' },
  { key: 'CLAUDE_CODE_TMPDIR', description: '覆盖临时目录' },
  // 工具
  { key: 'USE_BUILTIN_RIPGREP', description: '使用捆绑的 ripgrep 二进制文件' },
  // Vertex 区域覆盖
  { key: 'VERTEX_REGION', description: '默认 Vertex AI 区域' },
  { key: 'VERTEX_REGION_CLAUDE_3_5_SONNET', description: 'Sonnet 3.5 的 Vertex 区域' },
  { key: 'VERTEX_REGION_CLAUDE_3_5_HAIKU', description: 'Haiku 3.5 的 Vertex 区域' }
]

// ── 作用域感知响应式数据 ──

// 跨所有作用域的有效环境变量（合并结果）
const effectiveEnv = computed<Record<string, string>>(() => {
  const val = settings.value.env
  return (val && typeof val === 'object' ? val : {}) as Record<string, string>
})

// 仅当前编辑作用域级别的环境变量。
// 当配置文件激活并查看用户作用域时，我们编辑配置文件层（values.profile）
// 而不是全局层（values.global = settings.json，基础层）。
const scopeEnv = computed<Record<string, string>>(() => {
  // 访问 settings.value 以建立 Vue 响应式追踪
  // （inspect() 直接读取 alien-signals，Vue 无法追踪）
  void settings.value
  const meta = inspect('env')
  const values = meta?.values || {}
  if (activeProfile.value && scope.value === 'global') {
    return (values.profile as Record<string, string>) || {}
  }
  return (values[scope.value] as Record<string, string>) || {}
})

// ── 计算条目列表 ──

interface EnvEntry {
  key: string
  value: string
}

// 在当前作用域定义的条目（可编辑）
const scopeEntries = computed<EnvEntry[]>(() => {
  const env = scopeEnv.value
  return Object.keys(env)
    .filter(k => !CLAIMED_ENV_KEYS.has(k))
    .sort()
    .map(k => ({ key: k, value: env[k] }))
})

// 从其他作用域继承的条目（只读，可覆盖）
const inheritedEntries = computed<EnvEntry[]>(() => {
  const effective = effectiveEnv.value
  const local = scopeEnv.value
  return Object.keys(effective)
    .filter(k => !CLAIMED_ENV_KEYS.has(k) && !(k in local))
    .sort()
    .map(k => ({ key: k, value: effective[k] }))
})

const hasScopeEntries = computed(() => scopeEntries.value.length > 0)

// 已在所有作用域设置的键（从建议中排除）
const allSetKeys = computed(() => {
  const keys = new Set<string>()
  for (const k of Object.keys(effectiveEnv.value)) keys.add(k)
  return keys
})

// ── 组合框自动完成 ──

const newKeySearch = ref('')
const newKeySelected = ref<string>('')
const comboboxOpen = ref(false)

const filteredSuggestions = computed<EnvSuggestion[]>(() => {
  const query = newKeySearch.value.trim().toUpperCase()
  return KNOWN_ENV_VARS.filter(s => {
    // 排除已设置的键
    if (allSetKeys.value.has(s.key)) return false
    // 按查询匹配
    if (!query) return true
    return s.key.includes(query) || s.description.toUpperCase().includes(query)
  })
})

function onComboboxSelect(value: string) {
  if (value) {
    newKeySearch.value = value
    comboboxOpen.value = false
    nextTick(() => focusNewValue())
  }
}

function handleKeyEnter() {
  // 如果下拉菜单有高亮项，让组合框处理它。
  // 否则，视为直接输入并移动到值字段。
  if (!comboboxOpen.value || filteredSuggestions.value.length === 0) {
    focusNewValue()
  }
}

// ── 覆盖检测 ──

const SCOPE_MAP: Record<string, string> = {
  global: '用户',
  shared: '工作区',
  local: '本地',
}

function isOverriddenByHigherScope(key: string): boolean {
  void settings.value
  const meta = inspect('env')
  const values = meta?.values || {}

  if (scope.value === 'global') {
    const localEnv = (values.local as Record<string, string>) || {}
    const sharedEnv = (values.shared as Record<string, string>) || {}
    if (key in localEnv) return true
    if (key in sharedEnv) return true
  } else if (scope.value === 'shared') {
    const localEnv = (values.local as Record<string, string>) || {}
    if (key in localEnv) return true
  }
  return false
}

function overriddenByLabel(key: string): string {
  void settings.value
  const meta = inspect('env')
  const values = meta?.values || {}

  if (scope.value === 'global') {
    const localEnv = (values.local as Record<string, string>) || {}
    if (key in localEnv) return SCOPE_MAP.local
    const sharedEnv = (values.shared as Record<string, string>) || {}
    if (key in sharedEnv) return SCOPE_MAP.shared
  } else if (scope.value === 'shared') {
    const localEnv = (values.local as Record<string, string>) || {}
    if (key in localEnv) return SCOPE_MAP.local
  }
  return ''
}

// ── CRUD 操作（读-改-写） ──

const newValue = ref('')
const newValueInputRef = ref<InstanceType<typeof TextInput> | null>(null)

function focusNewValue() {
  nextTick(() => {
    if (newValueInputRef.value?.inputRef) {
      newValueInputRef.value.inputRef.focus()
    }
  })
}

function addEnvVar() {
  const key = newKeySearch.value.trim()
  if (!key) return
  const value = newValue.value

  const currentEnv = { ...scopeEnv.value }
  currentEnv[key] = value
  updateSetting('env', currentEnv, scope.value)

  newKeySearch.value = ''
  newKeySelected.value = ''
  newValue.value = ''
}

function removeEnvVar(key: string) {
  const currentEnv = { ...scopeEnv.value }
  delete currentEnv[key]
  updateSetting('env', currentEnv, scope.value)
}

function overrideEnvVar(key: string, value: string) {
  const currentEnv = { ...scopeEnv.value }
  currentEnv[key] = value
  updateSetting('env', currentEnv, scope.value)
}

function resetAllEnvVars() {
  resetSetting('env', scope.value)
}

// ── 行内编辑 ──

const editingKey = ref<string | null>(null)
const editValue = ref('')
const editValueInputRef = ref<InstanceType<typeof TextInput> | null>(null)

function startEdit(key: string, currentValue: string) {
  editingKey.value = key
  editValue.value = currentValue
  nextTick(() => {
    if (editValueInputRef.value?.inputRef) {
      editValueInputRef.value.inputRef.focus()
      editValueInputRef.value.inputRef.select()
    }
  })
}

function commitEdit(key: string) {
  const currentEnv = { ...scopeEnv.value }
  currentEnv[key] = editValue.value
  updateSetting('env', currentEnv, scope.value)
  editingKey.value = null
  editValue.value = ''
}

function cancelEdit() {
  editingKey.value = null
  editValue.value = ''
}
</script>

<style scoped>
/* ── 表格布局（名称 2:1 值） ── */

.env-table-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  font-size: 11px;
  font-weight: 500;
  color: var(--cursor-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  user-select: none;
}

.env-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  min-height: 24px;
}

.env-col-key {
  width: 0;
  flex-grow: 2;
  flex-shrink: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.env-col-value {
  width: 0;
  flex-grow: 1;
  flex-shrink: 1;
  min-width: 0;
}

.env-col-actions {
  width: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}

/* ── 键/值文本 ── */

.env-key-text {
  font-family: var(--vscode-editor-font-family), monospace;
  font-size: 12px;
  color: var(--cursor-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.env-value-text {
  font-family: var(--vscode-editor-font-family), monospace;
  font-size: 12px;
  color: var(--cursor-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  cursor: default;
  padding: 2px 4px;
  border-radius: 3px;
  transition: background-color 0.15s;
}

.env-value-text:hover {
  background-color: var(--cursor-bg-secondary);
}

.env-value-inherited {
  opacity: 0.6;
}

.env-value-input {
  width: 100%;
}

/* ── 继承行样式 ── */

.env-inherited-cell {
  opacity: 0.7;
}

.env-row-inherited .env-key-text {
  color: var(--cursor-text-secondary);
}

/* ── 操作按钮 ── */

.env-action-btn {
  all: unset;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--cursor-icon-tertiary);
  font-size: 13px;
  transition: color 0.15s, background-color 0.15s;
}

.env-action-btn:hover {
  background-color: var(--cursor-bg-secondary);
  color: var(--cursor-icon-primary);
}

.env-action-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.env-action-btn:disabled:hover {
  background-color: transparent;
  color: var(--cursor-icon-tertiary);
}

.env-action-btn-danger:hover {
  color: var(--cursor-text-red-primary, var(--vscode-errorForeground));
}

.env-action-btn-add {
  color: var(--cursor-icon-secondary);
}

.env-action-btn-add:hover:not(:disabled) {
  color: var(--cursor-icon-primary);
}

/* ── 组合框（使用 :deep 针对 reka-ui 渲染的元素） ── */

.env-col-key :deep(.env-combobox-root) {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
}

.env-col-key :deep(.env-combobox-anchor) {
  display: flex;
  align-items: center;
  width: 100%;
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  box-sizing: border-box;
}

.env-col-key :deep(.env-combobox-anchor):focus-within {
  border-color: var(--vscode-focusBorder);
}

.env-col-key :deep(.env-combobox-input) {
  flex: 1 1 0;
  min-width: 0;
  width: 100%;
  padding: 3px 6px;
  background: transparent;
  border: none;
  font-family: var(--vscode-editor-font-family), monospace;
  font-size: 12px;
  color: var(--vscode-input-foreground);
  outline: none;
  box-sizing: border-box;
  line-height: 1.4;
}

.env-col-key :deep(.env-combobox-input)::placeholder {
  color: var(--vscode-input-placeholderForeground);
}

.env-col-key :deep(.env-combobox-trigger) {
  all: unset;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  cursor: pointer;
  color: var(--cursor-icon-tertiary);
  flex-shrink: 0;
}

.env-col-key :deep(.env-combobox-trigger):hover {
  color: var(--cursor-icon-primary);
}

.env-col-key :deep(.env-combobox-trigger) .codicon {
  font-size: 12px;
}
</style>

<style>
/* 组合框下拉菜单不能加作用域 — 通过 Portal 渲染在组件 DOM 外部 */

.env-combobox-content {
  background-color: var(--vscode-settings-dropdownBackground);
  border: 1px solid var(--vscode-settings-dropdownBorder);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
  width: var(--reka-combobox-trigger-width);
  min-width: 260px;
}

.env-combobox-viewport {
  max-height: 220px;
  overflow-y: auto;
  padding: 4px 0;
}

.env-combobox-item {
  display: flex;
  align-items: center;
  padding: 5px 10px;
  cursor: pointer;
  outline: none;
  user-select: none;
  transition: background-color 0.1s;
}

.env-combobox-item[data-highlighted] {
  background-color: var(--vscode-list-hoverBackground);
}

.env-combobox-item[data-disabled] {
  opacity: 0.4;
  pointer-events: none;
}

.env-suggestion-row {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.env-suggestion-key {
  font-family: var(--vscode-editor-font-family), monospace;
  font-size: 12px;
  color: var(--vscode-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.env-suggestion-desc {
  font-size: 11px;
  color: var(--cursor-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.env-combobox-empty {
  padding: 8px 10px;
  font-size: 11px;
  color: var(--cursor-text-tertiary);
  font-style: italic;
  text-align: center;
}
</style>
