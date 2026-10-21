/**
 * vue-touch-ime · 纯逻辑层（不依赖 Vue，可单独从 `@junerver/vue-touch-ime/ime` 引入）。
 *
 * 职责：
 * - resolveSoftKind：从输入框自身属性推断输入限制
 *   （type=number + step=0.1 → 只允许数字和一个小数点；无小数 step → 只允许整数；
 *   inputmode=decimal/numeric/tel → 对应 decimal/digits；`data-vti-kb` 可显式覆盖）；
 * - candidatesFor：拼音缓冲 → 候选（短语前缀优先，再按音节前缀从长到短出单字，
 *   单字顺序取词典的字频顺序）；
 * - 文本写值：向 input 写值并派发 input 事件（v-model / @input 均可接住）。
 *
 * 编辑模型分两种（浏览器对 type=number 会做值消毒："12." 直接变 ""，且
 * selection API 返回 null）：
 * - text 类：走原生光标，支持在文本中间插入/删除；
 * - 数字类（decimal/digits）：草稿串由键盘持有，DOM 只落合法值，
 *   尾部未完成的小数点只存在于草稿里（draftToDomValue 会剥掉）。
 */
import { PINYIN_CHARS, PINYIN_PHRASES } from './pinyinDict'

export type SoftKbKind = 'text' | 'decimal' | 'digits'
export type SoftKbMode = 'zh' | 'en' | 'num'

export interface SoftCandidate {
  /** 候选文本（短语或单字） */
  text: string
  /** 上屏后应从拼音缓冲里吃掉的字母数 */
  consumed: number
}

/** 拼音音节最长长度（zhuang/chuang/shuang） */
const MAX_SYLLABLE_LEN = 6
/** 单个音节最多出多少单字候选（词典按字频排序，取前 N） */
const DEFAULT_PER_GROUP_LIMIT = 20

/* ── 输入限制类型推断 ── */

/** `data-vti-kb` 显式覆盖值 */
export const KIND_OVERRIDE_VALUES = ['text', 'decimal', 'digits'] as const

function isKindOverride(value: string | null | undefined): value is SoftKbKind {
  return (KIND_OVERRIDE_VALUES as readonly string[]).includes(value ?? '')
}

/**
 * 从输入框属性推断限制类型。
 * - type=number + step 含小数 → decimal（体重 step=0.1）；
 * - type=number 整数 step / 缺省 step → digits（月龄）；
 * - inputmode=decimal/numeric/tel → 对应 decimal/digits；
 * - 其余（text/search…）→ text。
 */
export function resolveSoftKind(el: {
  type?: string | null
  step?: string | null
  inputMode?: string | null
}): SoftKbKind {
  const type = String(el.type || 'text').toLowerCase()
  const inputMode = String(el.inputMode || '').toLowerCase()
  if (type === 'number') {
    const step = String(el.step ?? '').trim()
    if (step === 'any') return 'decimal'
    const n = Number(step)
    if (step !== '' && Number.isFinite(n) && Math.abs(n % 1) > 1e-9) return 'decimal'
    return 'digits'
  }
  if (inputMode === 'decimal') return 'decimal'
  if (inputMode === 'numeric' || inputMode === 'tel' || type === 'tel') return 'digits'
  return 'text'
}

/**
 * 解析输入限制：`data-vti-kb="text|decimal|digits"` 优先于属性推断。
 * 传入带 data 集的元素即可（HTMLInputElement.dataset.vtiKb）。
 */
export function resolveSoftKindWithOverride(
  el: { type?: string | null; step?: string | null; inputMode?: string | null },
  override?: string | null,
): SoftKbKind {
  return isKindOverride(override) ? override : resolveSoftKind(el)
}

/** 该限制类型允许的单字符键（软键盘按此过滤） */
export function isCharAllowed(kind: SoftKbKind, ch: string): boolean {
  if (ch.length !== 1) return false
  if (kind === 'text') return true
  if (kind === 'digits') return ch >= '0' && ch <= '9'
  return (ch >= '0' && ch <= '9') || ch === '.'
}

/* ── 拼音候选 ── */

function pushCandidate(
  out: SoftCandidate[],
  seen: Set<string>,
  text: string,
  consumed: number,
) {
  const key = `${consumed} ${text}`
  if (seen.has(key)) return
  seen.add(key)
  out.push({ text, consumed })
}

/**
 * 拼音缓冲 → 候选列表。
 * 1) 短语：拼音为缓冲前缀的短语，长的在前（"dahuangniu" 先出「大黄」）；
 * 2) 单字：音节前缀从长到短（"xian" 先出「现…」再出「夏…」再出「西…」），
 *    单字顺序即词典字频顺序。
 */
export function candidatesFor(
  buffer: string,
  perGroupLimit: number = DEFAULT_PER_GROUP_LIMIT,
): SoftCandidate[] {
  if (!buffer) return []
  const out: SoftCandidate[] = []
  const seen = new Set<string>()

  const phraseHits: { text: string; consumed: number }[] = []
  for (const py of Object.keys(PINYIN_PHRASES)) {
    if (buffer.startsWith(py)) {
      phraseHits.push({ text: PINYIN_PHRASES[py], consumed: py.length })
    }
  }
  phraseHits.sort((a, b) => b.consumed - a.consumed)
  for (const hit of phraseHits) pushCandidate(out, seen, hit.text, hit.consumed)

  for (let len = Math.min(MAX_SYLLABLE_LEN, buffer.length); len >= 1; len--) {
    const chars = PINYIN_CHARS[buffer.slice(0, len)]
    if (!chars) continue
    const limit = Math.min(chars.length, Math.max(1, perGroupLimit))
    for (let i = 0; i < limit; i++) pushCandidate(out, seen, chars[i], len)
  }
  return out
}

