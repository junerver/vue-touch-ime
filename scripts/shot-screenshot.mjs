/** README 效果图：playground 键盘状态截图（一次性脚本） */
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const OUT = 'E:/GitHub/vue-touch-ime/media'
const SHOT_DIR = `${tmpdir()}\\vti-shot-profile`
const PORT = 9336

const chrome = spawn(
  CHROME,
  [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--no-proxy-server',
    `--user-data-dir=${SHOT_DIR}-${Date.now()}`,
    '--window-size=1280,900', `--remote-debugging-port=${PORT}`, 'about:blank',
  ],
  { stdio: 'ignore' },
)

async function targets() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page
    } catch {}
    await sleep(250)
  }
  throw new Error('CDP 未就绪')
}

const page = await targets()
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
let msgId = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
}
function send(method, params = {}) {
  const id = ++msgId
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve) => pending.set(id, resolve))
}
async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return res.result?.result?.value
}

await send('Page.enable')
await send('Page.navigate', { url: 'http://localhost:5175/playground/' })
await sleep(2500)

// 聚焦「名称」输入框（合成 focusin，无头窗口无真实焦点时 .focus() 不发事件）
await evaluate(`(() => {
  const input = document.querySelector('main label input')
  input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
  return true
})()`)
await sleep(300)

// 拼音 dahuang → 短语候选「大黄」在首位
await evaluate(`(() => {
  for (const ch of 'dahuang') {
    const btn = [...document.querySelectorAll('.vti-kb__key')].find(
      (b) => b.textContent.trim() === ch,
    )
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
  }
  return true
})()`)
await sleep(300)

const state = await evaluate(`(() => ({
  buffer: document.querySelector('.vti-kb__buffer')?.textContent.trim(),
  cands: [...document.querySelectorAll('.vti-kb__cand')].slice(0, 6).map((b) => b.textContent.trim()),
}))()`)
console.log(JSON.stringify(state))

const res = await send('Page.captureScreenshot', { format: 'png' })
const { writeFileSync } = await import('node:fs')
writeFileSync(`${OUT}/screenshot.png`, Buffer.from(res.result.data, 'base64'))
console.log('saved media/screenshot.png')

ws.close(); chrome.kill(); process.exit(0)
