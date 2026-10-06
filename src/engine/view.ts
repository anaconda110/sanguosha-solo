// 视图层：对 state 做信息隔离，UI 与 AI 只能拿到各自视角允许的信息
// （自己的手牌与身份、主公身份、已死亡者的身份，其余一律隐藏）。
// 装备区与判定区是公开信息。
import type { Card, CardSub, EquipSlot, GameState, GameEvent, GeneralSub, Identity, Inquiry, Phase, WinSide } from './types';
import { GENERAL_SEX } from './types';

export interface PublicPlayer {
  id: number;
  name: string;
  general: GeneralSub;
  /** 性别（雌雄双股剑依赖） */
  sex: 'm' | 'f';
  hp: number;
  maxHp: number;
  alive: boolean;
  isZhu: boolean;
  handCount: number;
  equips: CardSub[];
  /** 槽位明细：选牌询问时 UI 需要按槽位呈现（ADR-0008） */
  equipSlots: Partial<Record<EquipSlot, CardSub>>;
  judgements: CardSub[];
  identity: Identity | null;
}

export interface View {
  players: PublicPlayer[];
  deckCount: number;
  discardCount: number;
  turnIdx: number;
  phase: Phase;
  playedSha: boolean;
  skipDraw: boolean;
  skipPlay: boolean;
  pending: Inquiry | null;
  log: GameEvent[];
  winner: null | { side: WinSide };
  me: { id: number; identity: Identity; hand: Card[] } | null;
}

export function viewOf(s: GameState, viewerId: number | null): View {
  const viewer = viewerId == null ? undefined : s.players[viewerId];
  return {
    players: s.players.map(p => ({
      id: p.id,
      name: p.name,
      general: p.general,
      sex: GENERAL_SEX[p.general],
      hp: Math.max(p.hp, 0),
      maxHp: p.maxHp,
      alive: p.alive,
      isZhu: p.identity === 'zhu',
      handCount: p.hand.length,
      equips: (['weapon', 'shield', 'jia1ma', 'jian1ma'] as const)
        .map(sl => p.equipment[sl]?.sub)
        .filter((x): x is CardSub => x != null),
      equipSlots: Object.fromEntries(
        (['weapon', 'shield', 'jia1ma', 'jian1ma'] as const)
          .map(sl => [sl, p.equipment[sl]?.sub] as const)
          .filter(([, sub]) => sub != null),
      ) as Partial<Record<EquipSlot, CardSub>>,
      judgements: p.judgements.map(c => c.asSub ?? c.sub),
      identity:
        p.id === viewerId || p.identity === 'zhu' || !p.alive ? p.identity : null,
    })),
    deckCount: s.deck.length,
    discardCount: s.discard.length,
    turnIdx: s.turnIdx,
    phase: s.phase,
    playedSha: s.playedSha,
    skipDraw: s.skipDraw,
    skipPlay: s.skipPlay,
    pending: s.pending,
    log: s.log,
    winner: s.winner,
    me:
      viewer && viewer.alive
        ? { id: viewer.id, identity: viewer.identity, hand: [...viewer.hand] }
        : null,
  };
}
