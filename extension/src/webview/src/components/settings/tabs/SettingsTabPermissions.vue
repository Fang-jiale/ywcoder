<template>
  <SettingsTab title="权限">
    <!-- Section 1: Default Mode -->
    <SettingsSection title="默认模式">
      <SettingsSubSection>
        <SettingsCell
          label="权限模式"
          description="YwCoder 请求操作权限时的默认行为"
          :class="{ 'perm-inherited-cell': isModeInherited }"
        >
          <template #label>
            <div class="flex items-center gap-2">
              <span>权限模式</span>
              <Tooltip v-if="isModeInherited" content="继承自低优先级作用域">
                <Badge variant="subtle">已继承</Badge>
              </Tooltip>
              <Tooltip v-if="isModeOverridden" :content="`被 ${modeOverriddenByLabel} 作用域覆盖`">
                <Badge variant="warning">已覆盖</Badge>
              </Tooltip>
            </div>
          </template>
          <template #trailing>
            <Dropdown
              :model-value="defaultMode"
              @update:model-value="updateDefaultMode"
              :options="defaultModeOptions"
              menu-align="right"
            >
              <template #trigger="{ selected }">
                {{ selected?.label || defaultMode }}
              </template>
            </Dropdown>
          </template>
        </SettingsCell>

        <!-- Managed: disableBypassPermissionsMode -->
        <SettingsCell
          v-if="bypassDisabledByManaged"
          label="绕过模式已禁用"
          description="绕过权限提示的功能已被管理策略禁用"
          :divider="true"
        >
          <template #label>
            <div class="flex items-center gap-2">
              <span>绕过模式已禁用</span>
              <Tooltip content="由管理策略控制">
                <Badge variant="danger">托管</Badge>
              </Tooltip>
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Section 2: Permission Rules -->
    <SettingsSection title="权限规则">
      <SettingsSubSection caption="评估顺序：拒绝 → 询问 → 允许（首个匹配生效）。规则格式：工具名 或 工具名(模式) 或 mcp__服务器__工具。">
        <!-- Deny Rules -->
        <SettingsCell label="拒绝规则" description="始终阻止的操作">
          <template #label>
            <div class="flex items-center gap-2">
              <span>拒绝规则</span>
              <Tooltip v-if="isListInherited('deny')" content="继承自低优先级作用域">
                <Badge variant="subtle">已继承</Badge>
              </Tooltip>
            </div>
          </template>
          <template #bottom>
            <div class="perm-rules-container">
              <!-- Scope rules (editable) -->
              <div
                v-for="(rule, index) in scopeDenyRules"
                :key="'deny-scope-' + index"
                class="perm-pill perm-pill--deny"
              >
                <span>{{ rule }}</span>
                <button class="perm-pill-remove" @click="removeScopeRule('deny', index)">
                  <span class="codicon codicon-close" />
                </button>
              </div>
              <!-- Inherited rules (read-only) -->
              <Tooltip v-for="(rule, index) in inheritedDenyRules" :key="'deny-inh-' + index" content="已继承 — 从源作用域移除以更改">
                <div class="perm-pill perm-pill--deny perm-pill--inherited">
                  <span>{{ rule }}</span>
                </div>
              </Tooltip>
              <!-- Add input -->
              <TextInput
                v-model="newDenyRule"
                placeholder="例如 Bash(rm:*)"
                size="small"
                monospace
                class="perm-rule-input"
                @keydown.enter.prevent="addRule('deny', newDenyRule); newDenyRule = ''"
              />
            </div>
          </template>
        </SettingsCell>

        <!-- Ask Rules -->
        <SettingsCell label="询问规则" description="始终需要确认的操作" :divider="true">
          <template #label>
            <div class="flex items-center gap-2">
              <span>询问规则</span>
              <Tooltip v-if="isListInherited('ask')" content="继承自低优先级作用域">
                <Badge variant="subtle">已继承</Badge>
              </Tooltip>
            </div>
          </template>
          <template #bottom>
            <div class="perm-rules-container">
              <div
                v-for="(rule, index) in scopeAskRules"
                :key="'ask-scope-' + index"
                class="perm-pill perm-pill--ask"
              >
                <span>{{ rule }}</span>
                <button class="perm-pill-remove" @click="removeScopeRule('ask', index)">
                  <span class="codicon codicon-close" />
                </button>
              </div>
              <Tooltip v-for="(rule, index) in inheritedAskRules" :key="'ask-inh-' + index" content="已继承 — 从源作用域移除以更改">
                <div class="perm-pill perm-pill--ask perm-pill--inherited">
                  <span>{{ rule }}</span>
                </div>
              </Tooltip>
              <TextInput
                v-model="newAskRule"
                placeholder="例如 Bash(git push:*)"
                size="small"
                monospace
                class="perm-rule-input"
                @keydown.enter.prevent="addRule('ask', newAskRule); newAskRule = ''"
              />
            </div>
          </template>
        </SettingsCell>

        <!-- Allow Rules -->
        <SettingsCell label="允许规则" description="自动批准的操作" :divider="true">
          <template #label>
            <div class="flex items-center gap-2">
              <span>允许规则</span>
              <Tooltip v-if="isListInherited('allow')" content="继承自低优先级作用域">
                <Badge variant="subtle">已继承</Badge>
              </Tooltip>
            </div>
          </template>
          <template #bottom>
            <div class="perm-rules-container">
              <div
                v-for="(rule, index) in scopeAllowRules"
                :key="'allow-scope-' + index"
                class="perm-pill perm-pill--allow"
              >
                <span>{{ rule }}</span>
                <button class="perm-pill-remove" @click="removeScopeRule('allow', index)">
                  <span class="codicon codicon-close" />
                </button>
              </div>
              <Tooltip v-for="(rule, index) in inheritedAllowRules" :key="'allow-inh-' + index" content="已继承 — 从源作用域移除以更改">
                <div class="perm-pill perm-pill--allow perm-pill--inherited">
                  <span>{{ rule }}</span>
                </div>
              </Tooltip>
              <TextInput
                v-model="newAllowRule"
                placeholder="例如 Bash(npm run *)"
                size="small"
                monospace
                class="perm-rule-input"
                @keydown.enter.prevent="addRule('allow', newAllowRule); newAllowRule = ''"
              />
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Section 3: Additional Directories -->
    <SettingsSection title="额外目录">
      <SettingsSubSection caption="要包含在权限范围内的额外目录，允许 YwCoder 访问项目根目录之外的文件。">
        <SettingsCell label="目录" description="额外允许目录的路径">
          <template #label>
            <div class="flex items-center gap-2">
              <span>目录</span>
              <Tooltip v-if="isListInherited('additionalDirectories')" content="继承自低优先级作用域">
                <Badge variant="subtle">已继承</Badge>
              </Tooltip>
            </div>
          </template>
          <template #bottom>
            <div class="perm-rules-container">
              <div
                v-for="(dir, index) in scopeAdditionalDirs"
                :key="'dir-scope-' + index"
                class="perm-pill perm-pill--dir"
              >
                <span>{{ dir }}</span>
                <button class="perm-pill-remove" @click="removeScopeDir(index)">
                  <span class="codicon codicon-close" />
                </button>
              </div>
              <Tooltip v-for="(dir, index) in inheritedAdditionalDirs" :key="'dir-inh-' + index" content="已继承 — 从源作用域移除以更改">
                <div class="perm-pill perm-pill--dir perm-pill--inherited">
                  <span>{{ dir }}</span>
                </div>
              </Tooltip>
              <TextInput
                v-model="newDir"
                placeholder="例如 ~/docs, ../shared"
                size="small"
                monospace
                class="perm-rule-input"
                @keydown.enter.prevent="addDir"
              />
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>
  </SettingsTab>
