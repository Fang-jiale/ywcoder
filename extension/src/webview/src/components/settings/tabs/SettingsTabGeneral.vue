<template>
  <SettingsTab title="通用">
    <!-- 启动默认设置 (Extension Config — Pipeline B) -->
    <SettingsSection title="启动默认设置">
      <SettingsSubSection>
        <SettingsCell
          label="默认权限模式"
          description="新会话的权限模式"
        >
          <template #trailing>
            <Dropdown
              :model-value="defaultPermissionMode"
              @update:model-value="updateExtensionSetting('defaultPermissionMode', $event)"
              :options="permissionModeOptions"
              menu-align="right"
            >
              <template #trigger="{ selected }">
                {{ selected?.label || '默认' }}
              </template>
            </Dropdown>
          </template>
        </SettingsCell>
        <SettingsCell
          label="深度思考"
          description="为新会话启用深度思考"
          :divider="true"
        >
          <template #trailing>
            <div class="cursor-settings-cell-switch-container">
              <Switch
                :model-value="defaultThinkingLevel === 'default_on'"
                @update:model-value="updateExtensionSetting('defaultThinkingLevel', $event ? 'default_on' : 'off')"
                title="深度思考"
              />
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- 界面语言 (已隐藏) -->
    <!--
    <SettingsSection title="界面语言">
      <SettingsSubSection>
        <SettingsCell
          label="界面语言"
          description="YwCoder 界面的显示语言"
        >
          <template #trailing>
            <Dropdown
              :model-value="currentLocale"
              @update:model-value="updateLocale"
              :options="localeOptions"
              menu-align="right"
            >
              <template #trigger="{ selected }">
                {{ selected?.label || '中文' }}
              </template>
            </Dropdown>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>
    -->

    <!-- 语言与输出 (Pipeline A — CC Settings) -->
    <SettingsSection title="语言与输出">
      <SettingsSubSection>
        <SettingsItem
          setting-key="language"
          label="语言"
          description="YwCoder 响应的偏好语言"
        >
          <template #default="{ displayValue, update }">
            <TextInput
              :model-value="displayValue ?? ''"
              @change="update"
              placeholder="例如：中文、英文、日文"
              class="general-input"
            />
          </template>
        </SettingsItem>
        <SettingsItem
          setting-key="outputStyle"
          label="输出风格"
          description="调整 YwCoder 的响应风格"
          :divider="true"
        >
          <template #default="{ displayValue, update }">
            <TextInput
              :model-value="displayValue ?? ''"
              @change="update"
              placeholder="例如：详细解释、简洁明了"
              class="general-input"
            />
          </template>
        </SettingsItem>
      </SettingsSubSection>
    </SettingsSection>

    <!-- 代理行为 -->
    <SettingsSection title="代理行为">
      <SettingsSubSection>
        <SettingsItem
          setting-key="respectGitignore"
          label="遵循 .gitignore"
          description="在上下文中排除符合 .gitignore 模式的文件"
        >
          <template #default="{ effectiveValue, update }">
            <div class="cursor-settings-cell-switch-container">
              <Switch
                :model-value="effectiveValue ?? true"
                @update:model-value="update"
                title="遵循 .gitignore"
              />
            </div>
          </template>
        </SettingsItem>
        <SettingsItem
          setting-key="teammateMode"
          label="队友模式"
          description="并行代理队友的显示方式"
          :divider="true"
        >
          <template #default="{ effectiveValue, update }">
            <Dropdown
              :model-value="effectiveValue ?? 'auto'"
              @update:model-value="update"
              :options="teammateModeOptions"
              menu-align="right"
            >
              <template #trigger="{ selected }">
                {{ selected?.label || effectiveValue || 'Auto' }}
              </template>
            </Dropdown>
          </template>
        </SettingsItem>
        <SettingsItem
          setting-key="plansDirectory"
          label="规划目录"
          description="存储规划文件的相对路径"
          :divider="true"
        >
          <template #default="{ displayValue, update }">
            <TextInput
              :model-value="displayValue ?? ''"
              @change="update"
              placeholder="~/.claude/plans"
              monospace
              class="general-input"
            />
          </template>
        </SettingsItem>
      </SettingsSubSection>
    </SettingsSection>

    <!-- 界面与体验 Section -->
    <!-- TUI-only settings (not applicable to extension, kept for reference):
         spinnerTipsEnabled, terminalProgressBarEnabled, prefersReducedMotion -->
    <SettingsSection title="界面与体验">
      <SettingsSubSection>
        <SettingsItem
          setting-key="showTurnDuration"
          label="显示回合时长"
          description="每次对话后显示响应时间"
        >
          <template #default="{ effectiveValue, update }">
            <div class="cursor-settings-cell-switch-container">
              <Switch
                :model-value="effectiveValue ?? false"
                @update:model-value="update"
                title="显示回合时长"
              />
            </div>
          </template>
        </SettingsItem>
      </SettingsSubSection>
    </SettingsSection>

    <!-- 通知 -->
    <SettingsSection title="通知">
      <SettingsSubSection>
        <SettingsItem
          setting-key="systemNotifications"
          label="系统通知"
          description="代理完成或需要关注时显示系统通知"
        >
          <template #default="{ effectiveValue, update }">
            <div class="cursor-settings-cell-switch-container">
              <Switch
                :model-value="effectiveValue ?? false"
                @update:model-value="update"
                title="系统通知"
              />
            </div>
          </template>
        </SettingsItem>
        <SettingsItem
          setting-key="completionSound"
          label="完成提示音"
          description="代理完成响应时播放提示音"
          :divider="true"
        >
          <template #default="{ effectiveValue, update }">
            <div class="cursor-settings-cell-switch-container">
              <Switch :model-value="effectiveValue ?? false" @update:model-value="update" title="完成提示音" />
            </div>
          </template>
        </SettingsItem>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Git 归属 -->
    <SettingsSection title="Git 归属">
      <SettingsSubSection>
        <SettingsItem
          setting-key="attribution"
          label="提交信息"
          description="YwCoder 提交的 Git 提交信息后追加的文本"
        >
          <template #default="{ displayValue, effectiveValue, update }">
            <TextInput
              :model-value="(displayValue as any)?.commit ?? ''"
              @change="(val: string) => update({ ...(displayValue || effectiveValue || {}), commit: val || undefined })"
              placeholder="由 YwCoder 生成"
              class="general-input"
            />
          </template>
        </SettingsItem>
        <SettingsItem
          setting-key="attribution"
          label="PR 描述"
          description="YwCoder 创建的拉取请求描述后追加的文本"
          :divider="true"
        >
          <template #default="{ displayValue, effectiveValue, update }">
            <TextInput
              :model-value="(displayValue as any)?.pr ?? ''"
              @change="(val: string) => update({ ...(displayValue || effectiveValue || {}), pr: val || undefined })"
              placeholder="由 YwCoder 生成"
              class="general-input"
            />
          </template>
        </SettingsItem>
      </SettingsSubSection>
    </SettingsSection>

    <!-- 聊天记录 -->
    <SettingsSection title="聊天记录">
      <SettingsSubSection>
        <SettingsCell
          label="清理周期"
          description="根据最后活动日期在本地保留聊天记录的时长"
        >
          <template #trailing>
            <div class="flex items-center gap-2">
              <NumberInput
                :model-value="cleanupPeriodDays"
                @update:model-value="updateCleanupPeriod"
                :min="1"
                width="68px"
              />
              <span class="text-xs text-(--cursor-text-secondary)">天</span>
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- 本地 CLI 设置 -->
    <SettingsSection title="本地 CLI 设置">
      <SettingsSubSection caption="使用本地安装的 CLI 替代内置版本">
        <SettingsCell
          label="本地 CLI 路径"
          description="使用本地安装的 YwCoder CLI 替代内置版本"
          :divider="true"
        >
          <template #trailing>
            <TextInput
              :model-value="localClaudeCliPath"
              @change="updateExtensionSetting('localClaudeCliPath', $event)"
              placeholder="~/.local/bin/ywcoder"
              class="general-input"
            />
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- 高级 -->
    <SettingsSection title="高级">
      <SettingsSubSection>
        <SettingsItem
          setting-key="autoUpdatesChannel"
          label="更新通道"
          description="选择稳定版本或最新构建版本"
        >
          <template #default="{ effectiveValue, update }">
            <Dropdown
              :model-value="effectiveValue ?? 'stable'"
              @update:model-value="update"
              :options="updatesChannelOptions"
              menu-align="right"
            >
              <template #trigger="{ selected }">
                {{ selected?.label || effectiveValue || '稳定版' }}
              </template>
            </Dropdown>
          </template>
        </SettingsItem>
        <SettingsItem
          setting-key="forceLoginMethod"
          label="登录方式"
          description="限制使用特定的认证方式"
          :divider="true"
        >
          <template #default="{ effectiveValue, update }">
            <Dropdown
              :model-value="effectiveValue || 'none'"
              @update:model-value="(val: string) => update(val === 'none' ? '' : val)"
              :options="loginMethodOptions"
              menu-align="right"
            >
              <template #trigger="{ selected }">
                {{ selected?.label || '不限制' }}
              </template>
            </Dropdown>
          </template>
        </SettingsItem>
        <SettingsItem
          setting-key="apiKeyHelper"
          label="API 密钥助手"
          description="自定义生成认证令牌的脚本"
          :divider="true"
        >
          <template #default="{ displayValue, update }">
            <TextInput
              :model-value="displayValue ?? ''"
              @change="update"
              placeholder="/path/to/script.sh"
              monospace
              class="general-input"
            />
          </template>
        </SettingsItem>
      </SettingsSubSection>
    </SettingsSection>
  </SettingsTab>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import SettingsTab from '../SettingsTab.vue';
