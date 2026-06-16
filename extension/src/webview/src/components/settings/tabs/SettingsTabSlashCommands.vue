<template>
  <SettingsTab title="斜杠命令">
    <SettingsSection>
      <SettingsCell label="自定义命令">
        <template #description> 管理自定义斜杠命令 (.ywcoder/commands) </template>
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
