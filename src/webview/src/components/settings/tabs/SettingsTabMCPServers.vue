<template>
  <SettingsTab title="MCP 服务器">
    <!-- Section 1: Server Status (SDK probe, read-only) -->
    <SettingsSection title="服务器状态">
      <SettingsSubSection>
        <!-- Loading state -->
        <SettingsCell v-if="loading">
          <template #label>
            <div class="mcp-loading">
              <span class="codicon codicon-loading mcp-spin" />
              <span>正在探测 MCP 服务器...</span>
            </div>
          </template>
        </SettingsCell>

        <!-- Server list -->
        <SettingsCell
          v-for="(server, index) in mcpServers"
          :key="server.name"
          :divider="index > 0"
        >
          <template #label>
            <div class="mcp-server-row">
              <span class="mcp-server-name">{{ server.name }}</span>
              <Badge :variant="statusVariant(server.status)" size="small">
                {{ statusLabel(server.status) }}
              </Badge>
            </div>
          </template>
          <template #trailing>
            <span v-if="server.serverInfo" class="mcp-server-version">
              {{ server.serverInfo.name }} v{{ server.serverInfo.version }}
            </span>
          </template>
        </SettingsCell>

        <!-- Empty state -->
        <SettingsCell v-if="!loading && mcpServers.length === 0">
          <template #label>
            <span class="mcp-empty">未配置 MCP 服务器</span>
          </template>
        </SettingsCell>

        <!-- Action buttons -->
        <SettingsCell :divider="mcpServers.length > 0 || loading">
          <template #label>
            <div class="mcp-actions">
              <Tooltip content="重新探测 MCP 服务器">
                <button class="mcp-action-btn" :disabled="loading" @click="handleRefresh">
                  <span class="codicon codicon-refresh" :class="{ 'mcp-spin': loading }" />
                  <span>刷新</span>
                </button>
              </Tooltip>
              <Tooltip content="打开 ~/.ywcoder.json (全局 MCP 配置)">
                <button class="mcp-action-btn" @click="openGlobalConfig">
                  <span class="codicon codicon-globe" />
                  <span>全局配置</span>
                </button>
              </Tooltip>
              <Tooltip content="打开 .mcp.json (项目 MCP 配置)">
                <button class="mcp-action-btn" :disabled="!hasWorkspace" @click="openProjectConfig">
                  <span class="codicon codicon-folder" />
                  <span>项目配置</span>
                </button>
              </Tooltip>
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Section 2: Project Server Policy -->
    <SettingsSection title="项目服务器策略">
      <SettingsSubSection caption="控制来自 .mcp.json 文件的哪些 MCP 服务器被自动批准。">
        <!-- enableAllProjectMcpServers -->
        <SettingsItem
          setting-key="enableAllProjectMcpServers"
          label="自动批准所有项目服务器"
          description="自动批准在 .mcp.json 中定义的所有 MCP 服务器"
        >
          <template #default="{ effectiveValue, update }">
            <div class="cursor-settings-cell-switch-container">
              <span class="switch-tooltip-wrapper">
                <Switch
                  :model-value="effectiveValue ?? false"
                  @update:model-value="update"
                />
              </span>
            </div>
          </template>
        </SettingsItem>

        <!-- enabledMcpjsonServers -->
        <SettingsItem
          setting-key="enabledMcpjsonServers"
          label="已批准的服务器"
          description="从 .mcp.json 显式批准的 MCP 服务器"
          :divider="true"
        >
          <template #content="{ effectiveValue, update }">
            <div class="mcp-pill-container">
              <div
                v-for="(name, index) in (effectiveValue || [])"
                :key="'enabled-' + index"
                class="mcp-pill mcp-pill--enabled"
              >
                <span>{{ name }}</span>
                <button class="mcp-pill-remove" @click="update(removeFromArray(effectiveValue, Number(index)))">
                  <span class="codicon codicon-close" />
                </button>
              </div>
              <TextInput
                v-model="newEnabledServer"
                placeholder="服务器名称..."
                size="small"
                monospace
                class="mcp-pill-input"
                @keydown.enter.prevent="handleAddEnabled(effectiveValue, update)"
              />
            </div>
          </template>
        </SettingsItem>

        <!-- disabledMcpjsonServers -->
        <SettingsItem
          setting-key="disabledMcpjsonServers"
          label="已拒绝的服务器"
          description="从 .mcp.json 显式拒绝的 MCP 服务器"
          :divider="true"
        >
          <template #content="{ effectiveValue, update }">
            <div class="mcp-pill-container">
              <div
                v-for="(name, index) in (effectiveValue || [])"
                :key="'disabled-' + index"
                class="mcp-pill mcp-pill--disabled"
              >
                <span>{{ name }}</span>
                <button class="mcp-pill-remove" @click="update(removeFromArray(effectiveValue, Number(index)))">
                  <span class="codicon codicon-close" />
                </button>
              </div>
              <TextInput
                v-model="newDisabledServer"
                placeholder="服务器名称..."
                size="small"
                monospace
                class="mcp-pill-input"
                @keydown.enter.prevent="handleAddDisabled(effectiveValue, update)"
              />
            </div>
          </template>
        </SettingsItem>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Section 3: Enterprise Policy (conditional) -->
    <SettingsSection v-if="hasEnterprisePolicies" title="企业策略">
      <SettingsSubSection>
        <SettingsCell v-if="managedAllowedServers.length" label="允许的服务器">
          <template #label>
            <div class="flex items-center gap-2">
              <span>Allowed Servers</span>
              <Tooltip content="由托管策略控制">
                <Badge variant="danger">托管</Badge>
              </Tooltip>
            </div>
          </template>
          <template #bottom>
            <div class="mcp-pill-container">
              <div
                v-for="(server, index) in managedAllowedServers"
                :key="'ma-' + index"
                class="mcp-pill mcp-pill--enabled mcp-pill--readonly"
              >
                <span>{{ server.serverName }}</span>
              </div>
            </div>
          </template>
        </SettingsCell>

        <SettingsCell
          v-if="managedDeniedServers.length"
          label="拒绝的服务器"
          :divider="managedAllowedServers.length > 0"
        >
          <template #label>
            <div class="flex items-center gap-2">
              <span>Denied Servers</span>
              <Tooltip content="由托管策略控制">
                <Badge variant="danger">托管</Badge>
              </Tooltip>
            </div>
          </template>
          <template #bottom>
            <div class="mcp-pill-container">
              <div
                v-for="(server, index) in managedDeniedServers"
                :key="'md-' + index"
                class="mcp-pill mcp-pill--disabled mcp-pill--readonly"
              >
                <span>{{ server.serverName }}</span>
              </div>
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Section 4: MCP Environment Variables -->
    <SettingsSection title="MCP 环境变量">
      <SettingsSubSection caption="MCP 服务器配置的环境变量。写入 settings.json 中的 env 对象。">
        <SettingsCell
          v-for="(field, index) in MCP_ENV_FIELDS"
          :key="field.key"
          :description="field.description"
          :divider="index > 0"
          :class="{ 'mcp-inherited-cell': isEnvInherited(field.key) }"
        >
          <template #label>
            <div class="flex items-center gap-2">
              <span>{{ field.label }}</span>
              <Tooltip v-if="isEnvInherited(field.key)" content="继承自低优先级作用域">
                <Badge variant="subtle">已继承</Badge>
              </Tooltip>
            </div>
          </template>
          <template #trailing>
            <TextInput
              v-model="fieldValues[field.key]"
              :type="field.type || 'text'"
              :placeholder="field.placeholder"
              monospace
              @change="updateEnvVar(field.key, $event)"
            />
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>
  </SettingsTab>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watchEffect } from 'vue';
