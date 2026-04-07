<template>
  <SettingsTab title="模型管理">
    <!-- Section 1: Default Model + Model List -->
    <SettingsSection title="模型管理">
      <SettingsSubSection caption="启用或禁用聊天模型选择器中的模型。可以添加和删除自定义模型。">
        <!-- Model selector row -->
        <SettingsItem
          setting-key="model"
          label="默认模型"
          description="YW Coder 会话的模型别名或完整模型 ID"
        >
          <template #default="{ effectiveValue, update }">
            <Dropdown
              :model-value="effectiveValue ?? 'default'"
              @update:model-value="(val: string) => val === 'default' ? resetSetting('model', scope) : update(val)"
              :options="allDropdownOptions"
              menu-align="right"
            >
              <template #trigger="{ selected }">
                {{ selected?.label || effectiveValue || 'default' }}
              </template>
            </Dropdown>
          </template>
        </SettingsItem>
        <!-- Add custom model row -->
        <SettingsCell>
          <template #label>
            <div class="add-model-row">
              <TextInput
                v-model="customModelIdInput"
                class="add-model-id"
                placeholder="模型 ID"
                monospace
                @keydown.enter.prevent="addCustomModel"
              />
              <TextInput
                v-model="customModelNameInput"
                class="add-model-name"
                placeholder="显示名称（可选）"
                @keydown.enter.prevent="addCustomModel"
              />
              <Tooltip content="添加自定义模型">
                <button
                  class="add-model-btn codicon codicon-plus"
                  :disabled="!customModelIdInput.trim()"
                  @click="addCustomModel"
                />
              </Tooltip>
            </div>
          </template>
        </SettingsCell>

        <!-- Search filter (only show when there are enough models) -->
        <SettingsCell v-if="allDisplayModels.length > 6" :divider="true">
          <template #label>
            <TextInput
              v-model="modelSearchQuery"
              placeholder="搜索模型..."
              class="models-search-input"
            />
          </template>
        </SettingsCell>

        <!-- Custom Models -->
        <SettingsCell
          v-for="cm in filteredCustomModels"
          :key="'custom-' + cm.id"
          :divider="true"
          class="settings-model-item"
        >
          <template #label>
            <span>{{ cm.name || cm.id }}</span>
            <span v-if="cm.name" class="model-id">{{ cm.id }}</span>
            <Badge variant="subtle" class="model-badge">自定义</Badge>
          </template>
          <template #trailing>
            <div class="model-actions">
              <Tooltip :content="isModelEnabled(cm.id) ? '已在聊天选择器中启用' : '已在聊天选择器中禁用'">
                <span class="switch-tooltip-wrapper">
                  <Switch
                    :model-value="isModelEnabled(cm.id)"
                    @update:model-value="toggleModel(cm.id, $event)"
                  />
                </span>
              </Tooltip>
              <Tooltip content="删除自定义模型">
                <button
                  class="model-action-btn model-action-btn-danger codicon codicon-trash"
                  @click="removeCustomModel(cm.id)"
                />
              </Tooltip>
            </div>
          </template>
        </SettingsCell>

        <!-- Loading State -->
        <SettingsCell v-if="sdkCapabilitiesLoading" :divider="true">
          <template #label>
            <span class="loading-text">正在从 SDK 加载模型...</span>
          </template>
        </SettingsCell>

        <!-- 内置模型（别名与 SDK 信息合并） -->
        <SettingsCell
          v-for="model in filteredBuiltinModels"
          :key="'builtin-' + model.id"
          :divider="true"
          class="settings-model-item"
        >
          <template #label>
            <span>{{ model.name }}</span>
            <span class="model-id">{{ model.id }}</span>
          </template>
          <template #description>
            {{ model.description }}
          </template>
          <template #trailing>
            <Tooltip :content="isModelEnabled(model.id) ? '已在聊天选择器中启用' : '已在聊天选择器中禁用'">
              <span class="switch-tooltip-wrapper">
                <Switch
                  :model-value="isModelEnabled(model.id)"
                  @update:model-value="toggleModel(model.id, $event)"
                />
              </span>
            </Tooltip>
          </template>
        </SettingsCell>

        <!-- Empty State -->
        <SettingsCell
          v-if="!sdkCapabilitiesLoading && filteredBuiltinModels.length === 0 && filteredCustomModels.length === 0"
          :divider="true"
        >
          <template #label>
            <span class="empty-text">
              {{ modelSearchQuery ? '没有匹配搜索的模型' : '没有可用的模型' }}
            </span>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Section 2: Thinking & Effort -->
    <SettingsSection title="思考与努力程度">
      <SettingsSubSection>
        <SettingsItem
          setting-key="alwaysThinkingEnabled"
          label="始终思考"
          description="为所有请求启用深度思考"
        >
          <template #default="{ effectiveValue, update }">
            <div class="cursor-settings-cell-switch-container">
              <Switch
                :model-value="effectiveValue ?? false"
                @update:model-value="update"
                title="始终思考"
              />
            </div>
          </template>
        </SettingsItem>
        <SettingsItem
          setting-key="effortLevel"
          label="努力程度"
          :description="effortLevelDescription"
          :divider="true"
        >
          <template #default="{ effectiveValue, update }">
            <Dropdown
              :model-value="effectiveValue ?? 'high'"
              @update:model-value="effortEnabled ? update($event) : undefined"
              :options="effortLevelOptions"
              menu-align="right"
              :class="{ 'dropdown-disabled': !effortEnabled }"
            >
              <template #trigger="{ selected }">
                {{ selected?.label || effectiveValue || 'high' }}
              </template>
            </Dropdown>
          </template>
        </SettingsItem>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Section 3: Model Routing (Advanced Env Vars) -->
    <SettingsSection title="模型路由">
      <SettingsSubSection caption="通过环境变量覆盖模型选择。从可用模型中选择或保持未设置。值将写入 settings.json 中的 'env' 对象。">
        <SettingsCell
          label="ANTHROPIC_DEFAULT_SONNET_MODEL"
          description="选择 'sonnet' 别名时使用的模型 ID"
        >
          <template #trailing>
            <Dropdown
              :model-value="getEnvVar('ANTHROPIC_DEFAULT_SONNET_MODEL') || '__not_set__'"
              @update:model-value="setEnvVar('ANTHROPIC_DEFAULT_SONNET_MODEL', $event === '__not_set__' ? '' : $event)"
              :options="envModelOptions('ANTHROPIC_DEFAULT_SONNET_MODEL')"
              menu-align="right"
            >
              <template #trigger="{ selected }">
                <span :class="{ 'env-not-set': !getEnvVar('ANTHROPIC_DEFAULT_SONNET_MODEL') }">
                  {{ selected?.label || getEnvVar('ANTHROPIC_DEFAULT_SONNET_MODEL') || '未设置' }}
                </span>
              </template>
            </Dropdown>
          </template>
        </SettingsCell>

        <SettingsCell
          label="ANTHROPIC_DEFAULT_OPUS_MODEL"
          description="选择 'opus' 别名时使用的模型 ID"
          :divider="true"
        >
          <template #trailing>
            <Dropdown
              :model-value="getEnvVar('ANTHROPIC_DEFAULT_OPUS_MODEL') || '__not_set__'"
              @update:model-value="setEnvVar('ANTHROPIC_DEFAULT_OPUS_MODEL', $event === '__not_set__' ? '' : $event)"
              :options="envModelOptions('ANTHROPIC_DEFAULT_OPUS_MODEL')"
              menu-align="right"
            >
              <template #trigger="{ selected }">
                <span :class="{ 'env-not-set': !getEnvVar('ANTHROPIC_DEFAULT_OPUS_MODEL') }">
                  {{ selected?.label || getEnvVar('ANTHROPIC_DEFAULT_OPUS_MODEL') || '未设置' }}
                </span>
              </template>
            </Dropdown>
          </template>
        </SettingsCell>

        <SettingsCell
          label="ANTHROPIC_DEFAULT_HAIKU_MODEL"
          description="选择 'haiku' 别名时使用的模型 ID"
          :divider="true"
        >
          <template #trailing>
            <Dropdown
              :model-value="getEnvVar('ANTHROPIC_DEFAULT_HAIKU_MODEL') || '__not_set__'"
              @update:model-value="setEnvVar('ANTHROPIC_DEFAULT_HAIKU_MODEL', $event === '__not_set__' ? '' : $event)"
              :options="envModelOptions('ANTHROPIC_DEFAULT_HAIKU_MODEL')"
              menu-align="right"
            >
              <template #trigger="{ selected }">
                <span :class="{ 'env-not-set': !getEnvVar('ANTHROPIC_DEFAULT_HAIKU_MODEL') }">
                  {{ selected?.label || getEnvVar('ANTHROPIC_DEFAULT_HAIKU_MODEL') || '未设置' }}
                </span>
              </template>
            </Dropdown>
          </template>
        </SettingsCell>

        <SettingsCell
          label="CLAUDE_CODE_SUBAGENT_MODEL"
          description="子代理（任务工具）调用时使用的模型 ID"
          :divider="true"
        >
          <template #trailing>
            <Dropdown
              :model-value="getEnvVar('CLAUDE_CODE_SUBAGENT_MODEL') || '__not_set__'"
              @update:model-value="setEnvVar('CLAUDE_CODE_SUBAGENT_MODEL', $event === '__not_set__' ? '' : $event)"
              :options="envModelOptions('CLAUDE_CODE_SUBAGENT_MODEL')"
              menu-align="right"
            >
              <template #trigger="{ selected }">
                <span :class="{ 'env-not-set': !getEnvVar('CLAUDE_CODE_SUBAGENT_MODEL') }">
                  {{ selected?.label || getEnvVar('CLAUDE_CODE_SUBAGENT_MODEL') || '未设置' }}
                </span>
              </template>
            </Dropdown>
          </template>
        </SettingsCell>

        <SettingsCell
          label="MAX_THINKING_TOKENS"
          description="深度思考的最大思考令牌数"
          :divider="true"
        >
          <template #trailing>
            <NumberInput
              :model-value="getEnvVarNumber('MAX_THINKING_TOKENS')"
              @update:model-value="setEnvVarNumber('MAX_THINKING_TOKENS', $event)"
              :min="0"
              width="100px"
            />
          </template>
        </SettingsCell>

        <SettingsCell
          label="CLAUDE_CODE_MAX_OUTPUT_TOKENS"
          description="每次响应的最大输出令牌数"
          :divider="true"
        >
          <template #trailing>
            <NumberInput
              :model-value="getEnvVarNumber('CLAUDE_CODE_MAX_OUTPUT_TOKENS')"
              @update:model-value="setEnvVarNumber('CLAUDE_CODE_MAX_OUTPUT_TOKENS', $event)"
              :min="0"
              width="100px"
            />
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>
  </SettingsTab>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import SettingsTab from '../SettingsTab.vue'
