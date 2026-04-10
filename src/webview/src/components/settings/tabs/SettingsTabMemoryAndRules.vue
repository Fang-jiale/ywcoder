<template>
  <SettingsTab title="记忆与规则">
    <!-- CLAUDE.md 文件部分 -->
    <SettingsSection title="记忆文件 (CLAUDE.md)">
      <SettingsSubSection>
        <SettingsCell label="用户记忆" description="为所有项目加载的个人指令">
          <template #trailing>
            <Button variant="tertiary" size="small" @click="openConfigFile('user-claude-md')">
              <span class="codicon codicon-edit" style="font-size: 12px; margin-right: 4px"></span>
              编辑
            </Button>
          </template>
          <template #bottom>
            <div class="text-xs text-(--cursor-text-tertiary) mt-1">
              <code>~/.claude/CLAUDE.md</code>
            </div>
          </template>
        </SettingsCell>

        <SettingsCell label="项目记忆" description="与团队共享的特定项目指令" :divider="true">
          <template #trailing>
            <Button variant="tertiary" size="small" @click="openConfigFile('project-claude-md')">
              <span class="codicon codicon-edit" style="font-size: 12px; margin-right: 4px"></span>
              编辑
            </Button>
          </template>
          <template #bottom>
            <div class="text-xs text-(--cursor-text-tertiary) mt-1">
              <code>.claude/CLAUDE.md</code>（已纳入版本控制）
            </div>
          </template>
        </SettingsCell>

        <SettingsCell label="本地项目记忆" description="个人项目特定指令（不提交）" :divider="true">
          <template #trailing>
            <Button variant="tertiary" size="small" @click="openConfigFile('local-claude-md')">
              <span class="codicon codicon-edit" style="font-size: 12px; margin-right: 4px"></span>
              编辑
            </Button>
          </template>
          <template #bottom>
            <div class="text-xs text-(--cursor-text-tertiary) mt-1">
              <code>.claude/CLAUDE.local.md</code>（被 git 忽略）
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- 自定义代理部分 -->
    <SettingsSection title="自定义代理">
      <SettingsSubSection>
        <SettingsCell label="用户代理" description="跨所有项目可用的个人子代理">
          <template #trailing>
            <Button variant="tertiary" size="small" @click="openConfigFile('user-agents')">
              <span class="codicon codicon-folder-opened" style="font-size: 12px; margin-right: 4px"></span>
              打开
            </Button>
          </template>
          <template #bottom>
            <div class="text-xs text-(--cursor-text-tertiary) mt-1">
              <code>~/.claude/agents/</code>
            </div>
          </template>
        </SettingsCell>

        <SettingsCell label="项目代理" description="与团队共享的特定项目子代理" :divider="true">
          <template #trailing>
            <Button variant="tertiary" size="small" @click="openConfigFile('project-agents')">
              <span class="codicon codicon-folder-opened" style="font-size: 12px; margin-right: 4px"></span>
              打开
            </Button>
          </template>
          <template #bottom>
            <div class="text-xs text-(--cursor-text-tertiary) mt-1">
              <code>.claude/agents/</code>
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>

    <!-- 公司公告部分 -->
    <SettingsSection title="公司公告">
      <SettingsSubSection>
        <SettingsCell label="公告" description="启动时向用户显示的消息（在 settings.json 中管理）">
          <template #bottom>
            <div class="flex flex-wrap gap-2 mt-2">
              <div
                v-for="(announcement, index) in announcements"
                :key="index"
                class="flex items-start gap-2 p-2 bg-(--cursor-bg-tertiary) rounded text-xs w-full"
              >
                <span class="flex-1">{{ announcement }}</span>
                <button
                  class="hover:text-(--cursor-text-red-primary) transition-colors flex-shrink-0"
                  @click="removeAnnouncement(index)"
                >
                  <span class="codicon codicon-close"></span>
                </button>
              </div>
              <TextInput
                v-model="newAnnouncement"
                placeholder="添加公告..."
                class="w-full"
                @keydown.enter="addAnnouncement"
              />
            </div>
          </template>
        </SettingsCell>
      </SettingsSubSection>
    </SettingsSection>
  </SettingsTab>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import SettingsTab from '../SettingsTab.vue';
import SettingsSection from '../SettingsSection.vue';
import SettingsSubSection from '../SettingsSubSection.vue';
import SettingsCell from '../SettingsCell.vue';
import Button from '../../Common/Button.vue';
import TextInput from '../../Common/TextInput.vue';
import { useSettingsStore } from '../../../composables/useSettingsStore';
import { transport } from '../../../core/runtimeTransport';

const { settings, updateSetting } = useSettingsStore();

const announcements = ref<string[]>([]);
const newAnnouncement = ref('');

onMounted(() => {
  announcements.value = settings.value?.companyAnnouncements || [];
});

const openConfigFile = (configType: string) => {
  transport.openConfigFile(configType);
};

const addAnnouncement = () => {
  const text = newAnnouncement.value.trim();
  if (text && !announcements.value.includes(text)) {
    announcements.value.push(text);
    newAnnouncement.value = '';
    updateSetting('companyAnnouncements', announcements.value, 'global');
  }
};

const removeAnnouncement = (index: number) => {
  announcements.value.splice(index, 1);
  updateSetting('companyAnnouncements', announcements.value, 'global');
};
</script>

<style scoped>
/* TextInput 通过 Common/TextInput.vue 处理所有样式 */
</style>
