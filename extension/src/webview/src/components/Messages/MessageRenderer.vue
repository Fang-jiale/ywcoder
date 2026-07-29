<template>
  <div class="message" v-if="!message.isEmpty">
    <MessageCollapsible
      :message="message"
      :collapsed="collapsed"
      :busy="busy"
      @toggle="$emit('toggle')"
    >
      <component
        :is="messageComponent"
        :message="message"
        :context="context"
      />
    </MessageCollapsible>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Message } from '../../models/Message';
import type { ToolContext } from '../../types/tool';
import MessageCollapsible from './MessageCollapsible.vue';
import UserMessage from './UserMessage.vue';
import AssistantMessage from './AssistantMessage.vue';
import SystemMessage from './SystemMessage.vue';
import TipMessage from './TipMessage.vue';
import SlashCommandResultMessage from './SlashCommandResultMessage.vue';

interface Props {
  message: Message;
  context: ToolContext;
  collapsed?: boolean;
  busy?: boolean;
}

const props = defineProps<Props>();
defineEmits<{
  (e: 'toggle'): void;
}>();

const messageComponent = computed(() => {
  switch (props.message.type) {
    case 'user':
      return UserMessage;
    case 'assistant':
      return AssistantMessage;
    case 'tip':
      return TipMessage;
    case 'slash_command_result':
      return SlashCommandResultMessage;
    case 'system':
      return SystemMessage;
    default:
      return null;
  }
});
</script>

<style scoped>
  .message {
    margin-bottom: 4px;
  }
</style>
