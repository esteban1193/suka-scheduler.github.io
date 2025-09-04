import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT:
// - For https://USER.github.io/REPO_NAME/ use base: '/REPO_NAME/'
// - For https://USER.github.io         use base: '/'
export default defineConfig({
  plugins: [react()],
  base: '/REPO_NAME/',
})