import SettingsSection from '../SettingsSection.vue'
import SettingsSubSection from '../SettingsSubSection.vue'
import SettingsCell from '../SettingsCell.vue'
import SettingsItem from '../SettingsItem.vue'
import Switch from '../../Common/Switch.vue'
import Dropdown from '../../Common/Dropdown.vue'
import NumberInput from '../../Common/NumberInput.vue'
import TextInput from '../../Common/TextInput.vue'
import Badge from '../../Common/Badge.vue'
import Tooltip from '../../Common/Tooltip.vue'
import { useSettingsStore } from '../../../composables/useSettingsStore'
import { useSettingsScope } from '../../../composables/useSettingsScope'
import { transport } from '../../../core/runtimeTransport'

const { settings, activeProfile, sdkCapabilities, sdkCapabilitiesLoading, inspect, updateSetting, resetSetting } = useSettingsStore()
const scope = useSettingsScope()

// ── 模型别名（静态） ──

const MODEL_ALIASES = [
  { label: '默认', value: 'default', description: '账户默认模型' },
  { label: 'Sonnet', value: 'sonnet', description: '当前 Sonnet 模型' },
  { label: 'Opus', value: 'opus', description: '当前 Opus 模型' },
  { label: 'Haiku', value: 'haiku', description: '当前 Haiku 模型' },
]

