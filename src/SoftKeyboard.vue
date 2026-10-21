<script setup lang="ts">
/**
 * vue-touch-ime · 触摸软键盘组件。
 *
 * 页面挂载后由 useSoftKeyboard 的文档级 focusin 自动接管所有文本输入框，
 * 无需逐个接线；大屏/桌面端页面不挂载本组件即完全不受影响。
 *
 * 按键在 pointerdown 就处理并 preventDefault：
 * - 保持输入框焦点（否则输入框的 @blur 提交被提前触发）；
 * - stopPropagation 拦住文档层的「点外部关闭」（下拉、popover）。
 *
 * 拼音模式：字母进候选缓冲，空格/点候选上屏；数字/标点直接上屏。
 * 数字模式：decimal 类型出小数点，digits 类型不出。
 *
 * 主题：在 `.vti-kb` 上覆盖 CSS 变量即可（--vti-accent / --vti-bg /
 * --vti-key-h / --vti-key-radius / --vti-font 等）。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { softKeyboard, type SoftKeyboard } from './useSoftKeyboard'
import type { SoftCandidate } from './ime'

const props = defineProps<{
  /** 自定义键盘实例（缺省用模块单例；多键盘并存时传入 createSoftKeyboard() 的产物） */
  instance?: SoftKeyboard
}>()

// 实例在挂载后不变，setup 期定死即可
const kb = props.instance ?? softKeyboard
const rootRef = ref<HTMLElement | null>(null)
/** 顶层绑定让模板自动解包（kb.candidates 是 ComputedRef，挂在对象上不会解包） */
const candidates = kb.candidates

onMounted(() => kb.attach(rootRef.value))
onBeforeUnmount(() => kb.detach())

/** 保持焦点 + 拦住外部点击判定（默认行为与冒泡都不能放行） */
function swallow(event: Event) {
  event.preventDefault()
  event.stopPropagation()
}

function onKey(event: Event, token: string) {
  swallow(event)
  kb.press(token)
}

function onPick(event: Event, candidate: SoftCandidate) {
  swallow(event)
  kb.pickCandidate(candidate)
}

const LETTER_ROWS: string[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
]

const NUM_ROWS: string[][] = [
  ['7', '8', '9', 'backspace'],
  ['4', '5', '6', '.'],
  ['1', '2', '3', 'mode:back'],
]

function letterLabel(ch: string): string {
  return kb.state.mode === 'en' && kb.state.shift ? ch.toUpperCase() : ch
}

function backLabel(): string {
  return kb.state.prevTextMode === 'zh' ? '拼音' : '英文'
}
</script>

