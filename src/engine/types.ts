// 领域术语见项目根 CONTEXT.md；架构决策见 docs/adr/。

export type Suit = '♠' | '♥' | '♣' | '♦';
export type CardKind = 'basic' | 'trick' | 'equip';

/** 牌的具体身份；kind 与显示名见 CARD_INFO */
export type CardSub =
  | 'sha' | 'shan' | 'tao'
  | 'wuzhong' | 'guohe' | 'shunshou' | 'juedou' | 'nanman' | 'wanjian' | 'taoyuan' | 'wuxie'
  | 'lebusi' | 'bingliang' | 'shandian'
  | 'liannu' | 'qinggang' | 'cixiong' | 'qinglong' | 'zhangba' | 'guanshi' | 'fangtian' | 'qilin'
  | 'bagua'
  | 'jia1ma' | 'jian1ma';

export interface CardInfo {
  kind: CardKind;
  display: string;
  /** 武器攻击范围 */
  range?: number;
}

export const CARD_INFO: Record<CardSub, CardInfo> = {
  sha: { kind: 'basic', display: '杀' },
  shan: { kind: 'basic', display: '闪' },
  tao: { kind: 'basic', display: '桃' },
  wuzhong: { kind: 'trick', display: '无中生有' },
  guohe: { kind: 'trick', display: '过河拆桥' },
  shunshou: { kind: 'trick', display: '顺手牵羊' },
  juedou: { kind: 'trick', display: '决斗' },
  nanman: { kind: 'trick', display: '南蛮入侵' },
  wanjian: { kind: 'trick', display: '万箭齐发' },
  taoyuan: { kind: 'trick', display: '桃园结义' },
  wuxie: { kind: 'trick', display: '无懈可击' },
  lebusi: { kind: 'trick', display: '乐不思蜀' },
  bingliang: { kind: 'trick', display: '兵粮寸断' },
  shandian: { kind: 'trick', display: '闪电' },
  liannu: { kind: 'equip', display: '诸葛连弩', range: 1 },
  qinggang: { kind: 'equip', display: '青釭剑', range: 2 },
  cixiong: { kind: 'equip', display: '雌雄双股剑', range: 2 },
  qinglong: { kind: 'equip', display: '青龙偃月刀', range: 3 },
  zhangba: { kind: 'equip', display: '丈八蛇矛', range: 3 },
  guanshi: { kind: 'equip', display: '贯石斧', range: 3 },
  fangtian: { kind: 'equip', display: '方天画戟', range: 4 },
  qilin: { kind: 'equip', display: '麒麟弓', range: 5 },
  bagua: { kind: 'equip', display: '八卦阵' },
  jia1ma: { kind: 'equip', display: '+1马' },
  jian1ma: { kind: 'equip', display: '-1马' },
};

export interface Card {
  id: number;
  sub: CardSub;
  suit: Suit;
  rank: number;
  /** 判定区里的延时锦囊被技能转换而来时，记录生效的牌名（离开判定区时清除） */
  asSub?: CardSub;
}

export type Identity = 'zhu' | 'zhong' | 'fan' | 'nei';

export const IDENTITY_NAMES: Record<Identity, string> = {
  zhu: '主公',
  zhong: '忠臣',
  fan: '反贼',
  nei: '内奸',
};

/** 武将；技能系统见 skills.ts 与 ADR-0010 */
export type GeneralSub =
  | 'baiban' | 'guanyu' | 'zhangfei' | 'zhaoyun'
  | 'caocao' | 'simayi' | 'huanggai' | 'zhouyu' | 'lvbu'
  | 'sunshangxiang' | 'diaochan'
  | 'zhugeliang' | 'zhenji'
  | 'dajiao' | 'ganning'
  | 'machao' | 'sunquan' | 'xiahoudun' | 'liubei' | 'huatuo';

/** 技能；类型划分：use=用牌转换，trigger=受伤/判定触发，active=主动发动，lock=锁定技 */
export type SkillSub =
  | 'wusheng' | 'paoxiao' | 'longdan'
  | 'jianxiong' | 'fankui' | 'guicai'
  | 'kurou' | 'wushuang'
  | 'xiaoji'
  | 'lijian' | 'biyue'
  | 'guanxing' | 'kongcheng'
  | 'luoshen' | 'qingguo'
  | 'guose' | 'liuli' | 'qixi'
  | 'mashu' | 'tieji'
  | 'ganglie'
  | 'zhiheng'
  | 'rende'
  | 'qingnang' | 'jijiu';

