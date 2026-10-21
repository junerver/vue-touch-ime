import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 库模式：ESM + CJS 双产物，vue 外置；CSS 单独抽出到 dist/style.css
export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: {
        index: 'src/index.ts',
        ime: 'src/ime.ts',
        pinyinDict: 'src/pinyinDict.ts',
      },
      formats: ['es', 'cjs'],
      cssFileName: 'style',
      fileName: (format, entryName) =>
        `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['vue'],
    },
  },
})