/**
 * 拼音缓冲上屏（完成键）：整个缓冲能被单个候选吃掉就上屏候选，
 * 否则按用户原始拉丁字母上屏（方便输入编号/编码类内容）。
 */
export function resolveBufferCommit(buffer: string): string | null {
  if (!buffer) return null
  const first = candidatesFor(buffer, 1)[0]
  if (first && first.consumed === buffer.length) return first.text
  return buffer
}

/* ── 数字草稿（type=number 的中间态只活在这里） ── */

/** 草稿净化：digits 只留数字；decimal 留数字且至多一个小数点 */
export function normalizeDraft(kind: SoftKbKind, draft: string): string {
  let v = draft
  if (kind === 'digits') return v.replace(/[^0-9]/g, '')
  if (kind === 'decimal') {
    v = v.replace(/[^0-9.]/g, '')
    const dot = v.indexOf('.')
    if (dot >= 0) {
      v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '')
    }
    return v
  }
  return v
}

/** 草稿 → 可写进 DOM 的值（剥掉尾部未完成的小数点，浏览器会把它消毒成 ""） */
export function draftToDomValue(kind: SoftKbKind, draft: string): string {
  const v = normalizeDraft(kind, draft)
  return kind === 'decimal' && v.endsWith('.') ? v.slice(0, -1) : v
}

/** 数字草稿按键：追加一个字符（replaceAll 时先清空旧值） */
export function applyCharToDraft(
  kind: SoftKbKind,
  draft: string,
  ch: string,
  replaceAll: boolean,
): string {
  const base = replaceAll ? '' : draft
  if (kind === 'decimal' && ch === '.') {
    if (base.includes('.')) return normalizeDraft(kind, base)
    return normalizeDraft(kind, base === '' ? '0.' : base + '.')
  }
  return normalizeDraft(kind, base + ch)
}

/** 数字草稿退格：只支持尾部删除（type=number 拿不到光标） */
export function backspaceDraft(draft: string, replaceAll: boolean): string {
  if (replaceAll) return ''
  return draft.slice(0, -1)
}

/* ── input 写值（v-model / @input 兼容） ── */

interface Selection {
  start: number
  end: number
}

function selectionOf(el: HTMLInputElement): Selection | null {
  try {
    const start = el.selectionStart
    const end = el.selectionEnd
    if (start == null || end == null) return null
    return { start, end }
  } catch {
    return null
  }
}

function setCaret(el: HTMLInputElement, pos: number) {
  try {
    el.setSelectionRange(pos, pos)
  } catch {
    /* type=number 不支持，忽略 */
  }
}

function maxLengthOf(el: HTMLInputElement): number {
  return el.maxLength > 0 ? el.maxLength : Number.POSITIVE_INFINITY
}

/** 写值并派发 input 事件，让 v-model / @input 同步 */
export function writeInputValue(el: HTMLInputElement, value: string) {
  if (el.value === value) return
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/** 当前是否为「全选」状态（行内编辑进场即全选的输入框） */
export function hasFullSelection(el: HTMLInputElement): boolean {
  const sel = selectionOf(el)
  if (!sel) return el.value.length > 0
  return el.value.length > 0 && sel.start === 0 && sel.end === el.value.length
}

/** 文本类插入：按原生光标插入（全选/replaceAll 时整体替换） */
export function insertIntoTextInput(
  el: HTMLInputElement,
  text: string,
  replaceAll = false,
) {
  const maxLen = maxLengthOf(el)
  const value = el.value
  const sel = selectionOf(el)
  const full =
    replaceAll ||
    (sel != null && value.length > 0 && sel.start === 0 && sel.end === value.length)
  if (full) {
    writeInputValue(el, text.slice(0, maxLen))
    setCaret(el, Math.min(text.length, maxLen))
    return
  }
  if (!sel) {
    const next = (value + text).slice(0, maxLen)
    writeInputValue(el, next)
    return
  }
  const next = (value.slice(0, sel.start) + text + value.slice(sel.end)).slice(0, maxLen)
  writeInputValue(el, next)
  setCaret(el, Math.min(sel.start + text.length, next.length))
}

/** 文本类退格：有选区删选区，否则删光标前一个字符 */
export function backspaceTextInput(el: HTMLInputElement) {
  const value = el.value
  const sel = selectionOf(el)
  if (!sel) {
    writeInputValue(el, value.slice(0, -1))
    return
  }
  if (sel.start !== sel.end) {
    const next = value.slice(0, sel.start) + value.slice(sel.end)
    writeInputValue(el, next)
    setCaret(el, sel.start)
    return
  }
  if (sel.start <= 0) return
  const next = value.slice(0, sel.start - 1) + value.slice(sel.start)
  writeInputValue(el, next)
  setCaret(el, sel.start - 1)
}

/** 数字类写值：把草稿净化后落 DOM（含 pending 小数点处理） */
export function writeDraft(el: HTMLInputElement, kind: SoftKbKind, draft: string) {
  writeInputValue(el, draftToDomValue(kind, draft))
}
