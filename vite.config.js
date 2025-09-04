import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// If your repo is https://USERNAME.github.io/suka-app/ keep base as '/suka-app/'
// If your repo is USERNAME.github.io (root), change to base: '/'
export default defineConfig({
  plugins: [react()],
  base: '/suka-app/',
})