export interface SkillInfo {
  display: string;
  kind: 'use' | 'trigger' | 'active' | 'lock';
  desc: string;
}

export const SKILL_INFO: Record<SkillSub, SkillInfo> = {
  wusheng: { display: '武圣', kind: 'use', desc: '你可以将一张红色牌当【杀】使用或打出' },
  paoxiao: { display: '咆哮', kind: 'lock', desc: '你使用【杀】无次数限制' },
  longdan: { display: '龙胆', kind: 'use', desc: '你可以将【杀】当【闪】、【闪】当【杀】使用或打出' },
  jianxiong: { display: '奸雄', kind: 'trigger', desc: '你受到伤害后，可以获得造成伤害的牌' },
  fankui: { display: '反馈', kind: 'trigger', desc: '你受到伤害后，可以获得伤害来源的一张牌' },
  guicai: { display: '鬼才', kind: 'trigger', desc: '判定牌生效前，你可以打出一张手牌替换之' },
  kurou: { display: '苦肉', kind: 'active', desc: '出牌阶段，你可以失去1点体力，摸两张牌' },
  wushuang: { display: '无双', kind: 'lock', desc: '你使用【杀】需两张【闪】响应；与你【决斗】需打出两张【杀】' },
  xiaoji: { display: '枭姬', kind: 'trigger', desc: '当你失去装备区里的一张牌后，你可以摸两张牌' },
  lijian: { display: '离间', kind: 'active', desc: '出牌阶段限一次，你可以弃置一张手牌并指定两名男性角色，视为前者对后者使用一张【决斗】' },
  biyue: { display: '闭月', kind: 'trigger', desc: '结束阶段，你可以摸一张牌' },
  guanxing: { display: '观星', kind: 'active', desc: '准备阶段，你可以观看牌堆顶的X张牌（X为存活角色数），将其中任意牌置于牌堆顶，其余置于牌堆底' },
  kongcheng: { display: '空城', kind: 'lock', desc: '锁定技，若你没有手牌，你不能成为【杀】和【决斗】的目标' },
  luoshen: { display: '洛神', kind: 'trigger', desc: '准备阶段，你可以进行判定：若结果为黑色，你获得此判定牌并可以继续判定' },
  qingguo: { display: '倾国', kind: 'use', desc: '你可以将一张黑色手牌当【闪】使用或打出' },
  guose: { display: '国色', kind: 'use', desc: '你可以将一张方块牌当【乐不思蜀】使用' },
  liuli: { display: '流离', kind: 'trigger', desc: '当你成为【杀】的目标时，你可以弃置一张手牌并转移给距离你1以内的一名其他男性角色' },
  qixi: { display: '奇袭', kind: 'use', desc: '你可以将一张黑色牌当【过河拆桥】使用' },
  mashu: { display: '马术', kind: 'lock', desc: '锁定技，你计算与其他角色的距离时始终-1' },
  tieji: { display: '铁骑', kind: 'trigger', desc: '当你使用【杀】指定目标后，你可以进行判定：若结果为红色，此【杀】不可被【闪】响应' },
  ganglie: { display: '刚烈', kind: 'trigger', desc: '当你受到伤害后，你可以进行判定：若结果非红桃，伤害来源受到1点伤害' },
  zhiheng: { display: '制衡', kind: 'active', desc: '出牌阶段限一次，你可以弃置任意张手牌，然后摸等量的牌' },
  rende: { display: '仁德', kind: 'active', desc: '出牌阶段限一次，你可以将任意张手牌交给一名其他角色，若给出的牌数不少于两张，你回复1点体力' },
  qingnang: { display: '青囊', kind: 'active', desc: '出牌阶段限一次，你可以弃置一张手牌并选择一名已受伤的角色，其回复1点体力' },
  jijiu: { display: '急救', kind: 'use', desc: '你的回合外，你可以将一张红色牌当【桃】使用' },
};

/** 性别（雌雄双股剑 / 离间依赖） */
export type Sex = 'm' | 'f';
export const GENERAL_SEX: Record<GeneralSub, Sex> = {
  baiban: 'm', guanyu: 'm', zhangfei: 'm', zhaoyun: 'm',
  caocao: 'm', simayi: 'm', huanggai: 'm', zhouyu: 'm', lvbu: 'm',
  sunshangxiang: 'f', diaochan: 'f',
  zhugeliang: 'm', zhenji: 'f',
  dajiao: 'f', ganning: 'm',
  machao: 'm', sunquan: 'm', xiahoudun: 'm', liubei: 'm', huatuo: 'm',
};

