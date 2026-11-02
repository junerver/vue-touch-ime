import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createSoftKeyboard,
  softKeyboard,
  type SoftKeyboard,
} from './useSoftKeyboard'
import SoftKeyboardVue from './SoftKeyboard.vue'

function makeInput(
  init: { type?: string; step?: string; value?: string; maxLength?: number } = {},
) {
  const el = document.createElement('input')
  el.type = init.type ?? 'text'
  if (init.step != null) el.step = init.step
  if (init.maxLength != null) el.maxLength = init.maxLength
  if (init.value != null) el.value = init.value
  document.body.appendChild(el)
  return el
}

function focusIn(el: HTMLInputElement) {
  el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
}

function pointerDown(el: Element) {
  const event = new Event('pointerdown', { bubbles: true, cancelable: true })
  el.dispatchEvent(event)
  return event
}

describe('createSoftKeyboard · 会话状态', () => {
  let kb: SoftKeyboard

  beforeEach(() => {
    kb = createSoftKeyboard()
  })

  afterEach(() => {
    kb.detach()
    document.body.innerHTML = ''
  })

  it('文本框默认拼音模式，空格上屏首个候选', () => {
    const el = makeInput()
    kb.openFor(el)
    expect(kb.state.visible).toBe(true)
    expect(kb.state.mode).toBe('zh')
    expect(kb.state.kind).toBe('text')

    kb.press('d')
    kb.press('a')
    expect(kb.state.buffer).toBe('da')
    expect(kb.candidates.value[0]?.text).toBe('大')
    kb.press('space')
    expect(el.value).toBe('大')
    expect(kb.state.buffer).toBe('')
  })

  it('点候选上屏并按 consumed 缩短缓冲（dahuangniu → 大黄 + 牛）', () => {
    const el = makeInput()
    kb.openFor(el)
    for (const ch of 'dahuangniu') kb.press(ch)
    const first = kb.candidates.value[0]
    expect(first).toEqual({ text: '大黄', consumed: 7 })
    kb.pickCandidate(first!)
    expect(el.value).toBe('大黄')
    expect(kb.state.buffer).toBe('niu')
    kb.press('space')
    expect(el.value).toBe('大黄牛')
  })

  it('小数输入（type=number step=0.1）只允许数字和一个小数点，首键替换旧值', () => {
    const el = makeInput({ type: 'number', step: '0.1', value: '123.4' })
    kb.openFor(el)
    expect(kb.state.kind).toBe('decimal')
    expect(kb.state.mode).toBe('num')

    kb.press('5')
    expect(el.value).toBe('5')
    kb.press('.')
    // 尾部小数点只活在草稿里（浏览器值消毒会吃掉 "5."）
    expect(kb.state.draft).toBe('5.')
    expect(el.value).toBe('5')
    kb.press('6')
    expect(el.value).toBe('5.6')
    kb.press('.')
    expect(el.value).toBe('5.6')
    kb.press('a')
    expect(el.value).toBe('5.6')
  })

  it('整数输入（type=number 无 step）只允许整数', () => {
    const el = makeInput({ type: 'number', value: '24' })
    kb.openFor(el)
    expect(kb.state.kind).toBe('digits')
    kb.press('1')
    kb.press('8')
    expect(el.value).toBe('18')
    kb.press('.')
    expect(el.value).toBe('18')
  })

  it('data-vti-kb 覆盖：文本框强制只允许数字', () => {
    const el = makeInput()
    el.dataset.vtiKb = 'digits'
    kb.openFor(el)
    expect(kb.state.kind).toBe('digits')
    expect(kb.state.mode).toBe('num')
    kb.press('0')
    kb.press('8')
    kb.press('a')
    kb.press('.')
    kb.press('3')
    expect(el.value).toBe('083')
  })

  it('data-vti-kb="decimal"：文本框放开小数输入', () => {
    const el = makeInput()
    el.dataset.vtiKb = 'decimal'
    kb.openFor(el)
    expect(kb.state.kind).toBe('decimal')
    kb.press('1')
    kb.press('2')
    kb.press('.')
    kb.press('5')
    kb.press('a')
    expect(el.value).toBe('12.5')
  })

  it('完成：上屏未完成拼音 → blur → 隐藏', () => {
    const el = makeInput()
    document.body.appendChild(el)
    el.focus()
    kb.openFor(el)
    kb.press('n')
    kb.press('i')
    kb.press('done')
    expect(el.value).toBe('你')
    expect(kb.state.visible).toBe(false)
  })

  it('数字/标点键先上屏未完成拼音（IME 语义：an+1 → 安1）', () => {
    const el = makeInput()
    kb.openFor(el)
    for (const ch of 'an1') kb.press(ch)
    expect(el.value).toBe('安1')
  })

  it('完成：整段拼音吃不掉时按原始字母上屏（编号/编码）', () => {
    const el = makeInput()
    kb.openFor(el)
    for (const ch of 'ab') kb.press(ch)
    expect(kb.state.buffer).toBe('ab')
    kb.press('done')
    expect(el.value).toBe('ab')
  })

  it('英/数字切换：mode 切换时上屏未完成拼音', () => {
    const el = makeInput()
    kb.openFor(el)
    kb.press('d')
    kb.press('a')
    kb.press('mode:num')
    expect(kb.state.mode).toBe('num')
    expect(el.value).toBe('大')
    kb.press('mode:back')
    expect(kb.state.mode).toBe('zh')
  })

  it('英文模式 shift 出大写且只生效一次', () => {
    const el = makeInput()
    kb.openFor(el)
    kb.press('mode:en')
    kb.press('shift')
    kb.press('a')
    kb.press('b')
    expect(el.value).toBe('Ab')
  })

  it('文本框全选态：拼音组合先不动旧值，上屏时整体替换', () => {
    const el = makeInput({ value: '旧值' })
    el.select()
    kb.openFor(el)
    expect(kb.state.replaceAll).toBe(true)
    kb.press('x')
    kb.press('i')
    expect(el.value).toBe('旧值')
    kb.press('space')
    expect(el.value).toBe('西')
  })

  it('文本框全选态：英文模式首键直接替换', () => {
    const el = makeInput({ value: '旧值' })
    el.select()
    kb.openFor(el)
    kb.press('mode:en')
    kb.press('x')
    expect(el.value).toBe('x')
  })

  it('焦点移交给另一个输入框时代际守卫不误关新键盘', async () => {
    const kbRoot = document.createElement('div')
    document.body.appendChild(kbRoot)
    const a = makeInput()
    const b = makeInput()
    document.body.appendChild(a)
    document.body.appendChild(b)
    kb.attach(kbRoot)
    focusIn(a)
    expect(kb.state.visible).toBe(true)
    a.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    focusIn(b)
    await new Promise((r) => setTimeout(r, 0))
    expect(kb.state.visible).toBe(true)
    expect(kb.getTarget()).toBe(b)
  })

  it('数字输入：回显草稿取输入框当前值，外部改值也能跟上', () => {
    const el = makeInput({ type: 'number', step: '0.1', value: '480.5' })
    kb.openFor(el)
    expect(kb.state.draft).toBe('480.5')

    // 行内编辑「先 focus 后赋值」：focus 之后外部才把值写进来
    el.value = '1200'
    el.dispatchEvent(new Event('input', { bubbles: true }))
    expect(kb.state.draft).toBe('1200')

    // 外部塞进来的值视同「进场即有值」：首个数字键整体替换
    kb.press('9')
    expect(el.value).toBe('9')
    expect(kb.state.draft).toBe('9')
  })

  it('键盘自己写值不会被外部同步监听回灌（尾部小数点保留）', () => {
    const el = makeInput({ type: 'number', step: '0.1', value: '' })
    kb.openFor(el)
    kb.press('5')
    kb.press('.')
    // DOM 里只能是 "5"，草稿才是 "5."
    expect(el.value).toBe('5')
    expect(kb.state.draft).toBe('5.')
    kb.press('6')
    expect(el.value).toBe('5.6')
  })

  it('聚焦时值还没写进 DOM（v-focus 在 v-model 之前）：草稿会自动补上', async () => {
    // 复现 <input v-focus v-model>：自定义指令 mounted 先 focus，
    // v-model 的 mounted 才把 ref 值写进 el.value → 打开那一刻读到的是空
    const el = makeInput({ type: 'number', step: '0.1', value: '' })
    kb.openFor(el)
    expect(kb.state.draft).toBe('')

    el.value = '506'
    await Promise.resolve() // 等微任务里的那次对齐
    expect(kb.state.draft).toBe('506')
    // 补到值之后，「进场即有值」语义成立：首个数字键整体替换
    expect(kb.state.replaceAll).toBe(true)
  })

  it('值在短延时之后才写入也能补上，且不覆盖用户已经按下的内容', async () => {
    const late = makeInput({ type: 'number', step: '0.1', value: '' })
    kb.openFor(late)
    await new Promise((r) => setTimeout(r, 40))
    late.value = '88' // setTimeout 之后才赋值
    await new Promise((r) => setTimeout(r, 140))
    expect(kb.state.draft).toBe('88')

    // 用户先按键：草稿与 DOM 一致，延迟回来的对齐跳过
    const typed = makeInput({ type: 'number', step: '0.1', value: '' })
    kb.openFor(typed)
    kb.press('7')
    await new Promise((r) => setTimeout(r, 160))
    expect(kb.state.draft).toBe('7')
    expect(typed.value).toBe('7')
  })

  it('输入框被卸载后按键安全关闭，不再写值', () => {
    const el = makeInput()
    kb.openFor(el)
    el.remove()
    kb.press('5')
    expect(kb.state.visible).toBe(false)
  })
})