// ── Custom Models & Disabled Models (Pipeline B: ~/.ywcoder.json) ──
// Stored in extension config, not YW Coder settings.json

interface CustomModel {
  id: string
  name?: string
}

const customModels = ref<CustomModel[]>([])
const disabledModels = ref<string[]>([])

function toSerializableCustomModels(models: CustomModel[]): CustomModel[] {
  return models.map((m) => ({
    id: String(m.id),
    ...(m.name?.trim() ? { name: m.name.trim() } : {}),
  }))
}

// Load from extension config on mount
onMounted(async () => {
  try {
    const response = await transport.getExtensionConfig()
    if (response?.config) {
      customModels.value = toSerializableCustomModels(response.config.customModels ?? [])
      disabledModels.value = response.config.disabledModels ?? []
    }
  } catch (e) {
    console.error('Failed to load extension config:', e)
  }
})

async function addCustomModel() {
  const id = customModelIdInput.value.trim()
  if (!id) return
  if (customModels.value.some((m) => m.id === id)) {
    customModelIdInput.value = ''
    customModelNameInput.value = ''
    return
  }

  const name = customModelNameInput.value.trim() || undefined
  const updated = toSerializableCustomModels([...customModels.value, { id, name }])

  try {
    await transport.updateExtensionConfig('customModels', updated)
    customModels.value = updated
    customModelIdInput.value = ''
    customModelNameInput.value = ''
  } catch (e) {
    console.error('Failed to update customModels:', e)
  }
}