export const GENERAL_SKILLS: Record<GeneralSub, SkillSub[]> = {
  baiban: [],
  guanyu: ['wusheng'],
  zhangfei: ['paoxiao'],
  zhaoyun: ['longdan'],
  caocao: ['jianxiong'],
  simayi: ['guicai'],
  huanggai: ['kurou'],
  zhouyu: ['fankui'],
  lvbu: ['wushuang'],
  sunshangxiang: ['xiaoji'],
  diaochan: ['lijian', 'biyue'],
  zhugeliang: ['guanxing', 'kongcheng'],
  zhenji: ['luoshen', 'qingguo'],
  dajiao: ['guose', 'liuli'],
  ganning: ['qixi'],
  machao: ['mashu', 'tieji'],
  sunquan: ['zhiheng'],
  xiahoudun: ['ganglie'],
  liubei: ['rende'],
  huatuo: ['qingnang', 'jijiu'],
};

export const GENERAL_INFO: Record<GeneralSub, { display: string; skill: string }> = Object.fromEntries(
  (Object.keys(GENERAL_SKILLS) as GeneralSub[]).map(g => [
    g,
    {
      display: {
        baiban: '白板', guanyu: '关羽', zhangfei: '张飞', zhaoyun: '赵云',
        caocao: '曹操', simayi: '司马懿', huanggai: '黄盖', zhouyu: '周瑜', lvbu: '吕布',
        sunshangxiang: '孙尚香', diaochan: '貂蝉',
        zhugeliang: '诸葛亮', zhenji: '甄姬',
        dajiao: '大乔', ganning: '甘宁',
        machao: '马超', sunquan: '孙权', xiahoudun: '夏侯惇', liubei: '刘备', huatuo: '华佗',
      }[g],
      skill: GENERAL_SKILLS[g].map(s => SKILL_INFO[s].display).join('·'),
    },
  ]),
) as Record<GeneralSub, { display: string; skill: string }>;

export type Phase = 'judge' | 'draw' | 'play' | 'discard';

export type EquipSlot = 'weapon' | 'shield' | 'jia1ma' | 'jian1ma';

export interface PlayerState {
  id: number;
  name: string;
  general: GeneralSub;
  hp: number;
  maxHp: number;
  hand: Card[];
  equipment: Partial<Record<EquipSlot, Card>>;
  /** 判定区：延时锦囊按放置顺序存放 */
  judgements: Card[];
  alive: boolean;
  identity: Identity;
}

/** 锦囊结算帧（ADR-0004）：一张需要多步结算的锦囊对应一个帧 */
export interface TrickFrame {
  kind: 'trick';
  id: number;
  sub: CardSub;
  userId: number;
  /** 使用者打出的那张牌（奸雄/反馈的伤害因果；在弃牌堆中） */
  cardId: number;
  /** 结算目标顺序（使用者下家起顺时针；单目标锦囊只有一个） */
  targets: number[];
  idx: number;
  /** 当前目标：先无懈询问（wuxie）再结算效果（effect）；拆/顺在效果前有选牌（pick）阶段 */
  stage: 'wuxie' | 'effect' | 'pick';
  negated: boolean;
  askedWuxieIds: number[];
  /** 决斗专用：当前轮到谁出杀 */
  duelTurn: number;
  /** 决斗专用：当前应答者已打出的杀数（无双需要两张） */
  duelShaPlayed: number;
}

/** 延时锦囊判定帧（ADR-0005）：判定阶段逐张结算判定区里的锦囊 */
export interface DelayedFrame {
  kind: 'delayedJudge';
  id: number;
  sub: CardSub;
  /** 判定区主人 */
  ownerId: number;
  askedWuxieIds: number[];
}

/**
 * 杀结算帧（M5）：杀统一走帧栈，与锦囊帧同样的逐目标推进。
 * 每目标依序：雌雄双股剑选择 → 出闪（无双需两张，青釭剑无视八卦）→ 命中/闪避（贯石斧/青龙刀）。
 */
export interface ShaFrame {
  kind: 'sha';
  id: number;
  userId: number;
  /** 使用者打出的那张杀（在弃牌堆中；奸雄因果） */
  cardId: number;
  targets: number[];
  idx: number;
  /** 已结算过雌雄双股剑选择的目标（每目标一次） */
  cixiongDone: number[];
  /** 已结算过流离转移的目标（每目标一次，防 A/B 互转死循环） */
  liuliDone: number[];
  /** 铁骑：已判定过的目标 / 判定成功（不可闪避）的目标 */
  tiejiTried: number[];
  tiejiHit: number[];
}

