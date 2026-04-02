<template>
  <div class="empty-state-content">
    <ClawdIcon class="empty-mascot" />
    <p class="empty-state-message">{{ currentTip }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import ClawdIcon from './ClawdIcon.vue';

interface Props {
  platform: string;
}

const props = defineProps<Props>();

const tips = computed(() => {
  const platformKey = props.platform === 'windows' ? 'Alt' : 'Option';
  return [
    '不知道从哪里开始？可以询问关于代码库的问题，或者我们一起开始写代码。',
    "准备好编程了吗？\n让我们一起写些值得部署的代码。",
    '输入 /model 选择适合当前任务的模型。',
    '创建一个 CLAUDE.md 文件，Claude 每次都会读取其中的指令。',
    "厌倦了重复说明？使用 CLAUDE.md 告诉 Claude 记住你告诉过它的事情。",
    '按 Shift + Tab 自动批准代码编辑。',
    `高亮选中文本后按 ${platformKey} + K 开始讨论。`,
    '使用规划模式在提交前讨论重大变更。按 Shift + Tab 在模式间切换。',
    "一个人的代码可能是另一个人的宝贝。",
    "今天是个使用电脑的好日子，你不觉得吗？",
    "你来到绝对正确的地方了！",
    '在终端中使用 Kimi 配置 MCP 服务器。\n它们在这里也能正常工作！'
  ];
});

const currentTip = ref(tips.value[0]);

onMounted(() => {
  // 随机选择一条提示
  const index = Math.floor(Math.random() * tips.value.length);
  currentTip.value = tips.value[index];
});
</script>

<style scoped>
.empty-state-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px 16px;
}

.empty-mascot {
  width: 47px;
  height: 38px;
}

.empty-state-message {
  margin: 0;
  padding: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--vscode-descriptionForeground);
  text-align: center;
  white-space: pre-line;
  max-width: 400px;
}
</style>