async function removeCustomModel(modelId: string) {
  const updated = toSerializableCustomModels(customModels.value.filter((m) => m.id !== modelId))

  try {
    await transport.updateExtensionConfig('customModels', updated)
    customModels.value = updated
  } catch (e) {
    console.error('Failed to update customModels:', e)
    return
  }

  // Clean up from disabledModels if present
  if (disabledModels.value.includes(modelId)) {
    const updatedDisabled = disabledModels.value.filter((m) => m !== modelId)
    disabledModels.value = updatedDisabled
    await transport.updateExtensionConfig('disabledModels', updatedDisabled)
  }
}

// ── Model Enable/Disable (blacklist) ──

function isModelEnabled(modelId: string): boolean {
  return !disabledModels.value.includes(modelId)
}

async function toggleModel(modelId: string, enabled: boolean) {
  let updated: string[]
  if (enabled) {
    updated = disabledModels.value.filter((m) => m !== modelId)
  } else {
    updated = [...disabledModels.value, modelId]
  }
  disabledModels.value = updated
  await transport.updateExtensionConfig('disabledModels', updated)
}

// ── Dropdown: builtins + custom models merged ──

const allDropdownOptions = computed(() => {
  const builtinOpts = builtinModels.value.map((m) => ({
    label: m.name,
    value: m.id,
    description: m.description,
  }))

  const builtinIds = new Set(builtinOpts.map((o) => o.value))
  const customOpts = customModels.value
    .filter((cm) => !builtinIds.has(cm.id))
    .map((cm) => ({
      label: cm.name || cm.id,
      value: cm.id,
      description: cm.name ? cm.id : 'Custom model',
    }))

  return [...builtinOpts, ...customOpts]
})

// ── Model List (combined view) ──

const customModelIdInput = ref('')
const customModelNameInput = ref('')
const modelSearchQuery = ref('')

interface ModelDisplay {
  id: string
  name: string
  description?: string
}

// ── Built-in Models: aliases enriched with SDK info, plus SDK-only extras ──

const builtinModels = computed<ModelDisplay[]>(() => {
  // Build SDK lookup by value (id)
  const sdkMap = new Map<string, { displayName: string; description: string }>()
  for (const m of sdkCapabilities.value.supportedModels) {
    sdkMap.set(m.value, { displayName: m.displayName, description: m.description })
  }

  const seenIds = new Set<string>()
  const result: ModelDisplay[] = []

  // 1. Aliases first — enrich with SDK description if available
  for (const alias of MODEL_ALIASES) {
    const sdk = sdkMap.get(alias.value)
    result.push({
      id: alias.value,
      name: alias.label,
      description: sdk?.description || alias.description,
    })
    seenIds.add(alias.value)
  }

  // 2. SDK models not covered by aliases
  for (const m of sdkCapabilities.value.supportedModels) {
    if (!seenIds.has(m.value)) {
      // Clean up displayName: strip trailing " (recommended)" etc.
      const cleanName = m.displayName.replace(/\s*\(recommended\)\s*$/i, '')
      result.push({
        id: m.value,
        name: cleanName,
        description: m.description,
      })
      seenIds.add(m.value)
    }
  }

  return result
})

// Total model count (for conditional search bar)
const allDisplayModels = computed(() => [
  ...customModels.value.map((cm) => cm.id),
  ...builtinModels.value.map((m) => m.id),
])

const filteredCustomModels = computed(() => {
  const query = modelSearchQuery.value.toLowerCase().trim()
  if (!query) return customModels.value
  return customModels.value.filter(
    (cm) =>
      cm.id.toLowerCase().includes(query) ||
      cm.name?.toLowerCase().includes(query)
  )
})

const filteredBuiltinModels = computed(() => {
  const query = modelSearchQuery.value.toLowerCase().trim()
  if (!query) return builtinModels.value
  return builtinModels.value.filter(
    (model) =>
      model.name.toLowerCase().includes(query) ||
      model.id.toLowerCase().includes(query) ||
      model.description?.toLowerCase().includes(query)
  )
})

// ── Thinking & Effort ──

const effortLevelOptions = [
  { label: '低', value: 'low', description: '最小思考努力' },
  { label: '中', value: 'medium', description: '平衡的思考努力' },
  { label: '高', value: 'high', description: '最大思考努力' },
]