export type Frame = TrickFrame | DelayedFrame | ShaFrame;

/** 判定结算上下文（M4：翻滚判定牌 → 鬼才询问链 → 生效） */
export interface JudgeState {
  forId: number;
  reason: 'lebusi' | 'bingliang' | 'shandian' | 'bagua' | 'luoshen' | 'tieji' | 'ganglie';
  /** 当前生效的判定牌（可被鬼才替换） */
  result: Card;
  /** 已询问过鬼才的玩家 */
  usedGuicai: number[];
  mode: 'delayed' | 'bagua' | 'luoshen' | 'tieji' | 'ganglie';
  /** delayed：判定区里的那张延时锦囊（生效时处置） */
  delayedSub?: CardSub;
  zoneCard?: Card;
  /** bagua：触发八卦的原询问（判定完成后继续出闪流程） */
  baguaPend?: Inquiry;
  /** tieji：所属杀帧与目标（判定完成后标记不可闪避） */
  tiejiFrameId?: number;
  tiejiTargetId?: number;
  /** ganglie：反伤的伤害来源 */
  ganglieSourceId?: number;
}
/** 触发技队列条目（奸雄/反馈），在 pending 清空后、帧推进前消费 */
export interface PendingTrigger {
  sub: SkillSub;
  playerId: number;
  sourceId?: number;
  /** 奸雄：造成伤害的牌 */
  cards?: Card[];
}

/**
 * 待决策的询问。引擎推进到需要某名玩家做选择时停下，pending 即当前问题；
 * 真人玩家与 AI 都必须通过 step() 提交一个 Action 来应答。
 */
export interface Inquiry {
  playerId: number;
  kind: 'play' | 'respondShan' | 'respondSha' | 'respondWuxie' | 'respondTao' | 'shaAgain' | 'pickCard' | 'trigger' | 'skillCard' | 'discard' | 'cixiong' | 'guanshi' | 'guanxing' | 'liuli';
  /** respondShan/respondTao：杀的来源（结算奖惩用） */
  shaSourceId?: number;
  /** respondTao：濒死的玩家 */
  dyingId?: number;
  /** respondShan/respondTao：本轮求桃已询问过的玩家，保证询问链必然终止 */
  askedIds?: number[];
  /** respondShan：八卦阵判定已尝试过（判黑后不可重复判定） */
  baguaTried?: boolean;
  /** respondShan：需要打出的闪数（无双为 2）与已打出数 */
  needShan?: number;
  shanPlayed?: number;
  /** respondShan：造成本次杀的牌（奸雄用） */
  shaCardId?: number;
  /** 帧内应答（respondShan 万箭 / respondSha / respondWuxie）：所属结算帧 */
  frameId?: number;
  /** 提示用：涉及的锦囊与当前结算目标 */
  trickSub?: CardSub;
  trickTargetId?: number;
  /** shaAgain：青龙偃月刀再杀的目标 */
  targetId?: number;
  /** discard：需要弃置的张数 */
  count?: number;
  /** trigger/skillCard：技能 */
  sub?: SkillSub;
  /** trigger：奸雄获得的牌 */
  triggerCards?: Card[];
  /** trigger：反馈的来源 */
  triggerSourceId?: number;
  /** pickCard：由技能发起的选牌（反馈），目标在 trickTargetId */
  skillPick?: { ownerId: number; sub: SkillSub };
  /** respondShan：来源装备青釭剑，无视八卦阵 */
  qinggang?: boolean;
  /** cixiong：雌雄双股剑的选择（弃手牌则杀无效，frameId 指向杀帧） */
  cixiong?: { sourceId: number; frameId: number };
  /** guanshi：贯石斧强行命中的目标与杀牌 */
  guanshi?: { targetId: number; shaCardId: number; frameId: number };
  /** guanxing：翻看的牌堆顶牌（仅该玩家决策时可见） */
  guanxingCards?: Card[];
  /** liuli：可转移的男性目标（距离1以内、非杀的使用者） */
  liuliTo?: number[];
  /** liuli：杀的来源（禁止转移给他） */
  liuliSourceId?: number;
}

export type WinSide = 'zhu' | 'fan' | 'nei' | 'draw';

