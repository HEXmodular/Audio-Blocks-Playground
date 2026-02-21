import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          '@services': path.resolve(__dirname, './services'),
          '@interfaces': path.resolve(__dirname, './interfaces'),
          '@components': path.resolve(__dirname, './components'),
          '@context': path.resolve(__dirname, './context'),
          '@utils': path.resolve(__dirname, './utils'),
          '@controllers': path.resolve(__dirname, './controllers'),
          '@icons': path.resolve(__dirname, './icons'),
          '@constants': path.resolve(__dirname, './constants'),
          '@state': path.resolve(__dirname, './state'),
          '@blocks': path.resolve(__dirname, './blocks'),
          '@stores': path.resolve(__dirname, './stores'),
        }
      },
      plugins: [
        tailwindcss(),
        VitePWA({
          workbox: {
            // Увеличиваем лимит до 5 MiB (5 * 1024 * 1024)
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          },
          // 1. Стратегия регистрации (автоматическое обновление)
          registerType: 'autoUpdate',
          
          // 2. Включаем во время разработки (опционально)
          devOptions: {
            enabled: true 
          },
    
          // 3. Настройка манифеста (то, что увидит Android)
          manifest: {
            name: '',
            short_name: 'ABlocks',
            description: 'Audio Blocks',
            theme_color: '#ffffff',
            background_color: '#ffffff',
            display: 'standalone', // Запуск без адресной строки
            icons: [
              {
                src: './icons/pwa-192x192.png',
                sizes: '192x192',
                type: 'image/png'
              },
              {
                src: './icons/pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable' // Важно для Android (адаптивные иконки)
              }
            ]
          }
        })
      ],
    };
});
