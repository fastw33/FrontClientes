import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      host: env.DEV_HOST,
      port: Number(env.DEV_PORT),
      strictPort: true,
      proxy: { '/api': { target: env.DEV_API_TARGET, changeOrigin: false } },
    },
    preview: { host: env.DEV_HOST, port: Number(env.DEV_PORT), strictPort: true },
    build: { sourcemap: false },
  }
})
