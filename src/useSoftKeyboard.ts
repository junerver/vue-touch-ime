/**
 * vue-touch-ime · 会话状态（Vue 组合式 API）。
 *
 * 焦点驱动：SoftKeyboard.vue 挂载后 attach() 注册文档级 focusin/focusout，
 * 页面上任何文本输入框自动接管，无需逐个输入框接线。
 *
 * 关键约束：
 * - 键盘按键必须 preventDefault 保持输入框焦点（见 SoftKeyboard.vue），
 *   否则输入框的 @blur 提交会被提前触发；
 * - 数字类输入（type=number）浏览器值消毒会吃掉 "12." 这类中间态，
 *   草稿串由本模块持有，只把合法值落 DOM；
 * - 「进场即全选」的输入（replaceAll）首键整体替换旧值。
 */
import { computed, reactive, type ComputedRef } from 'vue'

import {
  applyCharToDraft,
  backspaceDraft,
  backspaceTextInput,
  candidatesFor,
  hasFullSelection,
  insertIntoTextInput,
  isCharAllowed,
  normalizeDraft,
  resolveBufferCommit,
  resolveSoftKindWithOverride,
  writeDraft,
  type SoftCandidate,
  type SoftKbKind,
  type SoftKbMode,
} from './ime'

export type { SoftCandidate, SoftKbKind, SoftKbMode }

/** 软键盘接管的输入框类型（checkbox/select 等不接管） */
const SOFT_INPUT_TYPES = new Set(['text', 'search', 'tel', 'email', 'url', 'number', ''])

export function isSoftInput(el: EventTarget | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false
  if (el.disabled || el.readOnly) return false
  return SOFT_INPUT_TYPES.has((el.type || 'text').toLowerCase())
}

export interface SoftKeyboardState {
  visible: boolean
  /** 当前键盘模式：拼音 / 英文 / 数字 */
  mode: SoftKbMode
  /** 输入限制类型（决定可用键与编辑模型） */
  kind: SoftKbKind
  /** 拼音缓冲（不进 input，只在候选栏回显） */
  buffer: string
  /** 数字类草稿（含尾部未落盘的小数点） */
  draft: string
  /** 首键整体替换（行内编辑进场即全选的输入框） */
  replaceAll: boolean
  /** 英文模式大写锁定一次 */
  shift: boolean
  /** 从数字模式返回时的文本模式 */
  prevTextMode: Exclude<SoftKbMode, 'num'>
}

export interface SoftKeyboard {
  state: SoftKeyboardState
  candidates: ComputedRef<SoftCandidate[]>
  attach: (root: HTMLElement | null) => void
  detach: () => void
  openFor: (el: HTMLInputElement) => void
  close: (blur?: boolean) => void
  press: (token: string) => void
  pickCandidate: (candidate: SoftCandidate) => void
  getTarget: () => HTMLInputElement | null
}

