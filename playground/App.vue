<script setup lang="ts">
/**
 * vue-touch-ime 演示页：聚焦任意输入框即弹出触摸软键盘。
 * 体重（step=0.1）出小数键盘、年龄（无 step）出整数键盘、
 * 编号用 data-vti-kb="digits" 强制数字，名称/备注走拼音。
 */
import { ref } from 'vue'

import SoftKeyboard from '../src/SoftKeyboard.vue'

const name = ref('')
const weight = ref<number | null>(null)
const age = ref<number | null>(null)
const code = ref('')
const note = ref('')
</script>

<template>
  <main class="demo">
    <h1>vue-touch-ime</h1>
    <p class="sub">聚焦任意输入框 → 触摸软键盘自动弹出（中文拼音 / 英文 / 数字）</p>

    <label>
      <span>名称（拼音输入）</span>
      <input v-model="name" type="text" placeholder="试试输入 dahuang" />
      <em>{{ name }}</em>
    </label>

    <label>
      <span>体重（仅数字 + 一个小数点）</span>
      <input v-model="weight" type="number" step="0.1" placeholder="12.5" />
      <em>{{ weight ?? "—" }} kg</em>
    </label>

    <label>
      <span>年龄（仅整数）</span>
      <input v-model="age" type="number" placeholder="24" />
      <em>{{ age ?? "—" }}</em>
    </label>

    <label>
      <span>编号（data-vti-kb 强制数字）</span>
      <input v-model="code" type="text" data-vti-kb="digits" placeholder="0083" />
      <em>{{ code }}</em>
    </label>

    <label>
      <span>备注（拼音 + 英文切换）</span>
      <input v-model="note" type="text" placeholder="自由文本" />
      <em>{{ note }}</em>
    </label>

    <SoftKeyboard />
  </main>
</template>

<style scoped>
.demo {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 20px 420px;
  color: #d7e2e0;
}
h1 {
  margin: 0 0 6px;
  font-size: 28px;
  color: #3ef2c0;
}
.sub {
  margin: 0 0 24px;
  color: #7f979c;
  font-size: 14px;
}
label {
  display: grid;
  gap: 6px;
  margin-bottom: 18px;
}
label span {
  color: #9fc3bb;
  font-size: 13px;
}
label input {
  height: 44px;
  padding: 0 12px;
  border: 1px solid rgba(62, 242, 192, 0.35);
  border-radius: 8px;
  outline: none;
  color: #e6f2ee;
  background: rgba(7, 20, 24, 0.9);
  font-size: 16px;
}
label input:focus {
  border-color: #3ef2c0;
  box-shadow: 0 0 10px rgba(62, 242, 192, 0.25);
}
label em {
  color: #5f7d81;
  font-size: 12px;
  font-style: normal;
}
</style>