describe('SoftKeyboard.vue · 组件', () => {
  beforeEach(() => {
    softKeyboard.detach()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    softKeyboard.detach()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('挂载后接管文档焦点，聚焦即弹出', async () => {
    const wrapper = mount(SoftKeyboardVue, { attachTo: document.body })
    const el = makeInput()
    focusIn(el)
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).toContain('show')
    expect(wrapper.findAll('.vti-kb__key').length).toBeGreaterThan(20)
    wrapper.unmount()
  })

  it('键盘未挂载时任何输入都不会弹键盘', () => {
    const el = makeInput()
    focusIn(el)
    expect(softKeyboard.state.visible).toBe(false)
  })

  it('按键 pointerdown：阻止默认（保焦点）+ 阻止冒泡（不触发文档外部点击）', async () => {
    const wrapper = mount(SoftKeyboardVue, { attachTo: document.body })
    const el = makeInput()
    focusIn(el)
    await wrapper.vm.$nextTick()

    const docSpy = vi.fn()
    document.addEventListener('mousedown', docSpy)
    const key = wrapper.findAll('.vti-kb__key').find((k) => k.text() === 'q')!
    const event = pointerDown(key.element)
    expect(event.defaultPrevented).toBe(true)
    expect(docSpy).not.toHaveBeenCalled()
    expect(softKeyboard.state.buffer).toBe('q')

    document.dispatchEvent(new Event('mousedown', { bubbles: true }))
    expect(docSpy).toHaveBeenCalledTimes(1)
    document.removeEventListener('mousedown', docSpy)
    wrapper.unmount()
  })

  it('拼音模式候选点击上屏', async () => {
    const wrapper = mount(SoftKeyboardVue, { attachTo: document.body })
    const el = makeInput()
    focusIn(el)
    await wrapper.vm.$nextTick()

    for (const ch of 'ni') {
      const key = wrapper.findAll('.vti-kb__key').find((k) => k.text() === ch)!
      pointerDown(key.element)
    }
    await wrapper.vm.$nextTick()
    const cand = wrapper.findAll('.vti-kb__cand')
    expect(cand[0].text()).toBe('你')
    pointerDown(cand[0].element)
    expect(el.value).toBe('你')
    wrapper.unmount()
  })

  it('数字模式小数键盘：输入 12.5；整数字段不出小数点', async () => {
    const wrapper = mount(SoftKeyboardVue, { attachTo: document.body })
    const el = makeInput({ type: 'number', step: '0.1', value: '480' })
    focusIn(el)
    await wrapper.vm.$nextTick()

    for (const token of ['1', '2', '.', '5']) {
      const key = wrapper
        .findAll('.vti-kb__key')
        .find((k) => k.text().trim() === token)!
      pointerDown(key.element)
    }
    expect(el.value).toBe('12.5')
    wrapper.unmount()

    const wrapper2 = mount(SoftKeyboardVue, { attachTo: document.body })
    const age = makeInput({ type: 'number', value: '24' })
    focusIn(age)
    await wrapper2.vm.$nextTick()
    const dot = wrapper2.findAll('.vti-kb__key').find((k) => k.text().trim() === '·')
    expect(dot?.attributes('disabled')).toBeDefined()
    wrapper2.unmount()
  })

  it('数字键盘回显「当前值」：有值放大显示，空值给「未输入」', async () => {
    const wrapper = mount(SoftKeyboardVue, { attachTo: document.body })
    const el = makeInput({ type: 'number', step: '0.1', value: '480' })
    focusIn(el)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.vti-kb__label').text()).toBe('当前值')
    expect(wrapper.find('.vti-kb__value').text()).toBe('480')
    expect(wrapper.find('.vti-kb__value').classes()).not.toContain('is-empty')

    // 按键后回显跟着走
    const key = wrapper.findAll('.vti-kb__key').find((k) => k.text().trim() === '7')!
    pointerDown(key.element)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.vti-kb__value').text()).toBe('7')
    wrapper.unmount()

    const wrapper2 = mount(SoftKeyboardVue, { attachTo: document.body })
    const empty = makeInput({ type: 'number', value: '' })
    focusIn(empty)
    await wrapper2.vm.$nextTick()
    expect(wrapper2.find('.vti-kb__value').text()).toBe('未输入')
    expect(wrapper2.find('.vti-kb__value').classes()).toContain('is-empty')
    wrapper2.unmount()
  })

  it('instance prop：挂独立实例不影响单例', async () => {
    const custom = createSoftKeyboard()
    const wrapper = mount(SoftKeyboardVue, {
      attachTo: document.body,
      props: { instance: custom },
    })
    const el = makeInput()
    focusIn(el)
    await wrapper.vm.$nextTick()
    expect(custom.state.visible).toBe(true)
    expect(softKeyboard.state.visible).toBe(false)
    wrapper.unmount()
    custom.detach()
  })

  it('accent / background prop 落到 CSS 变量（快捷换肤）', async () => {
    const wrapper = mount(SoftKeyboardVue, {
      attachTo: document.body,
      props: { accent: '#ff5500', background: 'rgba(0,0,0,0.9)' },
    })
    expect(wrapper.element.style.getPropertyValue('--vti-accent')).toBe('#ff5500')
    expect(wrapper.element.style.getPropertyValue('--vti-bg')).toBe('rgba(0,0,0,0.9)')
    wrapper.unmount()
  })

  it('不传主题 prop 时不写内联样式（沿用 CSS 默认主题）', async () => {
    const wrapper = mount(SoftKeyboardVue, { attachTo: document.body })
    expect(wrapper.attributes('style')).toBeUndefined()
    wrapper.unmount()
  })

  it('卸载后不再接管焦点', async () => {
    const wrapper = mount(SoftKeyboardVue, { attachTo: document.body })
    wrapper.unmount()
    const el = makeInput()
    focusIn(el)
    expect(softKeyboard.state.visible).toBe(false)
  })
})
