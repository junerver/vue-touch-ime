/**
 * vue-touch-ime · 公开 API
 *
 * - SoftKeyboard：软键盘组件（挂到页面根部即可，输入框自动接管）
 * - useSoftKeyboard / createSoftKeyboard：键盘会话（单例 / 独立实例）
 * - 纯逻辑（也可从 `@junerver/vue-touch-ime/ime` 引入）：类型推断、拼音候选、
 *   input 写值工具
 * - 词典（也可从 `@junerver/vue-touch-ime/dict` 引入）：PINYIN_CHARS / PINYIN_PHRASES
 */
export { default as SoftKeyboard } from './SoftKeyboard.vue'

export {
  createSoftKeyboard,
  isSoftInput,
  softKeyboard,
  useSoftKeyboard,
  type SoftKeyboard as SoftKeyboardInstance,
  type SoftKeyboardState,
} from './useSoftKeyboard'

export {
  applyCharToDraft,
  backspaceDraft,
  backspaceTextInput,
  candidatesFor,
  draftToDomValue,
  hasFullSelection,
  insertIntoTextInput,
  isCharAllowed,
  KIND_OVERRIDE_VALUES,
  normalizeDraft,
  resolveBufferCommit,
  resolveSoftKind,
  resolveSoftKindWithOverride,
  writeDraft,
  writeInputValue,
  type SoftCandidate,
  type SoftKbKind,
  type SoftKbMode,
} from './ime'

export { PINYIN_CHARS, PINYIN_PHRASES } from './pinyinDict'