import SettingsTab from '../SettingsTab.vue';
import SettingsSection from '../SettingsSection.vue';
import SettingsSubSection from '../SettingsSubSection.vue';
import SettingsCell from '../SettingsCell.vue';
import SettingsItem from '../SettingsItem.vue';
import Badge from '../../Common/Badge.vue';
import Switch from '../../Common/Switch.vue';
import TextInput from '../../Common/TextInput.vue';
import Tooltip from '../../Common/Tooltip.vue';
import { useSettingsStore } from '../../../composables/useSettingsStore';
import { useSettingsScope } from '../../../composables/useSettingsScope';
import { transport } from '../../../core/runtimeTransport';

const {
  settings, activeProfile, inspect, updateSetting,
  sdkCapabilities, sdkCapabilitiesLoading, refreshSdkCapabilities,
  hasWorkspace
} = useSettingsStore();
const scope = useSettingsScope();

// ── Server Status (SDK probe, read-only) ──

const mcpServers = computed(() => sdkCapabilities.value.mcpServerStatus || []);
const loading = computed(() => sdkCapabilitiesLoading.value);

type BadgeVariant = 'success' | 'danger' | 'warning' | 'subtle' | 'default';

function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'connected': return 'success';
    case 'failed': return 'danger';
    case 'needs-auth': return 'warning';
    case 'pending': return 'subtle';
    default: return 'default';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'connected': return '已连接';
    case 'failed': return '失败';
    case 'needs-auth': return '需要认证';
    case 'pending': return '待处理';
    default: return status;
  }
}

