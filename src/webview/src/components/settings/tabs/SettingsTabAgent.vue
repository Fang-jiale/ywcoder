<template>
  <SettingsTab title="智能体">
    <!-- Chat History Section -->
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
  </SettingsTab>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SettingsTab from '../SettingsTab.vue';
import SettingsSection from '../SettingsSection.vue';
import SettingsSubSection from '../SettingsSubSection.vue';
import SettingsCell from '../SettingsCell.vue';
import NumberInput from '../../Common/NumberInput.vue';
import { useSettingsStore } from '../../../composables/useSettingsStore';

const { settings, updateSetting } = useSettingsStore();

const cleanupPeriodDays = computed(() => settings.value.cleanupPeriodDays ?? 720);

const updateCleanupPeriod = (value: number) => {
  updateSetting('cleanupPeriodDays', value, 'global');
};
</script>
