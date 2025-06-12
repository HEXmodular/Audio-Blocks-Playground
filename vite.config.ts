import path from 'path';
import { defineConfig, loadEnv } from 'vite';

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
        }
      }
    };
});