export function createSoftKeyboard(): SoftKeyboard {
  const state = reactive<SoftKeyboardState>({
    visible: false,
    mode: 'zh',
    kind: 'text',
    buffer: '',
    draft: '',
    replaceAll: false,
    shift: false,
    prevTextMode: 'zh',
  })

  let target: HTMLInputElement | null = null
  let rootEl: HTMLElement | null = null
  let attached = false
  /** 会话代际：focus 移交（A→B 输入框）时旧的延迟关闭不得误伤新会话 */
  let epoch = 0

  const candidates = computed<SoftCandidate[]>(() =>
    state.visible && state.mode === 'zh' ? candidatesFor(state.buffer) : [],
  )

  function openFor(el: HTMLInputElement) {
    if (target === el && state.visible) return
    epoch += 1
    target = el
    // data-vti-kb="text|decimal|digits" 显式覆盖属性推断
    const kind = resolveSoftKindWithOverride(el, el.dataset?.vtiKb)
    state.kind = kind
    state.mode = kind === 'text' ? 'zh' : 'num'
    state.prevTextMode = 'zh'
    state.buffer = ''
    state.shift = false
    // 「进场即全选」的输入（如行内编辑），首键直接替换
    state.replaceAll = kind === 'text' ? hasFullSelection(el) : el.value.length > 0
    state.draft = kind === 'text' ? '' : el.value
    state.visible = true
    try {
      el.scrollIntoView({ block: 'center' })
    } catch {
      /* jsdom 等环境不支持，忽略 */
    }
  }

  function close(blur = false) {
    epoch += 1
    state.visible = false
    state.buffer = ''
    state.shift = false
    const el = target
    target = null
    if (blur && el) {
      try {
        el.blur()
      } catch {
        /* noop */
      }
    }
  }

  /** 目标输入框可能已被行内编辑卸载，先校验再写值 */
  function liveTarget(): HTMLInputElement | null {
    if (!target || !target.isConnected) {
      close(false)
      return null
    }
    return target
  }

  function insertText(text: string) {
    const el = liveTarget()
    if (!el || !text) return
    if (state.kind === 'text') {
      insertIntoTextInput(el, text, state.replaceAll)
    } else if (text.length === 1) {
      // 单键走草稿编辑（小数点补 0.、重复小数点忽略等规则在这里）
      state.draft = applyCharToDraft(state.kind, state.draft, text, state.replaceAll)
      writeDraft(el, state.kind, state.draft)
    } else {
      const base = state.replaceAll ? '' : state.draft
      state.draft = normalizeDraft(state.kind, base + text)
      writeDraft(el, state.kind, state.draft)
    }
    state.replaceAll = false
  }

  function backspace() {
    const el = liveTarget()
    if (!el) return
    if (state.kind === 'text') {
      backspaceTextInput(el)
    } else {
      state.draft = backspaceDraft(state.draft, state.replaceAll)
      writeDraft(el, state.kind, state.draft)
    }
    state.replaceAll = false
  }

  /** 拼音缓冲上屏：能被单个候选整段吃掉就上屏候选，否则上屏原始字母 */
  function flushBuffer() {
    const text = resolveBufferCommit(state.buffer)
    state.buffer = ''
    insertText(text ?? '')
  }

  function pickCandidate(candidate: SoftCandidate) {
    if (!liveTarget()) return
    state.buffer = state.buffer.slice(candidate.consumed)
    insertText(candidate.text)
  }

  function setMode(mode: SoftKbMode) {
    if (state.mode === 'zh' && state.buffer) flushBuffer()
    if (mode === 'num' && state.mode !== 'num') state.prevTextMode = state.mode
    state.mode = mode
    state.shift = false
  }

  function press(token: string) {
    if (!state.visible || !liveTarget()) return

    if (token === 'backspace') {
      if (state.mode === 'zh' && state.buffer) {
        state.buffer = state.buffer.slice(0, -1)
        return
      }
      backspace()
      return
    }
    if (token === 'space') {
      if (state.mode === 'zh' && state.buffer) {
        const first = candidates.value[0]
        if (first) pickCandidate(first)
        else flushBuffer()
        return
      }
      if (state.kind === 'text') insertText(' ')
      return
    }
    if (token === 'done') {
      flushBuffer()
      close(true)
      return
    }
    if (token === 'shift') {
      state.shift = !state.shift
      return
    }
    if (token === 'mode:back') {
      setMode(state.prevTextMode)
      return
    }
    if (token.startsWith('mode:')) {
      setMode(token.slice(5) as SoftKbMode)
      return
    }

    // 单字符键
    let ch = token
    if (ch.length !== 1) return
    if (state.kind !== 'text' && !isCharAllowed(state.kind, ch)) return

    if (state.mode === 'zh') {
      if (ch >= 'a' && ch <= 'z') {
        state.buffer += ch
        return
      }
      if (ch >= 'A' && ch <= 'Z') {
        state.buffer += ch.toLowerCase()
        return
      }
      // 数字/标点：先上屏未完成拼音，再直接上屏
      flushBuffer()
      insertText(ch)
      return
    }

    if (state.mode === 'en') {
      if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
        ch = state.shift ? ch.toUpperCase() : ch.toLowerCase()
        state.shift = false
      }
      insertText(ch)
      return
    }

    insertText(ch)
  }

  /* ── 文档级焦点接管 ── */

  function onFocusIn(event: FocusEvent) {
    const el = event.target
    if (!isSoftInput(el)) return
    if (rootEl && el instanceof Node && rootEl.contains(el)) return
    openFor(el)
  }

  function onFocusOut(event: FocusEvent) {
    if (event.target !== target) return
    const myEpoch = epoch
    // 焦点可能只是移交到另一个输入框：focusin 会 bump epoch 并重新开键盘
    window.setTimeout(() => {
      if (epoch !== myEpoch) return
      close(false)
    }, 0)
  }

  function attach(root: HTMLElement | null) {
    rootEl = root
    if (attached) return
    attached = true
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
  }

  function detach() {
    if (attached) {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      attached = false
    }
    rootEl = null
    close(false)
  }

  return {
    state,
    candidates,
    attach,
    detach,
    openFor,
    close,
    press,
    pickCandidate,
    getTarget: () => target,
  }
}

/** 模块级单例（SoftKeyboard.vue 默认实例） */
export const softKeyboard: SoftKeyboard = createSoftKeyboard()

/** 取默认单例；需要独立实例时用 createSoftKeyboard() */
export function useSoftKeyboard(): SoftKeyboard {
  return softKeyboard
}
