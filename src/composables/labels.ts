// 展示层共用文案常量（M22 自 App.vue 迁出）：胜负方/判定原因/阶段/花色。
// 只做文字映射，不含任何状态——各组件按需 import，保证同一文案只有一处定义。
import { CARD_INFO } from '../engine/types';
import type { CardSub, Phase, Suit, WinSide } from '../engine/types';

export const SIDE_NAMES: Record<WinSide, string> = {
  zhu: '主公阵营',
  fan: '反贼',
  nei: '内奸',
  draw: '平局（回合耗尽）',
};
export const SIDE_ORDER: Array<'zhu' | 'fan' | 'nei' | 'draw'> = ['zhu', 'fan', 'nei', 'draw'];

export const REASON_NAMES: Record<string, string> = {
  lebusi: '乐不思蜀',
  bingliang: '兵粮寸断',
  shandian: '闪电',
  bagua: '八卦阵',
  luoshen: '洛神',
  tieji: '铁骑',
  ganglie: '刚烈',
};

export const PHASE_NAMES: Record<Phase, string> = {
  judge: '判定阶段',
  draw: '摸牌阶段',
  play: '出牌阶段',
  discard: '弃牌阶段',
};

/** 花色按钮顺序（反间应答用） */
export const SUIT_LIST: Suit[] = ['♠', '♥', '♣', '♦'];

/** 牌名显示（CardSub → 中文） */
export const disp = (sub: CardSub): string => CARD_INFO[sub].display;
