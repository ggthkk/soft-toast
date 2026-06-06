import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function getRealNodePath() {
  const isWin = process.platform === 'win32'
  const nodeBin = isWin ? 'node.exe' : 'node'
  const pathSeparator = isWin ? ';' : ':'
  const paths = (process.env.PATH || '').split(pathSeparator)
  
  for (const dir of paths) {
    if (!dir) continue
    // Skip directories containing "bun" to bypass Bun's node shim
    const lowerDir = dir.toLowerCase()
    if (lowerDir.includes('bun') || lowerDir.includes('.bun')) {
      continue
    }
    const fullPath = path.join(dir, nodeBin)
    try {
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        return fullPath
      }
    } catch (e) {
      // ignore
    }
  }
  // Fallback to standard command if not found
  return 'node'
}

// Build library
await build({
  configFile: false,
  plugins: [
    vue()
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

console.log('✅ Vite build completed!')

const realNode = getRealNodePath()
console.log(`Using Node executable at: ${realNode}`)
console.log('Generating declaration files via vue-tsc...')
execSync(`"${realNode}" ./node_modules/vue-tsc/bin/vue-tsc.js --declaration --emitDeclarationOnly --noEmit false --outDir dist`, { stdio: 'inherit', cwd: __dirname })
console.log('✅ Declaration files generated!')
