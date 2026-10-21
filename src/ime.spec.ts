import { describe, expect, it } from 'vitest'

import {
  applyCharToDraft,
  backspaceDraft,
  backspaceTextInput,
  candidatesFor,
  draftToDomValue,
  hasFullSelection,
  insertIntoTextInput,
  isCharAllowed,
  normalizeDraft,
  resolveBufferCommit,
  resolveSoftKind,
  resolveSoftKindWithOverride,
  writeInputValue,
} from './ime'

function input(
  init: Partial<HTMLInputElement> & { type?: string } = {},
): HTMLInputElement {
  const el = document.createElement('input')
  el.type = init.type ?? 'text'
  if (init.step != null) el.step = String(init.step)
  if (init.maxLength != null) el.maxLength = init.maxLength
  el.value = init.value ?? ''
  document.body.appendChild(el)
  return el
}

describe('resolveSoftKind · 输入类型限制推断', () => {
  it('type=number + 小数 step → decimal', () => {
    expect(resolveSoftKind({ type: 'number', step: '0.1' })).toBe('decimal')
    expect(resolveSoftKind({ type: 'number', step: '0.5' })).toBe('decimal')
    expect(resolveSoftKind({ type: 'number', step: 'any' })).toBe('decimal')
  })

  it('type=number 整数/缺省 step → digits', () => {
    expect(resolveSoftKind({ type: 'number' })).toBe('digits')
    expect(resolveSoftKind({ type: 'number', step: '1' })).toBe('digits')
  })

  it('text / inputmode 提示', () => {
    expect(resolveSoftKind({ type: 'text' })).toBe('text')
    expect(resolveSoftKind({ type: 'search' })).toBe('text')
    expect(resolveSoftKind({ type: 'text', inputMode: 'decimal' })).toBe('decimal')
    expect(resolveSoftKind({ type: 'text', inputMode: 'numeric' })).toBe('digits')
  })

  it('data-vti-kb 显式覆盖优先于属性推断', () => {
    expect(resolveSoftKindWithOverride({ type: 'number' }, 'text')).toBe('text')
    expect(resolveSoftKindWithOverride({ type: 'text' }, 'decimal')).toBe('decimal')
    // 非法覆盖值回落到属性推断
    expect(resolveSoftKindWithOverride({ type: 'number', step: '0.1' }, 'bad')).toBe(
      'decimal',
    )
    expect(resolveSoftKindWithOverride({ type: 'number', step: '0.1' }, null)).toBe(
      'decimal',
    )
  })

  it('isCharAllowed 按类型过滤', () => {
    expect(isCharAllowed('digits', '5')).toBe(true)
    expect(isCharAllowed('digits', '.')).toBe(false)
    expect(isCharAllowed('decimal', '.')).toBe(true)
    expect(isCharAllowed('decimal', 'a')).toBe(false)
    expect(isCharAllowed('text', '牛')).toBe(true)
  })
})

describe('candidatesFor · 拼音候选', () => {
  it('单字按字频排序，da 的首候选是「大」', () => {
    const cands = candidatesFor('da')
    expect(cands[0]).toEqual({ text: '大', consumed: 2 })
  })

  it('短语前缀优先且吃掉更长的拼音（dahuangniu 先出「大黄」，余下 niu 再出「牛」）', () => {
    const cands = candidatesFor('dahuangniu')
    expect(cands[0]).toEqual({ text: '大黄', consumed: 7 })
    const rest = candidatesFor('dahuangniu'.slice(7))
    expect(rest[0]).toEqual({ text: '牛', consumed: 3 })
  })

  it('整段短语可一次上屏（nihao → 你好）', () => {
    const cands = candidatesFor('nihao')
    expect(cands[0]).toEqual({ text: '你好', consumed: 5 })
  })

  it('多音节前缀从长到短出候选（xian：xian → xia → xi）', () => {
    const consumedSet = candidatesFor('xian').map((c) => c.consumed)
    expect(consumedSet).toContain(4)
    expect(consumedSet).toContain(3)
    expect(consumedSet).toContain(2)
    expect(consumedSet[0]).toBe(4)
  })

  it('ü 用 v 输入（nv → 女）', () => {
    expect(candidatesFor('nv')[0].text).toBe('女')
  })

  it('空缓冲无候选', () => {
    expect(candidatesFor('')).toEqual([])
  })
})

