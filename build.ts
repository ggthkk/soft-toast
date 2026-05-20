import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

// Build library
await build({
  configFile: false,
  plugins: [
    vue(),
    dts({
      insertTypesEntry: true,
      rollupTypes: true,
    })
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'VueSoftToast',
      fileName: 'index',
      formats: ['es']
    },
    rollupOptions: {
      external: ['vue', 'gsap'],
      output: {
        globals: {
          vue: 'Vue',
          gsap: 'gsap'
        }
      }
    },
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false
  }
})

console.log('✅ Build completed!')
