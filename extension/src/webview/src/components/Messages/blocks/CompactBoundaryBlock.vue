<template>
  <div class="compact-boundary">
    <span class="compact-icon">⤵</span>
    <span class="compact-text">{{ block.message }}</span>
  </div>
</template>

<script setup lang="ts">
import type { CompactBoundaryBlock } from '../../../models/ContentBlock';

interface Props {
  block: CompactBoundaryBlock;
}

defineProps<Props>();
</script>

<style scoped>
.compact-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 12px 16px;
  padding: 6px 12px;
  border-radius: 4px;
  background-color: var(--vscode-editor-inactiveSelectionBackground, rgba(128, 128, 128, 0.15));
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  line-height: 1.4;
  user-select: none;
}

.compact-icon {
  font-size: 10px;
  opacity: 0.8;
}

.compact-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
