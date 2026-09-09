import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const targetUrl = env.VITE_JELLYFIN_URL || 'http://localhost:8097'

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/jellyfin-api': {
          target: targetUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/jellyfin-api/, ''),
          secure: false,
          ws: true,
        },
      },
    },
  }
})
