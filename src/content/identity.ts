// 身份内容数据（M23 内容数据化）：从 engine/types.ts 原样迁出，值逐字节不变。
import type { Identity } from '../engine/types';

export const IDENTITY_NAMES: Record<Identity, string> = {
  zhu: '主公',
  zhong: '忠臣',
  fan: '反贼',
  nei: '内奸',
};