<template>
  <div
    ref="rootRef"
    class="vti-kb"
    :class="{ show: kb.state.visible }"
    @pointerdown="swallow"
    @mousedown="swallow"
    @touchstart="swallow"
    @click="swallow"
    @contextmenu.prevent
  >
    <div class="vti-kb__panel">
      <!-- 编辑回显：拼音缓冲 / 数字草稿（含未落盘的小数点） -->
      <div class="vti-kb__strip">
        <span class="vti-kb__buffer">
          {{ kb.state.mode === "zh" ? kb.state.buffer : kb.state.draft }}
        </span>
        <div v-if="kb.state.mode === 'zh'" class="vti-kb__cands">
          <button
            v-for="(cand, index) in candidates"
            :key="`${cand.consumed}-${cand.text}-${index}`"
            type="button"
            class="vti-kb__cand"
            @pointerdown="onPick($event, cand)"
          >
            {{ cand.text }}
          </button>
          <span v-if="candidates.length === 0" class="vti-kb__hint">候选</span>
        </div>
        <span v-else class="vti-kb__hint">
          {{ kb.state.kind === "text" ? "英文/数字" : kb.state.kind === "decimal" ? "数字 · 小数" : "数字" }}
        </span>
      </div>

      <!-- 字母区（拼音 / 英文） -->
      <template v-if="kb.state.mode !== 'num'">
        <div v-for="(row, ri) in LETTER_ROWS" :key="`l${ri}`" class="vti-kb__row">
          <button
            v-if="ri === 2"
            type="button"
            class="vti-kb__key vti-kb__key--fn"
            :class="{ on: kb.state.shift }"
            @pointerdown="onKey($event, 'shift')"
          >
            ⇧
          </button>
          <button
            v-for="ch in row"
            :key="ch"
            type="button"
            class="vti-kb__key vti-kb__key--letter"
            @pointerdown="onKey($event, ch)"
          >
            {{ letterLabel(ch) }}
          </button>
          <button
            v-if="ri === 2"
            type="button"
            class="vti-kb__key vti-kb__key--fn"
            @pointerdown="onKey($event, 'backspace')"
          >
            退格
          </button>
        </div>
        <div class="vti-kb__row vti-kb__row--last">
          <button
            type="button"
            class="vti-kb__key vti-kb__key--fn"
            @pointerdown="onKey($event, 'mode:num')"
          >
            123
          </button>
          <button
            type="button"
            class="vti-kb__key vti-kb__key--fn"
            @pointerdown="onKey($event, kb.state.mode === 'zh' ? 'mode:en' : 'mode:zh')"
          >
            {{ kb.state.mode === "zh" ? "英" : "拼" }}
          </button>
          <button
            type="button"
            class="vti-kb__key vti-kb__key--space"
            @pointerdown="onKey($event, 'space')"
          >
            空格
          </button>
          <button
            type="button"
            class="vti-kb__key vti-kb__key--fn"
            @pointerdown="onKey($event, kb.state.mode === 'zh' ? '，' : ',')"
          >
            {{ kb.state.mode === "zh" ? "，" : "," }}
          </button>
          <button
            type="button"
            class="vti-kb__key vti-kb__key--fn"
            @pointerdown="onKey($event, kb.state.mode === 'zh' ? '。' : '.')"
          >
            {{ kb.state.mode === "zh" ? "。" : "." }}
          </button>
          <button
            type="button"
            class="vti-kb__key vti-kb__key--done"
            @pointerdown="onKey($event, 'done')"
          >
            完成
          </button>
        </div>
      </template>

      <!-- 数字区（小数 / 整数） -->
      <template v-else>
        <div v-for="(row, ri) in NUM_ROWS" :key="`n${ri}`" class="vti-kb__row vti-kb__row--num">
          <template v-for="ch in row" :key="ch">
            <button
              v-if="ch === '.' && kb.state.kind === 'digits'"
              type="button"
              class="vti-kb__key vti-kb__key--ghost"
              disabled
            >
              ·
            </button>
            <button
              v-else-if="ch === 'mode:back' && kb.state.kind !== 'text'"
              type="button"
              class="vti-kb__key vti-kb__key--ghost"
              disabled
            >
              ·
            </button>
            <button
              v-else
              type="button"
              class="vti-kb__key"
              @pointerdown="onKey($event, ch)"
            >
              {{ ch === "backspace" ? "退格" : ch === "mode:back" ? backLabel() : ch }}
            </button>
          </template>
        </div>
        <div class="vti-kb__row vti-kb__row--num">
          <button
            type="button"
            class="vti-kb__key vti-kb__key--zero"
            @pointerdown="onKey($event, '0')"
          >
            0
          </button>
          <button
            type="button"
            class="vti-kb__key vti-kb__key--done"
            @pointerdown="onKey($event, 'done')"
          >
            完成
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style>
/* 非 scoped：全部规则都锚在 .vti-kb 根类下，主题变量在根类上覆盖即可 */
.vti-kb {
  /* 主题变量（覆盖这些即可换肤） */
  --vti-accent: #3ef2c0;
  --vti-accent-strong: #1d8a6e;
  --vti-bg: rgba(7, 20, 24, 0.97);
  --vti-panel-border: rgba(62, 242, 192, 0.3);
  --vti-strip-bg: rgba(4, 13, 16, 0.85);
  --vti-strip-border: rgba(62, 242, 192, 0.22);
  --vti-key-bg: linear-gradient(180deg, rgba(24, 56, 60, 0.95), rgba(13, 34, 38, 0.95));
  --vti-key-border: rgba(148, 192, 187, 0.28);
  --vti-key-fg: #d7e2e0;
  --vti-fn-fg: #9fc3bb;
  --vti-muted-fg: #5f7d81;
  --vti-buffer-fg: #8df5cf;
  --vti-key-h: 54px;
  --vti-key-radius: 10px;
  --vti-font: "Microsoft YaHei", "Noto Sans SC", Arial, sans-serif;

  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2147483000;
  pointer-events: none;
  font-family: var(--vti-font);
}
.vti-kb.show {
  pointer-events: auto;
}
.vti-kb__panel {
  visibility: hidden;
  transform: translateY(100%);
  transition:
    transform 0.18s ease,
    visibility 0s linear 0.18s;
  max-width: 1120px;
  margin: 0 auto;
  padding: 10px 12px calc(12px + env(safe-area-inset-bottom, 0px));
  border: 1px solid var(--vti-panel-border);
  border-bottom: none;
  border-radius: 14px 14px 0 0;
  background: var(--vti-bg);
  box-shadow: 0 -14px 36px rgba(0, 0, 0, 0.55);
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.vti-kb.show .vti-kb__panel {
  visibility: visible;
  transform: translateY(0);
  transition:
    transform 0.18s ease,
    visibility 0s;
}

/* ── 编辑回显 + 候选栏 ── */
.vti-kb__strip {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  margin-bottom: 8px;
  padding: 4px 10px;
  border: 1px solid var(--vti-strip-border);
  border-radius: 9px;
  background: var(--vti-strip-bg);
}
.vti-kb__buffer {
  flex: 0 0 auto;
  min-width: 88px;
  max-width: 220px;
  overflow: hidden;
  color: var(--vti-buffer-fg);
  font: 600 17px Consolas, monospace;
  letter-spacing: 0.06em;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.vti-kb__cands {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--vti-accent) 30%, transparent) transparent;
}
.vti-kb__cand {
  flex: none;
  min-width: 52px;
  height: 36px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--vti-accent) 35%, transparent);
  border-radius: 8px;
  color: var(--vti-key-fg);
  background: color-mix(in srgb, var(--vti-bg) 85%, var(--vti-accent));
  font-size: 19px;
  font-family: inherit;
  cursor: pointer;
}
.vti-kb__cand:active {
  border-color: var(--vti-accent);
  color: var(--vti-bg);
  background: var(--vti-accent);
}
.vti-kb__hint {
  color: var(--vti-muted-fg);
  font-size: 13px;
  white-space: nowrap;
}

