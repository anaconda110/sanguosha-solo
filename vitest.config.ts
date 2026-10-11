import { defineConfig } from 'vitest/config';

// 单测只跑纯模块（ADR-0002：引擎即纯数据/纯函数），node 环境即可；
// 优先于 vite.config.ts 被 vitest 读取，不受 vue 插件与 base 路径影响。
export default defineConfig({
  environment: 'node',
  include: ['tests/**/*.test.ts'],
});
