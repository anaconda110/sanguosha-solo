import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// base 指向 GitHub Pages 的项目子路径（仓库同名目录），本地 preview 亦可用
export default defineConfig({
  base: '/sanguosha-solo/',
  plugins: [vue()],
});