export type GameEvent =
  | { t: 'turnStart'; player: number }
  | { t: 'draw'; player: number; n: number }
  | { t: 'playCard'; player: number; card: CardSub; target?: number; /** 方天画戟：多目标 */ targets?: number[] }
  | { t: 'respond'; player: number; card: CardSub | null; resp: 'shan' | 'sha' | 'tao' | 'wuxie' }
  | { t: 'damage'; player: number; amount: number; source?: number; loss?: boolean }
  | { t: 'heal'; player: number; amount: number }
  | { t: 'dying'; player: number }
  | { t: 'death'; player: number; identity: Identity; killer?: number }
  | { t: 'rewardDraw'; player: number; n: number }
  | { t: 'penaltyDiscard'; player: number; n: number }
  | { t: 'discardCards'; player: number; n: number }
  | { t: 'equip'; player: number; sub: CardSub }
  | { t: 'unequip'; player: number; sub: CardSub }
  | { t: 'gainCard'; player: number; from: number }
  | { t: 'negate'; player: number; sub: CardSub; targetId?: number }
  | { t: 'judge'; player: number; card: Card; reason: 'lebusi' | 'bingliang' | 'shandian' | 'bagua' | 'luoshen' | 'tieji' | 'ganglie' }
  | { t: 'judgeModify'; player: number; sub: SkillSub; card: Card }
  | { t: 'moveJudgement'; sub: CardSub; from: number; to: number }
  | { t: 'skill'; player: number; sub: SkillSub; detail?: string }
  | { t: 'ability'; player: number; sub: CardSub; detail?: string }
  | { t: 'gameOver'; side: WinSide };

export type Action =
  | { type: 'playSha'; cardId: number; targetId: number; /** 丈八蛇矛：第二张手牌 */ cardId2?: number; /** 方天画戟：多目标（2-3 个） */ targetIds?: number[] }
  | { type: 'playTao'; cardId: number }
  | { type: 'playTrick'; cardId: number; targetId?: number }
  | { type: 'playEquip'; cardId: number }
  | { type: 'useSkill'; sub: SkillSub; /** 离间：弃置的手牌；青囊：弃置的手牌 */ cardId?: number; /** 离间：两名男性（前者为决斗使用者）；仁德/青囊：目标 */ targetIds?: number[]; /** 制衡/仁德：多张手牌 */ cardIds?: number[] }
  | { type: 'endPlay' }
  | { type: 'respondShan'; cardId: number | null }
  | { type: 'respondSha'; cardId: number | null }
  | { type: 'respondWuxie'; cardId: number | null }
  | { type: 'respondTao'; cardId: number | null }
  | { type: 'respondBagua' }
  | { type: 'respondTrigger'; use: boolean }
  | { type: 'respondSkillCard'; cardId: number | null }
  | { type: 'respondCixiong'; discard: boolean }
  | { type: 'respondGuanshi'; cardIds: number[] | null }
  | { type: 'respondGuanxing'; /** 置顶的牌按希望摸取的顺序；其余置底 */ topIds: number[] }
  | { type: 'respondLiuli'; /** 弃置的手牌；null = 不发动 */ cardId: number | null; /** 转移目标 */ transferTo?: number }
  | { type: 'shaAgain'; cardId: number | null }
  | { type: 'pickCard'; from: 'hand' | EquipSlot }
  | { type: 'discard'; cardIds: number[] };

export interface GameState {
  /** 随机数种子，随状态一起克隆，保证任意快照可复现 */
  seed: number;
  deck: Card[];
  discard: Card[];
  players: PlayerState[];
  turnIdx: number;
  /** 已开始的回合总数；达到 MAX_TURNS 强制平局（防 AI 死守，ADR-0007） */
  turnCount: number;
  phase: Phase;
  /** 本回合是否已使用过杀（连弩/咆哮豁免） */
  playedSha: boolean;
  /** 本回合已执行的动作数（出牌阶段）；0 = 回合首个决策点（MC 接管处） */
  turnPlays: number;
  /** 判定阶段处理标记；乐/兵效果对应的本回合跳相 */
  judging: boolean;
  skipDraw: boolean;
  skipPlay: boolean;
  /** 本回合是否已过准备阶段（观星/洛神在准备阶段介入，M7） */
  prepared: boolean;
  /** 本回合已发动过的技能（苦肉等限次技能） */
  usedSkills: SkillSub[];
  /** 锦囊结算栈（ADR-0004） */
  frames: Frame[];
  frameSeq: number;
  /** 触发技队列（M4） */
  triggerQueue: PendingTrigger[];
  /** 判定结算上下文（M4，鬼才询问链） */
  judgeState: JudgeState | null;
  pending: Inquiry | null;
  log: GameEvent[];
  /** 本局的完整动作序列，供回放重演（ADR-0005） */
  actionLog: Action[];
  winner: null | { side: WinSide };
}