</template>

<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue';
import SettingsTab from '../SettingsTab.vue';
import SettingsSection from '../SettingsSection.vue';
import SettingsSubSection from '../SettingsSubSection.vue';
import SettingsCell from '../SettingsCell.vue';
import Badge from '../../Common/Badge.vue';
import Dropdown from '../../Common/Dropdown.vue';
import TextInput from '../../Common/TextInput.vue';
import Tooltip from '../../Common/Tooltip.vue';
import { useSettingsStore } from '../../../composables/useSettingsStore';
import { useSettingsScope } from '../../../composables/useSettingsScope';

const { settings, activeProfile, inspect, updateSetting } = useSettingsStore();
const scope = useSettingsScope();

// ── Types ──

interface PermissionsConfig {
  allow?: string[];
  deny?: string[];
  ask?: string[];
  defaultMode?: string;
  additionalDirectories?: string[];
  disableBypassPermissionsMode?: string;
}

// ── Scope-aware computed ──

// Permissions at the current editing scope only (profile layer when active)
const scopePermissions = computed<PermissionsConfig>(() => {
  void settings.value;
  const meta = inspect('permissions');
  const values = meta?.values || {};
  if (activeProfile.value && scope.value === 'global') {
    return (values.profile as PermissionsConfig) || {};
  }
  return (values[scope.value] as PermissionsConfig) || {};
});