import SettingsSection from '../SettingsSection.vue';
import SettingsSubSection from '../SettingsSubSection.vue';
import SettingsCell from '../SettingsCell.vue';
import SettingsItem from '../SettingsItem.vue';
import Switch from '../../Common/Switch.vue';
import Dropdown from '../../Common/Dropdown.vue';
import TextInput from '../../Common/TextInput.vue';
import NumberInput from '../../Common/NumberInput.vue';
import { useSettingsStore } from '../../../composables/useSettingsStore';
import { transport } from '../../../core/runtimeTransport';
// import { getLocale, setLocale, type Locale } from '../../../locales';

const { settings, updateSetting } = useSettingsStore();

// ── Locale (已隐藏) ──
// const currentLocale = ref<Locale>(getLocale());

// const localeOptions = [
//   { label: '中文', value: 'zh-CN' as Locale },
//   { label: 'English', value: 'en-US' as Locale },
// ];

// async function updateLocale(locale: Locale) {
//   setLocale(locale);
//   currentLocale.value = locale;
//   // Reload webview to apply locale changes
//   try {
//     await transport.sendRequest({ type: "reload_webview" });
//   } catch (e) {
//     console.error('Failed to reload webview:', e);
//   }
// }

// ── Chat History ──
const cleanupPeriodDays = computed(() => settings.value.cleanupPeriodDays ?? 720);
const updateCleanupPeriod = (value: number) => {
  updateSetting('cleanupPeriodDays', value, 'global');
};

