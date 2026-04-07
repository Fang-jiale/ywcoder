<template>
  <SettingsTab title="网络">
    <!-- 代理配置 -->
    <SettingsSection title="代理配置">
      <SettingsSubSection>
        <SettingsCell
          v-for="(field, index) in PROXY_FIELDS"
          :key="field.key"
          :description="field.description"
          :divider="index > 0"
          :class="{ 'network-inherited-cell': isInherited(field.key) }"
        >
          <template #label>
            {{ field.label }}
            <Tooltip v-if="isInherited(field.key)" content="继承自低优先级作用域">
              <Badge variant="subtle">已继承</Badge>
            </Tooltip>
          </template>
          <template #trailing>
            <TextInput
              v-model="fieldValues[field.key]"
              :placeholder="field.placeholder"
              @change="updateEnvVar(field.key, $event)"
            />
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- mTLS 认证 -->
    <SettingsSection title="mTLS 认证">
      <SettingsSubSection>
        <SettingsCell
          v-for="(field, index) in MTLS_FIELDS"
          :key="field.key"
          :description="field.description"
          :divider="index > 0"
          :class="{ 'network-inherited-cell': isInherited(field.key) }"
        >
          <template #label>
            {{ field.label }}
            <Tooltip v-if="isInherited(field.key)" content="继承自低优先级作用域">
              <Badge variant="subtle">已继承</Badge>
            </Tooltip>
          </template>
          <template #trailing>
            <TextInput
              v-model="fieldValues[field.key]"
              :type="field.type || 'text'"
              :placeholder="field.placeholder"
              @change="updateEnvVar(field.key, $event)"
            />
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>
  </SettingsTab>
</template>

<script setup lang="ts">
import { reactive, computed, watchEffect } from 'vue';
import SettingsTab from '../SettingsTab.vue';
import SettingsSection from '../SettingsSection.vue';
import SettingsSubSection from '../SettingsSubSection.vue';
import SettingsCell from '../SettingsCell.vue';
import Badge from '../../Common/Badge.vue';
import TextInput from '../../Common/TextInput.vue';
import Tooltip from '../../Common/Tooltip.vue';
import { useSettingsStore } from '../../../composables/useSettingsStore';
import { useSettingsScope } from '../../../composables/useSettingsScope';

const { settings, activeProfile, inspect, updateSetting } = useSettingsStore();
const scope = useSettingsScope();

// ── 字段定义 ──

interface NetworkField {
  key: string;
  label: string;
  description: string;
  placeholder: string;
  type?: 'text' | 'password';
}

const PROXY_FIELDS: NetworkField[] = [
  { key: 'HTTP_PROXY', label: 'HTTP 代理', description: '网络连接的 HTTP 代理服务器', placeholder: 'http://proxy:port' },
  { key: 'HTTPS_PROXY', label: 'HTTPS 代理', description: '网络连接的 HTTPS 代理服务器', placeholder: 'https://proxy:port' },
  { key: 'NO_PROXY', label: '不使用代理', description: '绕过代理的域名和 IP（逗号分隔）', placeholder: 'localhost,127.0.0.1' },
];

const MTLS_FIELDS: NetworkField[] = [
  { key: 'CLAUDE_CODE_CLIENT_CERT', label: '客户端证书', description: 'mTLS 认证的客户端证书文件路径', placeholder: '/path/to/cert.pem' },
  { key: 'CLAUDE_CODE_CLIENT_KEY', label: '客户端密钥', description: 'mTLS 认证的客户端私钥文件路径', placeholder: '/path/to/key.pem' },
  { key: 'CLAUDE_CODE_CLIENT_KEY_PASSPHRASE', label: '密钥密码', description: '加密客户端密钥的密码（可选）', placeholder: '********', type: 'password' },
];

const ALL_KEYS = [...PROXY_FIELDS, ...MTLS_FIELDS].map(f => f.key);

// ── 作用域感知响应式数据 ──

// 仅当前编辑作用域的环境变量（激活配置文件时为配置文件层）
const scopeEnv = computed<Record<string, string>>(() => {
  void settings.value;
  const meta = inspect('env');
  const values = meta?.values || {};
  if (activeProfile.value && scope.value === 'global') {
    return (values.profile as Record<string, string>) || {};
  }
  return (values[scope.value] as Record<string, string>) || {};
});

// 有效的环境变量（从所有层深度合并）
const effectiveEnv = computed<Record<string, string>>(() => {
  const val = settings.value?.env;
  return (val && typeof val === 'object' ? val : {}) as Record<string, string>;
});

// ── 字段值（响应式，随作用域/设置变化同步） ──

const fieldValues = reactive<Record<string, string>>({});

watchEffect(() => {
  const env = effectiveEnv.value;
  for (const key of ALL_KEYS) {
    fieldValues[key] = env[key] || '';
  }
});

// ── 继承检测 ──

function isInherited(key: string): boolean {
  // 当字段具有有效值但该值未在当前编辑作用域中设置时，该字段为"继承"
  return !!effectiveEnv.value[key] && !(key in scopeEnv.value);
}

// ── 写入处理程序 ──

const updateEnvVar = (key: string, value: string) => {
  // 仅写入作用域特定的环境变量（激活配置文件时仅配置文件）
  // 以避免用继承的环境变量污染配置文件
  const env: Record<string, string> = { ...scopeEnv.value };
  if (value) {
    env[key] = value;
  } else {
    delete env[key];
  }
  updateSetting('env', env, scope.value);
};
</script>

<style scoped>
.network-inherited-cell {
  opacity: 0.7;
}
</style>