// Effective permissions (merged from all layers)
const effectivePermissions = computed<PermissionsConfig>(() => {
  const val = settings.value?.permissions;
  return (val && typeof val === 'object' ? val : {}) as PermissionsConfig;
});

// ── Default Mode ──

const defaultModeOptions = [
  { label: '默认', value: 'default', description: '首次使用时提示' },
  { label: '接受编辑', value: 'acceptEdits', description: '自动接受文件编辑' },
  { label: '规划模式', value: 'plan', description: '只读，不做修改' },
  { label: '委托模式', value: 'delegate', description: '仅用于代理团队协调' },
  { label: '不再询问', value: 'dontAsk', description: '除非预先批准，否则自动拒绝' },
  { label: '绕过权限', value: 'bypassPermissions', description: '跳过所有提示（仅隔离环境）' },
];

const defaultMode = computed(() => effectivePermissions.value.defaultMode || 'default');

const isModeInherited = computed(() => {
  return scopePermissions.value.defaultMode === undefined
    && effectivePermissions.value.defaultMode !== undefined;
});

const isModeOverridden = computed(() => {
  void settings.value;
  const meta = inspect('permissions');
  const values = meta?.values || {};
  if (scope.value === 'global') {
    const local = values.local as PermissionsConfig | undefined;
    const shared = values.shared as PermissionsConfig | undefined;
    if (local?.defaultMode !== undefined) return true;
    if (shared?.defaultMode !== undefined) return true;
  } else if (scope.value === 'shared') {
    const local = values.local as PermissionsConfig | undefined;
    if (local?.defaultMode !== undefined) return true;
  }
  return false;
});

const SCOPE_MAP: Record<string, string> = { global: '用户', shared: '工作区', local: '本地' };

const modeOverriddenByLabel = computed(() => {
  void settings.value;
  const meta = inspect('permissions');
  const values = meta?.values || {};
  if (scope.value === 'global') {
    if ((values.local as PermissionsConfig)?.defaultMode !== undefined) return SCOPE_MAP.local;
    if ((values.shared as PermissionsConfig)?.defaultMode !== undefined) return SCOPE_MAP.shared;
  } else if (scope.value === 'shared') {
    if ((values.local as PermissionsConfig)?.defaultMode !== undefined) return SCOPE_MAP.local;
  }
  return '';
});

function updateDefaultMode(val: string) {
  const current = { ...scopePermissions.value };
  if (val === 'default') {
    delete current.defaultMode;
  } else {
    current.defaultMode = val;
  }
  savePermissions(current);
}

// Managed: disableBypassPermissionsMode
const bypassDisabledByManaged = computed(() => {
  void settings.value;
  const meta = inspect('permissions');
  const managed = (meta?.values?.managed as PermissionsConfig) || {};
  return managed.disableBypassPermissionsMode === 'disable';
});

// ── Rule Lists (scope-separated) ──

// Rules that exist at the current editing scope (editable)
const scopeAllowRules = computed(() => scopePermissions.value.allow || []);
const scopeDenyRules = computed(() => scopePermissions.value.deny || []);
const scopeAskRules = computed(() => scopePermissions.value.ask || []);
const scopeAdditionalDirs = computed(() => scopePermissions.value.additionalDirectories || []);

// Rules that exist in the effective value but NOT in the current scope (inherited, read-only)
const inheritedAllowRules = computed(() => {
  const effective = effectivePermissions.value.allow || [];
  const scopeSet = new Set(scopeAllowRules.value);
  return effective.filter(r => !scopeSet.has(r));
});

const inheritedDenyRules = computed(() => {
  const effective = effectivePermissions.value.deny || [];
  const scopeSet = new Set(scopeDenyRules.value);
  return effective.filter(r => !scopeSet.has(r));
});

