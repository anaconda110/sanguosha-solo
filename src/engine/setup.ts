import { buildDeck, TOTAL_CARDS } from './cards';
import { shuffleInPlace } from './rng';
import { advance } from './step';
import type { GameState, GeneralSub, Identity } from './types';
// M16 武将池：标准版 25 名武将随机洗牌分给 5 个座次（白板不再入池）。技能见 skills.ts / ADR-0010~0022。
const GENERAL_POOL: Array<{ name: string; general: GeneralSub }> = [
  { name: '关羽', general: 'guanyu' },
  { name: '张飞', general: 'zhangfei' },
  { name: '赵云', general: 'zhaoyun' },
  { name: '曹操', general: 'caocao' },
  { name: '司马懿', general: 'simayi' },
  { name: '黄盖', general: 'huanggai' },
  { name: '周瑜', general: 'zhouyu' },
  { name: '吕布', general: 'lvbu' },
  { name: '孙尚香', general: 'sunshangxiang' },
  { name: '貂蝉', general: 'diaochan' },
  { name: '诸葛亮', general: 'zhugeliang' },
  { name: '甄姬', general: 'zhenji' },
  { name: '大乔', general: 'dajiao' },
  { name: '甘宁', general: 'ganning' },
  { name: '马超', general: 'machao' },
  { name: '孙权', general: 'sunquan' },
  { name: '夏侯惇', general: 'xiahoudun' },
  { name: '刘备', general: 'liubei' },
  { name: '华佗', general: 'huatuo' },
  { name: '张辽', general: 'zhangliao' },
  { name: '许褚', general: 'xuchu' },
  { name: '郭嘉', general: 'guojia' },
  { name: '黄月英', general: 'huangyueying' },
  { name: '吕蒙', general: 'lvmeng' },
  { name: '陆逊', general: 'luxun' },
];

// 体力：3 血武将表（标准版谋士/女性多为 3 血），主公位 +1（M11 清偿）
const HP3: ReadonlySet<GeneralSub> = new Set<GeneralSub>([
  'simayi', 'zhenji', 'zhugeliang', 'zhouyu', 'dajiao', 'sunshangxiang', 'diaochan', 'huatuo',
  'guojia', 'huangyueying', 'luxun', // M16 新增：郭嘉/黄月英/陆逊同为 3 血
]);

export function hpOf(general: GeneralSub, seatId: number): number {
  return (HP3.has(general) ? 3 : 4) + (seatId === 0 ? 1 : 0);
}

export function setup(seed: number): GameState {
  if (TOTAL_CARDS < 40) throw new Error('牌堆异常');
  const st: GameState = {
    seed: seed | 0,
    deck: [],
    discard: [],
    players: [],
    turnIdx: 0,
    turnCount: 0,
    phase: 'judge',
    playedSha: false,
    turnPlays: 0,
    judging: false,
    skipDraw: false,
    skipPlay: false,
    damageBonus: 0,
    shaUsed: false,
    drawPhaseAsked: false,
    prepared: false,
    usedSkills: [],
    frames: [],
    frameSeq: 0,
    triggerQueue: [],
    judgeState: null,
    pending: null,
    log: [],
    actionLog: [],
    winner: null,
  };
  const rest: Identity[] = ['zhong', 'fan', 'fan', 'nei'];
  shuffleInPlace(st, rest);
  const generals = [...GENERAL_POOL];
  shuffleInPlace(st, generals);
  st.players = generals.slice(0, 5).map(({ name, general }, id) => ({
    id,
    name,
    general,
    maxHp: hpOf(general, id),
    hp: hpOf(general, id),
    hand: [],
    equipment: {},
    judgements: [],
    alive: true,
    identity: id === 0 ? ('zhu' as const) : rest[id - 1]!,
  }));
  st.deck = buildDeck();
  shuffleInPlace(st, st.deck);
  for (let round = 0; round < 4; round++) {
    for (const p of st.players) p.hand.push(st.deck.pop()!);
  }
  st.log.push({ t: 'turnStart', player: 0 });
  advance(st);
  return st;
}
