<template>
  <div class="text-block" @click="handleClick">
    <div :class="markdownClasses" v-html="renderedMarkdown"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useThrottleFn } from '@vueuse/core';
import type { TextBlock as TextBlockType } from '../../../models/ContentBlock';
import type { ToolContext } from '../../../types/tool';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import sql from 'highlight.js/lib/languages/sql';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import cpp from 'highlight.js/lib/languages/cpp';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('java', java);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c', cpp);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('markdown', markdown);

// 自定义 renderer：代码块加高亮、语言标签、copy 按钮
const renderer = new marked.Renderer();
renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
  const highlighted = hljs.highlight(text, { language }).value;
  return `<div class="code-block-wrapper" data-lang="${language}">
    <div class="code-header">
      <span class="code-lang">${language}</span>
      <button class="code-copy-btn" type="button">Copy</button>
    </div>
    <pre><code class="hljs language-${language}">${highlighted}</code></pre>
  </div>`;
};

marked.setOptions({
  gfm: true,
  breaks: true,
  renderer,
});

interface Props {
  block: TextBlockType;
  context?: ToolContext;
}

const props = defineProps<Props>();

const markdownClasses = computed(() => {
  const classes = ['markdown-content'];
  if (props.block.isSlashCommand) {
    classes.push('slash-command-text');
  }
  return classes;
});

function sanitizeHtml(html: string): string {
  // 保留 code-block-wrapper 结构，允许 button 和 data-lang
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_ATTR: ['class', 'data-lang', 'type'],
  });
}

const renderedMarkdown = ref('');
const lastParsedText = ref('');

function parseMarkdown(): void {
  const text = props.block.text ?? '';
  if (text === lastParsedText.value) return;
  const rawHtml = marked.parse(text) as string;
  renderedMarkdown.value = sanitizeHtml(rawHtml);
  lastParsedText.value = text;
}

const throttledParse = useThrottleFn(parseMarkdown, 150, true, false);

watch(() => props.block.text, () => {
  const text = props.block.text ?? '';
  if (text.length < 200 || text.length - lastParsedText.value.length > 200) {
    parseMarkdown();
  } else {
    throttledParse();
  }
});

parseMarkdown();

// 事件委托：处理代码块 copy 按钮点击
function handleClick(e: MouseEvent) {
  const btn = (e.target as HTMLElement).closest('.code-copy-btn') as HTMLButtonElement | null;
  if (!btn) return;

  const wrapper = btn.closest('.code-block-wrapper');
  const codeEl = wrapper?.querySelector('code');
  if (!codeEl) return;

  const text = codeEl.textContent || '';
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = original;
    }, 2000);
  }).catch(() => {
    // 降级：手动复制
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}
</script>

<style scoped>
.text-block {
  margin: 0;
  padding: 0px 2px;
}

.markdown-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--vscode-editor-foreground);
  word-wrap: break-word;
  user-select: text;
}

.slash-command-text {
  color: var(--vscode-textLink-foreground);
  font-weight: 600;
}

/* Markdown 基础样式 */
.markdown-content :deep(p) {
  margin: 8px 0;
  line-height: 1.6;
}

.markdown-content :deep(code) {
  font-family: var(--vscode-editor-font-family, 'Hack Nerd Font Mono', 'SF Mono', Consolas, 'Courier New', monospace);
  word-break: break-all;
  cursor: default;
}

/* 代码块 wrapper */
.markdown-content :deep(.code-block-wrapper) {
  margin: 8px 0;
  border: 1px solid var(--vscode-panel-border);
  border-radius: 6px;
  overflow: hidden;
  background-color: color-mix(in srgb, var(--vscode-editor-background) 60%, transparent);
}

.markdown-content :deep(.code-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background-color: color-mix(in srgb, var(--vscode-editor-background) 80%, transparent);
  border-bottom: 1px solid var(--vscode-panel-border);
  user-select: none;
}

.markdown-content :deep(.code-lang) {
  font-size: 11px;
  font-weight: 600;
  color: var(--vscode-descriptionForeground);
  text-transform: uppercase;
}

.markdown-content :deep(.code-copy-btn) {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 3px;
  border: 1px solid var(--vscode-panel-border);
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  cursor: pointer;
  transition: background 0.15s ease;
}

.markdown-content :deep(.code-copy-btn:hover) {
  background: var(--vscode-button-secondaryHoverBackground);
}

.markdown-content :deep(pre) {
  margin: 0;
  padding: 12px;
  overflow-x: auto;
  background: none;
  border: none;
}

.markdown-content :deep(pre code) {
  background: none;
  border: none;
  padding: 0;
  font-size: 12px;
  line-height: 1.5;
}

.markdown-content :deep(:not(pre) > code) {
  background-color: color-mix(in srgb, var(--vscode-editor-background) 50%, transparent);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 3px;
  padding: 2px 4px;
  font-size: 0.9em;
}

.markdown-content :deep(a) {
  color: var(--vscode-textLink-foreground);
  text-decoration: none;
}

.markdown-content :deep(a:hover) {
  color: var(--vscode-textLink-activeForeground);
  text-decoration: underline;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0px 0px 0px 16px;
  padding: 0px;
}

.markdown-content :deep(li) {
  padding-top: 2px;
  padding-bottom: 2px;
  list-style-type: disc;
}

.markdown-content :deep(blockquote) {
  border-left: 4px solid var(--vscode-textBlockQuote-border);
  background-color: var(--vscode-textBlockQuote-background);
  margin: 8px 0;
  padding: 8px 16px;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  color: var(--vscode-foreground);
  font-weight: 600;
  margin: 16px 0 8px 0;
  line-height: 1.3;
}

.markdown-content :deep(h1) {
  font-size: 18px;
}

.markdown-content :deep(h2) {
  font-size: 16px;
}

.markdown-content :deep(h3) {
  font-size: 14px;
}

.markdown-content :deep(table) {
  border-collapse: collapse;
  margin: 16px 0;
  width: 100%;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid var(--vscode-panel-border);
  padding: 8px 12px;
  text-align: left;
}

.markdown-content :deep(th) {
  background-color: color-mix(in srgb, var(--vscode-editor-background) 30%, transparent);
  font-weight: 600;
}
</style>
