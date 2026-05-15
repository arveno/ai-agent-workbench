import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const cloudBaseProxyTarget = env.CLOUDBASE_PROXY_TARGET?.trim()

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: '127.0.0.1',
      ...(cloudBaseProxyTarget
        ? {
            proxy: {
              '/api': {
                target: cloudBaseProxyTarget,
                changeOrigin: true,
                secure: true,
              },
            },
          }
        : {}),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