// ── Extension Config (Pipeline B — ~/.ywcoder.json) ──
const defaultPermissionMode = ref('default');
const defaultThinkingLevel = ref('default_on');
const localClaudeCliPath = ref('');

onMounted(async () => {
  try {
    const response = await transport.getExtensionConfig();
    if (response?.config) {
      defaultPermissionMode.value = response.config.defaultPermissionMode || 'default';
      defaultThinkingLevel.value = response.config.defaultThinkingLevel || 'default_on';
      localClaudeCliPath.value = response.config.localClaudeCliPath || '';
    }
  } catch (e) {
    console.error('Failed to load extension config:', e);
  }
});

async function updateExtensionSetting(key: string, value: any) {
  try {
    await transport.updateExtensionConfig(key, value);
    switch (key) {
      case 'defaultPermissionMode':
        defaultPermissionMode.value = value;
        break;
      case 'defaultThinkingLevel':
        defaultThinkingLevel.value = value;
        break;
      case 'localClaudeCliPath':
        localClaudeCliPath.value = value;
        break;
    }
  } catch (e) {
    console.error('Failed to update extension config:', e);
  }
}

// ── Dropdown Options ──

const permissionModeOptions = [
  { label: '默认', value: 'default', description: '标准行为，危险操作前提示' },
  { label: '接受编辑', value: 'acceptEdits', description: '自动接受文件编辑' },
  { label: '规划模式', value: 'plan', description: '仅规划，不实际执行' },
  { label: '不再询问', value: 'dontAsk', description: '不提示，未预先批准则拒绝' },
];

const teammateModeOptions = [
  { label: '自动', value: 'auto', description: '自动选择显示模式' },
  { label: '进程中', value: 'in-process', description: '在进程中运行队友' },
  { label: 'Tmux', value: 'tmux', description: '在 tmux 窗格中运行队友' },
];

const updatesChannelOptions = [
  { label: '稳定版', value: 'stable', description: '仅稳定版本' },
  { label: '最新版', value: 'latest', description: '包含预发布版本' },
];

const loginMethodOptions = [
  { label: '不限制', value: 'none', description: '允许任何登录方式' },
  { label: 'YwCoder.ai', value: 'ywcoderai', description: '限制为 YwCoder.ai 账户' },
  { label: '控制台', value: 'console', description: '限制为控制台 API' },
];
</script>

<style scoped>
.general-input {
  width: 200px;
}
</style>
