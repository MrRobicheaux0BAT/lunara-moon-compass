import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  base: '/lunara-moon-compass/',
  plugins: [basicSsl()],
  server: {
    host: true,
    port: 5173,
  },
})