const handleRefresh = () => refreshSdkCapabilities();

// ── Config File Opening ──

const openGlobalConfig = () => transport.openConfigFile('mcp-global');
const openProjectConfig = () => transport.openConfigFile('mcp-project');

// ── Policy: Pill list helpers ──

const newEnabledServer = ref('');
const newDisabledServer = ref('');

function removeFromArray(arr: string[] | undefined, index: number): string[] {
  const list = [...(arr || [])];
  list.splice(index, 1);
  return list;
}

function addToArray(arr: string[] | undefined, item: string): string[] | undefined {
  const trimmed = item.trim();
  if (!trimmed) return arr;
  const list = [...(arr || [])];
  if (list.includes(trimmed)) return arr;
  list.push(trimmed);
  return list;
}

function handleAddEnabled(currentValue: string[] | undefined, update: (val: any) => void) {
  const result = addToArray(currentValue, newEnabledServer.value);
  if (result !== currentValue) {
    update(result);
    newEnabledServer.value = '';
  }
}

function handleAddDisabled(currentValue: string[] | undefined, update: (val: any) => void) {
  const result = addToArray(currentValue, newDisabledServer.value);
  if (result !== currentValue) {
    update(result);
    newDisabledServer.value = '';
  }
}

// ── Enterprise Policy (managed scope, read-only) ──

const hasEnterprisePolicies = computed(() => {
  void settings.value;
  const allowedMeta = inspect('allowedMcpServers');
  const deniedMeta = inspect('deniedMcpServers');
  return (allowedMeta?.values?.managed !== undefined)
    || (deniedMeta?.values?.managed !== undefined);
});

const managedAllowedServers = computed(() => {
  void settings.value;
  const meta = inspect('allowedMcpServers');
  return (meta?.values?.managed || []) as Array<{ serverName: string }>;
});

const managedDeniedServers = computed(() => {
  void settings.value;
  const meta = inspect('deniedMcpServers');
  return (meta?.values?.managed || []) as Array<{ serverName: string }>;
});

// ── MCP Environment Variables (Network Tab pattern) ──

interface McpEnvField {
  key: string;
  label: string;
  description: string;
  placeholder: string;
  type?: 'text' | 'password';
}

const MCP_ENV_FIELDS: McpEnvField[] = [
  { key: 'MCP_TIMEOUT', label: '服务器超时', description: 'MCP 服务器启动超时时间（毫秒）', placeholder: '10000' },
  { key: 'MCP_TOOL_TIMEOUT', label: '工具超时', description: '单个 MCP 工具调用超时时间（毫秒）', placeholder: '300000' },
  { key: 'MAX_MCP_OUTPUT_TOKENS', label: '最大输出令牌数', description: 'MCP 服务器响应中的最大令牌数（默认 25000）', placeholder: '25000' },
  { key: 'ENABLE_TOOL_SEARCH', label: '工具搜索', description: '启用工具搜索：auto、auto:N、true 或 false', placeholder: 'auto' },
  { key: 'MCP_OAUTH_CALLBACK_PORT', label: 'OAuth 回调端口', description: 'MCP OAuth 重定向的固定端口', placeholder: '8080' },
  { key: 'MCP_CLIENT_SECRET', label: '客户端密钥', description: 'MCP 认证的 OAuth 客户端密钥', placeholder: '••••••', type: 'password' },
];