const effortEnabled = computed(() => {
  const model = ((settings.value.model as string) || 'default').toLowerCase()
  return model.includes('opus-4-6')
})

const effortLevelDescription = computed(() => {
  if (!effortEnabled.value) {
    return '控制推理努力程度。仅 Opus 4.6 可用 — 当前模型不支持努力程度设置。'
  }
  return '控制推理努力程度（低、中、高）'
})

// ── Env Var Model Options (shared from model list) ──

function envModelOptions(envKey: string) {
  const currentVal = getEnvVar(envKey)
  const NOT_SET = { label: '未设置', value: '__not_set__', description: '使用默认值' }

  const modelOpts = builtinModels.value.map((m) => ({
    label: m.name,
    value: m.id,
    description: m.id,
  }))

  const customOpts = customModels.value
    .filter((cm) => !builtinModels.value.some((m) => m.id === cm.id))
    .map((cm) => ({
      label: cm.name || cm.id,
      value: cm.id,
      description: cm.name ? cm.id : '自定义模型',
    }))

  const allOpts = [NOT_SET, ...modelOpts, ...customOpts]

  // If the current value is set but not in the list, prepend it so Dropdown can display it
  if (currentVal && !allOpts.some((o) => o.value === currentVal)) {
    allOpts.splice(1, 0, { label: currentVal, value: currentVal, description: '当前值' })
  }

  return allOpts
}

// ── Env Vars ──

const effectiveEnv = computed<Record<string, string>>(() => {
  const val = settings.value.env
  return (val && typeof val === 'object' ? val : {}) as Record<string, string>
})
const scopeEnv = computed<Record<string, string>>(() => {
  // Touch settings.value to establish Vue reactivity tracking.
  // inspect() reads alien-signals directly, which Vue cannot track.
  void settings.value
  const meta = inspect('env')
  const values = meta?.values || {}
  // When a profile is active and viewing User scope, edit the profile layer
  if (activeProfile.value && scope.value === 'global') {
    return (values.profile as Record<string, string>) || {}
  }
  return (values[scope.value] as Record<string, string>) || {}
})

function getEnvVar(key: string): string {
  return effectiveEnv.value[key] || ''
}

function getEnvVarNumber(key: string): number {
  const raw = effectiveEnv.value[key]
  if (!raw) return 0
  const num = parseInt(raw, 10)
  return isNaN(num) ? 0 : num
}

function setEnvVar(key: string, value: string) {
  const currentEnv = { ...scopeEnv.value }
  const trimmed = value.trim()
  if (trimmed) {
    currentEnv[key] = trimmed
  } else {
    delete currentEnv[key]
  }
  updateSetting('env', currentEnv, scope.value)
}

function setEnvVarNumber(key: string, value: number) {
  setEnvVar(key, value > 0 ? String(value) : '')
}
</script>

<style scoped>
/* ── Add Model Row ── */

.add-model-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.add-model-id {
  flex: 1;
  min-width: 0;
}

.add-model-name {
  flex: 1;
  min-width: 0;
}

.add-model-btn {
  all: unset;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--cursor-icon-secondary);
  font-size: 14px;
  flex-shrink: 0;
  transition: color 0.15s, background-color 0.15s;
}

.add-model-btn:hover:not(:disabled) {
  background-color: var(--cursor-bg-secondary);
  color: var(--cursor-icon-primary);
}

.add-model-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ── Model List ── */

.model-badge {
  margin-left: 6px;
}

.model-id {
  color: var(--cursor-text-tertiary);
  font-size: 11px;
  margin-left: 6px;
  font-family: var(--vscode-editor-font-family), monospace;
}

.settings-model-item {
  cursor: default;
  user-select: none;
}

.model-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.model-action-btn {
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

.model-action-btn:hover {
  background-color: var(--cursor-bg-secondary);
  color: var(--cursor-icon-primary);
}

.model-action-btn-danger:hover {
  color: var(--cursor-text-red-primary);
}

/* ── Search ── */

.models-search-input {
  width: 100%;
  flex: 1 1 0;
}

/* ── Env Var Dropdowns ── */

.env-not-set {
  color: var(--cursor-text-tertiary);
  font-style: italic;
}

/* ── States ── */

.loading-text {
  color: var(--cursor-text-tertiary);
  font-style: italic;
}

.empty-text {
  color: var(--cursor-text-tertiary);
  font-style: italic;
}

.dropdown-disabled {
  opacity: 0.45;
  pointer-events: none;
}

/* Isolate Tooltip's as-child from Switch's data-state */
.switch-tooltip-wrapper {
  display: inline-flex;
  align-items: center;
}
</style>
