import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/VeloVideo.Bike/' : '/',
  plugins: [react(), tailwindcss()],
})
