<template>
  <div class="ask-user-question">
    <div v-if="header" class="header-row">
      <span class="header-chip">{{ header }}</span>
    </div>

    <div v-for="(q, qi) in questions" :key="qi" class="question-block">
      <div class="question-text">{{ q.question }}</div>
      <div class="options">
        <button
          v-for="(opt, oi) in q.options"
          :key="oi"
          type="button"
          class="option-btn"
          :class="{ selected: isSelected(q.question, opt.label) }"
          @click="toggleOption(q.question, opt.label, !!q.multiSelect)"
        >
          <span class="option-marker">{{ q.multiSelect ? '☑' : '◉' }}</span>
          <span class="option-body">
            <span class="option-label">{{ opt.label }}</span>
            <span v-if="opt.description" class="option-desc">{{ opt.description }}</span>
          </span>
        </button>

        <button
          type="button"
          class="option-btn"
          :class="{ selected: isOtherSelected(q.question) }"
          @click="selectOther(q.question)"
        >
          <span class="option-marker">{{ q.multiSelect ? '☑' : '◉' }}</span>
          <span class="option-body">
            <span class="option-label">Other…</span>
            <input
              v-if="isOtherSelected(q.question)"
              class="other-input"
              type="text"
              v-model="otherText[q.question]"
              @click.stop
              placeholder="自定义答案"
            />
          </span>
        </button>
      </div>
    </div>

    <div class="actions">
      <button
        type="button"
        class="btn primary"
        :disabled="!allAnswered"
        @click="handleSubmit"
      >
        提交
      </button>
      <button type="button" class="btn" @click="handleCancel">取消</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { PermissionRequest } from '../core/PermissionRequest';

interface Option {
  label: string;
  description?: string;
}
interface Question {
  question: string;
  multiSelect?: boolean;
  options: Option[];
}

interface Props {
  request: PermissionRequest;
  onResolve: (request: PermissionRequest, allow: boolean) => void;
}

const props = defineProps<Props>();

const header = computed(() => String(props.request.inputs.header ?? ''));
const questions = computed<Question[]>(() => {
  const raw = props.request.inputs.questions;
  if (!Array.isArray(raw)) return [];
  return raw as Question[];
});

const selected = ref<Record<string, string[]>>({});
const otherText = ref<Record<string, string>>({});
const otherSelected = ref<Record<string, boolean>>({});

function isSelected(question: string, label: string): boolean {
  return (selected.value[question] || []).includes(label);
}

function isOtherSelected(question: string): boolean {
  return !!otherSelected.value[question];
}

function toggleOption(question: string, label: string, multiSelect: boolean) {
  otherSelected.value[question] = false;
  const cur = new Set(selected.value[question] || []);
  if (multiSelect) {
    if (cur.has(label)) cur.delete(label);
    else cur.add(label);
  } else {
    cur.clear();
    cur.add(label);
  }
  selected.value = { ...selected.value, [question]: Array.from(cur) };
}

function selectOther(question: string) {
  otherSelected.value = { ...otherSelected.value, [question]: true };
  if (!otherText.value[question]) otherText.value[question] = '';
}

const allAnswered = computed(() => {
  return questions.value.every((q) => {
    if (isOtherSelected(q.question)) return true;
    const arr = selected.value[q.question] || [];
    return arr.length > 0;
  });
});

function handleSubmit() {
  const answers: Record<string, string> = {};
  for (const q of questions.value) {
    if (isOtherSelected(q.question)) {
      answers[q.question] = (otherText.value[q.question] || '').trim() || 'Other';
    } else {
      const arr = selected.value[q.question] || [];
      answers[q.question] = arr.join(',');
    }
  }
  props.request.accept({ ...props.request.inputs, answers });
}

function handleCancel() {
  props.request.reject('用户取消了此次提问', false);
}
</script>

<style scoped>
.ask-user-question {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 8px;
  padding: 12px 16px;
  margin: 8px 16px 12px;
}

.header-row {
  display: flex;
  align-items: center;
}

.header-chip {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  border-radius: 10px;
}

.question-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.question-text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--vscode-foreground);
}

.options {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.option-btn {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  text-align: left;
  padding: 6px 10px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: 1px solid var(--vscode-button-border);
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  font-size: 12px;
}

.option-btn:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.option-btn.selected {
  border-color: var(--vscode-focusBorder);
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

.option-marker {
  font-size: 12px;
  line-height: 1.4;
  flex-shrink: 0;
}

.option-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.option-label {
  font-weight: 500;
}

.option-desc {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  line-height: 1.4;
}

.other-input {
  margin-top: 4px;
  padding: 4px 6px;
  font-size: 12px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 3px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.other-input:focus {
  border-color: var(--vscode-focusBorder);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.btn {
  padding: 4px 14px;
  font-size: 12px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: 1px solid var(--vscode-button-border);
  border-radius: 4px;
  cursor: pointer;
}

.btn:hover:not(:disabled) {
  background: var(--vscode-button-secondaryHoverBackground);
}

.btn.primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.btn.primary:hover:not(:disabled) {
  background: var(--vscode-button-hoverBackground);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
