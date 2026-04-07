<template>
  <SettingsTab title="钩子">
    <SettingsSection>
      <SettingsCell label="生命周期钩子">
        <template #description> 管理生命周期钩子 (.ywcoder/hooks) </template>
        <template #trailing>
          <div class="text-xs text-(--cursor-text-secondary)">即将推出</div>
        </template>
      </SettingsCell>
    </SettingsSection>
  </SettingsTab>
</template>

<script setup lang="ts">
import SettingsTab from '../SettingsTab.vue';
import SettingsSection from '../SettingsSection.vue';
import SettingsCell from '../SettingsCell.vue';
</script>
