<template>
  <SettingsTab title="沙箱">
    <!-- Sandbox Isolation Section -->
    <SettingsSection title="沙盒隔离">
      <SettingsSubSection>
        <SettingsCell label="启用沙盒" description="在沙盒中隔离 Bash 命令以增强安全性（仅限 macOS/Linux）">
          <template #trailing>
            <Switch v-model="sandboxEnabled" />
          </template>
        </SettingsCell>

        <SettingsCell
          label="沙盒启用时自动批准 Bash"
          description="沙盒启用时自动批准 Bash 命令"
          :divider="true"
        >
          <template #trailing>
            <Switch v-model="autoAllowBash" :disabled="!sandboxEnabled" />
          </template>
        </SettingsCell>

        <SettingsCell
          label="允许非沙盒命令"
          description="允许通过 dangerouslyDisableSandbox 参数在沙盒外运行命令"
          :divider="true"
        >
          <template #trailing>
            <Switch v-model="allowUnsandboxed" :disabled="!sandboxEnabled" />
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Excluded Commands Section -->
    <SettingsSection title="排除的命令">
      <SettingsSubSection>
        <SettingsCell label="在沙盒外运行的命令" description="应始终在沙盒外运行的命令（例如 docker、git）">
          <template #bottom>
            <div class="flex flex-wrap gap-2 mt-2">
              <div
                v-for="(cmd, index) in excludedCommands"
                :key="index"
                class="inline-flex items-center gap-1 px-2 py-1 bg-(--cursor-bg-tertiary) rounded text-xs"
              >
                <span>{{ cmd }}</span>
                <button
                  class="hover:text-(--cursor-text-red-primary) transition-colors"
                  @click="removeExcludedCommand(index)"
                >
                  <span class="codicon codicon-close"></span>
                </button>
              </div>
              <TextInput
                v-model="newCommand"
                placeholder="添加命令..."
                @keydown.enter="addExcludedCommand"
              />
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Network Configuration Section -->
    <SettingsSection title="网络配置">
      <SettingsSubSection>
        <SettingsCell label="允许本地绑定" description="允许沙盒命令绑定到本地主机端口（仅限 macOS）">
          <template #trailing>
            <Switch v-model="allowLocalBinding" :disabled="!sandboxEnabled" />
          </template>
        </SettingsCell>

        <SettingsCell
          label="允许的 Unix 套接字"
          description="沙盒命令可以访问的 Unix 套接字路径（例如 SSH 代理）"
          :divider="true"
        >
          <template #bottom>
            <div class="flex flex-wrap gap-2 mt-2">
              <div
                v-for="(socket, index) in allowedUnixSockets"
                :key="index"
                class="inline-flex items-center gap-1 px-2 py-1 bg-(--cursor-bg-tertiary) rounded text-xs font-mono"
              >
                <span>{{ socket }}</span>
                <button
                  class="hover:text-(--cursor-text-red-primary) transition-colors"
                  @click="removeUnixSocket(index)"
                >
                  <span class="codicon codicon-close"></span>
                </button>
              </div>
              <TextInput
                v-model="newSocket"
                placeholder="添加套接字路径..."
                monospace
                @keydown.enter="addUnixSocket"
              />
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- Proxy Configuration Section -->
    <SettingsSection title="代理配置">
      <SettingsSubSection>
        <SettingsCell label="HTTP 代理端口" description="沙盒网络访问的自定义 HTTP 代理端口">
          <template #trailing>
            <NumberInput
              :model-value="httpProxyPort ?? 0"
              @update:model-value="httpProxyPort = $event || undefined"
              :min="0"
              :max="65535"
              width="68px"
              :disabled="!sandboxEnabled"
            />
          </template>
        </SettingsCell>

        <SettingsCell label="SOCKS 代理端口" description="沙盒网络访问的自定义 SOCKS5 代理端口" :divider="true">
          <template #trailing>
            <NumberInput
              :model-value="socksProxyPort ?? 0"
              @update:model-value="socksProxyPort = $event || undefined"
              :min="0"
              :max="65535"
              width="68px"
              :disabled="!sandboxEnabled"
            />
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>
  </SettingsTab>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import SettingsTab from '../SettingsTab.vue';