/* ── 按键行 ── */
.vti-kb__row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.vti-kb__row--last {
  margin-bottom: 0;
}
.vti-kb__row--num {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
}
.vti-kb__key {
  flex: 1;
  min-width: 0;
  height: var(--vti-key-h);
  border: 1px solid var(--vti-key-border);
  border-radius: var(--vti-key-radius);
  color: var(--vti-key-fg);
  background: var(--vti-key-bg);
  font: 600 21px/1 var(--vti-font);
  cursor: pointer;
  transition: 0.08s;
}
.vti-kb__key:active {
  border-color: var(--vti-accent);
  color: var(--vti-bg);
  background: var(--vti-accent);
}
.vti-kb__key--fn {
  flex: 1.4;
  color: var(--vti-fn-fg);
  font-size: 16px;
}
.vti-kb__key--fn.on {
  border-color: var(--vti-accent);
  color: var(--vti-accent);
}
.vti-kb__key--space {
  flex: 3.2;
  color: var(--vti-fn-fg);
  font-size: 16px;
}
.vti-kb__key--done {
  flex: 1.8;
  border-color: color-mix(in srgb, var(--vti-accent) 55%, transparent);
  color: #06241c;
  background: linear-gradient(180deg, var(--vti-accent), var(--vti-accent-strong));
  font-size: 18px;
}
.vti-kb__key--done:active {
  background: var(--vti-buffer-fg);
}
.vti-kb__key--zero {
  grid-column: span 2;
}
.vti-kb__key--ghost {
  opacity: 0.28;
  cursor: default;
}
</style>