const inheritedAskRules = computed(() => {
  const effective = effectivePermissions.value.ask || [];
  const scopeSet = new Set(scopeAskRules.value);
  return effective.filter(r => !scopeSet.has(r));
});

const inheritedAdditionalDirs = computed(() => {
  const effective = effectivePermissions.value.additionalDirectories || [];
  const scopeSet = new Set(scopeAdditionalDirs.value);
  return effective.filter(d => !scopeSet.has(d));
});

// Inherited detection per list
function isListInherited(prop: 'allow' | 'deny' | 'ask' | 'additionalDirectories'): boolean {
  const scopeArr = scopePermissions.value[prop];
  const effectiveArr = effectivePermissions.value[prop];
  return (!scopeArr || scopeArr.length === 0) && !!effectiveArr && effectiveArr.length > 0;
}

// ── Input refs ──

const newAllowRule = ref('');
const newDenyRule = ref('');
const newAskRule = ref('');
const newDir = ref('');

// ── CRUD operations ──

function savePermissions(config: PermissionsConfig) {
  // Clean up: remove empty arrays and default values for delta-only writes
  const clean: PermissionsConfig = {};
  if (config.allow?.length) clean.allow = config.allow;
  if (config.deny?.length) clean.deny = config.deny;
  if (config.ask?.length) clean.ask = config.ask;
  if (config.defaultMode && config.defaultMode !== 'default') clean.defaultMode = config.defaultMode;
  if (config.additionalDirectories?.length) clean.additionalDirectories = config.additionalDirectories;
  if (config.disableBypassPermissionsMode) clean.disableBypassPermissionsMode = config.disableBypassPermissionsMode;

  updateSetting('permissions', Object.keys(clean).length ? clean : undefined, scope.value);
}

function addRule(type: 'allow' | 'deny' | 'ask', ruleRef: string) {
  const rule = ruleRef.trim();
  if (!rule) return;

  const current = { ...scopePermissions.value };
  const list = [...(current[type] || [])];
  if (list.includes(rule)) return;

  list.push(rule);
  current[type] = list;
  savePermissions(current);
}

function removeScopeRule(type: 'allow' | 'deny' | 'ask', index: number) {
  const current = { ...scopePermissions.value };
  const list = [...(current[type] || [])];
  list.splice(index, 1);
  current[type] = list;
  savePermissions(current);
}

function addDir() {
  const dir = newDir.value.trim();
  if (!dir) return;

  const current = { ...scopePermissions.value };
  const list = [...(current.additionalDirectories || [])];
  if (list.includes(dir)) return;

  list.push(dir);
  current.additionalDirectories = list;
  newDir.value = '';
  savePermissions(current);
}

function removeScopeDir(index: number) {
  const current = { ...scopePermissions.value };
  const list = [...(current.additionalDirectories || [])];
  list.splice(index, 1);
  current.additionalDirectories = list;
  savePermissions(current);
}
</script>

<style scoped>
/* ── Rule list container ── */

.perm-rules-container {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  align-items: center;
}

/* ── Pill base ── */

.perm-pill {
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

.perm-pill--inherited {
  opacity: 0.5;
  cursor: default;
}

/* ── Pill variants ── */

.perm-pill--deny {
  background-color: color-mix(in srgb, var(--cursor-text-red-primary) 12%, transparent);
  color: var(--cursor-text-red-primary);
}

.perm-pill--ask {
  background-color: color-mix(in srgb, var(--cursor-text-yellow-primary) 12%, transparent);
  color: var(--cursor-text-yellow-primary);
}

.perm-pill--allow {
  background-color: color-mix(in srgb, var(--cursor-text-green-primary) 12%, transparent);
  color: var(--cursor-text-green-primary);
}

.perm-pill--dir {
  background-color: var(--cursor-bg-tertiary);
  color: var(--cursor-text-primary);
}

/* ── Pill remove button ── */

.perm-pill-remove {
  all: unset;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.perm-pill-remove:hover {
  opacity: 1;
}

.perm-pill-remove .codicon {
  font-size: 12px;
}

/* ── Add rule input ── */

.perm-rule-input {
  min-width: 160px;
  max-width: 240px;
  flex-shrink: 0;
}

/* ── Inherited cell dimming ── */

.perm-inherited-cell {
  opacity: 0.7;
}
</style>