import SettingsSection from '../SettingsSection.vue';
import SettingsSubSection from '../SettingsSubSection.vue';
import SettingsCell from '../SettingsCell.vue';
import Switch from '../../Common/Switch.vue';
import NumberInput from '../../Common/NumberInput.vue';
import TextInput from '../../Common/TextInput.vue';
import { useSettingsStore } from '../../../composables/useSettingsStore';

const { settings, updateSetting } = useSettingsStore();

// Sandbox settings
const sandboxEnabled = ref(false);
const autoAllowBash = ref(true);
const allowUnsandboxed = ref(true);
const excludedCommands = ref<string[]>([]);
const newCommand = ref('');

// Network settings
const allowLocalBinding = ref(false);
const allowedUnixSockets = ref<string[]>([]);
const newSocket = ref('');
const httpProxyPort = ref<number | undefined>(undefined);
const socksProxyPort = ref<number | undefined>(undefined);

// Load settings on mount
onMounted(() => {
  const sandbox = settings.value?.sandbox || {};
  sandboxEnabled.value = sandbox.enabled ?? false;
  autoAllowBash.value = sandbox.autoAllowBashIfSandboxed ?? true;
  allowUnsandboxed.value = sandbox.allowUnsandboxedCommands ?? true;
  excludedCommands.value = sandbox.excludedCommands ?? [];

  const network = sandbox.network || {};
  allowLocalBinding.value = network.allowLocalBinding ?? false;
  allowedUnixSockets.value = network.allowUnixSockets ?? [];
  httpProxyPort.value = network.httpProxyPort;
  socksProxyPort.value = network.socksProxyPort;
});

// Watch and save changes
watch(sandboxEnabled, (val) => {
  updateSetting('sandbox', { ...getSandboxConfig(), enabled: val });
});

watch(autoAllowBash, (val) => {
  updateSetting('sandbox', { ...getSandboxConfig(), autoAllowBashIfSandboxed: val });
});

watch(allowUnsandboxed, (val) => {
  updateSetting('sandbox', { ...getSandboxConfig(), allowUnsandboxedCommands: val });
});

watch(allowLocalBinding, (val) => {
  const sandbox = getSandboxConfig();
  sandbox.network = { ...sandbox.network, allowLocalBinding: val };
  updateSetting('sandbox', sandbox);
});

watch(httpProxyPort, (val) => {
  const sandbox = getSandboxConfig();
  sandbox.network = { ...sandbox.network, httpProxyPort: val };
  updateSetting('sandbox', sandbox);
});

watch(socksProxyPort, (val) => {
  const sandbox = getSandboxConfig();
  sandbox.network = { ...sandbox.network, socksProxyPort: val };
  updateSetting('sandbox', sandbox);
});

function getSandboxConfig() {
  return {
    enabled: sandboxEnabled.value,
    autoAllowBashIfSandboxed: autoAllowBash.value,
    allowUnsandboxedCommands: allowUnsandboxed.value,
    excludedCommands: excludedCommands.value,
    network: {
      allowLocalBinding: allowLocalBinding.value,
      allowUnixSockets: allowedUnixSockets.value,
      httpProxyPort: httpProxyPort.value,
      socksProxyPort: socksProxyPort.value
    }
  };
}

function addExcludedCommand() {
  const cmd = newCommand.value.trim();
  if (cmd && !excludedCommands.value.includes(cmd)) {
    excludedCommands.value.push(cmd);
    newCommand.value = '';
    updateSetting('sandbox', getSandboxConfig());
  }
}

function removeExcludedCommand(index: number) {
  excludedCommands.value.splice(index, 1);
  updateSetting('sandbox', getSandboxConfig());
}

function addUnixSocket() {
  const socket = newSocket.value.trim();
  if (socket && !allowedUnixSockets.value.includes(socket)) {
    allowedUnixSockets.value.push(socket);
    newSocket.value = '';
    updateSetting('sandbox', getSandboxConfig());
  }
}

function removeUnixSocket(index: number) {
  allowedUnixSockets.value.splice(index, 1);
  updateSetting('sandbox', getSandboxConfig());
}
</script>

<style scoped>
/* TextInput handles all styling via Common/TextInput.vue */
</style>