const MCP_ENV_KEYS = MCP_ENV_FIELDS.map(f => f.key);

// Scope-aware env (same pattern as Network Tab)
const scopeEnv = computed<Record<string, string>>(() => {
  void settings.value;
  const meta = inspect('env');
  const values = meta?.values || {};
  if (activeProfile.value && scope.value === 'global') {
    return (values.profile as Record<string, string>) || {};
  }
  return (values[scope.value] as Record<string, string>) || {};
});

const effectiveEnv = computed<Record<string, string>>(() => {
  const val = settings.value?.env;
  return (val && typeof val === 'object' ? val : {}) as Record<string, string>;
});

const fieldValues = reactive<Record<string, string>>({});

watchEffect(() => {
  const env = effectiveEnv.value;
  for (const key of MCP_ENV_KEYS) {
    fieldValues[key] = env[key] || '';
  }
});

function isEnvInherited(key: string): boolean {
  return !!effectiveEnv.value[key] && !(key in scopeEnv.value);
}

function updateEnvVar(key: string, value: string) {
  const env: Record<string, string> = { ...scopeEnv.value };
  if (value) {
    env[key] = value;
  } else {
    delete env[key];
  }
  updateSetting('env', env, scope.value);
}
</script>

<style scoped>
/* ── Server Status ── */

.mcp-server-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mcp-server-name {
  font-family: var(--vscode-editor-font-family), monospace;
  font-size: 12px;
  color: var(--cursor-text-primary);
}

.mcp-server-version {
  font-size: 11px;
  color: var(--cursor-text-tertiary);
  font-family: var(--vscode-editor-font-family), monospace;
}

.mcp-loading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--cursor-text-secondary);
  font-size: 12px;
}

.mcp-empty {
  color: var(--cursor-text-tertiary);
  font-size: 12px;
  font-style: italic;
}

/* ── Actions ── */

.mcp-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mcp-action-btn {
  all: unset;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: var(--cursor-text-secondary);
  cursor: pointer;
  transition: color 0.15s, background-color 0.15s;
  user-select: none;
}

.mcp-action-btn:hover:not(:disabled) {
  background-color: var(--cursor-bg-secondary);
  color: var(--cursor-text-primary);
}

.mcp-action-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.mcp-action-btn .codicon {
  font-size: 13px;
}

/* ── Pill containers ── */

.mcp-pill-container {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  align-items: center;
}

.mcp-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: var(--vscode-editor-font-family), monospace;
  user-select: none;
  line-height: 1.5;
}

.mcp-pill--enabled {
  background-color: color-mix(in srgb, var(--cursor-text-green-primary) 12%, transparent);
  color: var(--cursor-text-green-primary);
}

.mcp-pill--disabled {
  background-color: color-mix(in srgb, var(--cursor-text-red-primary) 12%, transparent);
  color: var(--cursor-text-red-primary);
}

.mcp-pill--readonly {
  opacity: 0.7;
}

.mcp-pill-remove {
  all: unset;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.mcp-pill-remove:hover {
  opacity: 1;
}

.mcp-pill-remove .codicon {
  font-size: 12px;
}

.mcp-pill-input {
  min-width: 140px;
  max-width: 200px;
  flex-shrink: 0;
}

/* ── Spinner ── */

.mcp-spin {
  animation: mcp-spin 1s linear infinite;
}

@keyframes mcp-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ── Inherited ── */

.mcp-inherited-cell {
  opacity: 0.7;
}

/* ── Switch wrapper (isolate Tooltip as-child from Switch data-state) ── */

.switch-tooltip-wrapper {
  display: inline-flex;
  align-items: center;
}
</style>