describe('resolveBufferCommit · 完成键上屏', () => {
  it('整段能被候选吃掉 → 上屏候选', () => {
    expect(resolveBufferCommit('nihao')).toBe('你好')
    expect(resolveBufferCommit('da')).toBe('大')
  })

  it('不能整段吃掉 → 按原始拉丁字母上屏（编号/编码场景）', () => {
    expect(resolveBufferCommit('AN12')).toBe('AN12')
    expect(resolveBufferCommit('dahuangniu')).toBe('dahuangniu')
  })

  it('空缓冲不上屏', () => {
    expect(resolveBufferCommit('')).toBeNull()
  })
})

describe('数字草稿 · type=number 中间态', () => {
  it('decimal 只留数字和一个小数点', () => {
    expect(normalizeDraft('decimal', '12.3.4a')).toBe('12.34')
    expect(normalizeDraft('digits', '12a.3')).toBe('123')
  })

  it('尾部小数点只活在草稿里（DOM 值剥掉，绕过浏览器值消毒）', () => {
    expect(draftToDomValue('decimal', '12.')).toBe('12')
    expect(draftToDomValue('decimal', '12.5')).toBe('12.5')
  })

  it('小数点按键：空值补 0.，已有小数点忽略', () => {
    expect(applyCharToDraft('decimal', '', '.', false)).toBe('0.')
    expect(applyCharToDraft('decimal', '12', '.', false)).toBe('12.')
    expect(applyCharToDraft('decimal', '12.', '.', false)).toBe('12.')
  })

  it('replaceAll 首键替换旧值', () => {
    expect(applyCharToDraft('decimal', '123.4', '5', true)).toBe('5')
    expect(backspaceDraft('123.4', true)).toBe('')
  })

  it('退格只删尾部', () => {
    expect(backspaceDraft('12.5', false)).toBe('12.')
    expect(backspaceDraft('', false)).toBe('')
  })
})

describe('input 写值（v-model / @input 兼容）', () => {
  it('写值派发 input 事件并带上新值', () => {
    const el = input()
    let got = ''
    el.addEventListener('input', () => {
      got = el.value
    })
    writeInputValue(el, '大黄')
    expect(got).toBe('大黄')
  })

  it('值不变时不重复派发', () => {
    const el = input({ value: 'abc' })
    let count = 0
    el.addEventListener('input', () => {
      count += 1
    })
    writeInputValue(el, 'abc')
    expect(count).toBe(0)
  })

  it('文本类按光标插入，支持全选替换', () => {
    const el = input({ value: 'hello' })
    el.setSelectionRange(1, 3)
    insertIntoTextInput(el, '大')
    expect(el.value).toBe('h大lo')

    el.select()
    expect(hasFullSelection(el)).toBe(true)
    insertIntoTextInput(el, '牛')
    expect(el.value).toBe('牛')
    expect(hasFullSelection(el)).toBe(false)
  })

  it('文本类退格删光标前一字符 / 删选区', () => {
    const el = input({ value: 'abcd' })
    el.setSelectionRange(2, 2)
    backspaceTextInput(el)
    expect(el.value).toBe('acd')

    el.setSelectionRange(0, 2)
    backspaceTextInput(el)
    expect(el.value).toBe('d')
  })

  it('尊重 maxlength', () => {
    const el = input({ value: 'ab', maxLength: 3 })
    insertIntoTextInput(el, 'cdef')
    expect(el.value).toBe('abc')
  })

  it('replaceAll 直接整体替换文本', () => {
    const el = input({ value: 'old' })
    insertIntoTextInput(el, 'new', true)
    expect(el.value).toBe('new')
  })
})
