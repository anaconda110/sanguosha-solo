// 领域术语见项目根 CONTEXT.md；架构决策见 docs/adr/。
//
// 本模块只保留 TypeScript 类型定义；运行时常量数据（M23 内容数据化）
// 迁至 src/content/**，在此 re-export——既有 import（engine/ai/UI/tests）
// 无需改动，引擎也保持不直接依赖内容层。

export { CARD_INFO, TRICK_SUBS } from '../content/cards';
export { SKILL_INFO } from '../content/skills';
export { GENERAL_SEX, FACTION_NAMES, GENERAL_FACTION, GENERAL_SKILLS, GENERAL_INFO } from '../content/generals';
export { IDENTITY_NAMES } from '../content/identity';

export type Suit = '♠' | '♥' | '♣' | '♦';
export type CardKind = 'basic' | 'trick' | 'equip';

/** 牌的具体身份；kind 与显示名见 CARD_INFO */
export type CardSub =
  | 'sha' | 'shan' | 'tao'
  | 'wuzhong' | 'guohe' | 'shunshou' | 'juedou' | 'nanman' | 'wanjian' | 'taoyuan' | 'wuxie'
  | 'wugu' | 'jiedao'
  | 'lebusi' | 'bingliang' | 'shandian'
  | 'liannu' | 'qinggang' | 'cixiong' | 'qinglong' | 'zhangba' | 'guanshi' | 'fangtian' | 'qilin'
  | 'bagua'
  | 'jia1ma' | 'jian1ma';

export interface CardInfo {
  kind: CardKind;
  display: string;
  /** 武器攻击范围 */
  range?: number;
  /** 悬停说明（一句话规则，M20 交互批） */
  desc: string;
}

export interface Card {
  id: number;
  sub: CardSub;
  suit: Suit;
  rank: number;
  /** 判定区里的延时锦囊被技能转换而来时，记录生效的牌名（离开判定区时清除） */
  asSub?: CardSub;
}

export type Identity = 'zhu' | 'zhong' | 'fan' | 'nei';

/** 武将；技能系统见 skills.ts 与 ADR-0010 */
export type GeneralSub =
  | 'baiban' | 'guanyu' | 'zhangfei' | 'zhaoyun'
  | 'caocao' | 'simayi' | 'huanggai' | 'zhouyu' | 'lvbu'
  | 'sunshangxiang' | 'diaochan'
  | 'zhugeliang' | 'zhenji'
  | 'dajiao' | 'ganning'
  | 'machao' | 'sunquan' | 'xiahoudun' | 'liubei' | 'huatuo'
  | 'zhangliao' | 'xuchu' | 'guojia' | 'huangyueying' | 'lvmeng' | 'luxun';

/** 技能；类型划分：use=用牌转换，trigger=受伤/判定触发，active=主动发动，lock=锁定技，lord=主公技 */
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
  | 'qingnang' | 'jijiu'
  | 'yingzi' | 'fanjian'
  | 'hujia' | 'jijiang' | 'jiuyuan'
  | 'tuxi' | 'luoyi' | 'tiandu' | 'yiji' | 'jizhi' | 'qicai' | 'keji' | 'qianxun' | 'lianying' | 'jieyin';

export interface SkillInfo {
  display: string;
  kind: 'use' | 'trigger' | 'active' | 'lock' | 'lord';
  desc: string;
}

/** 性别（雌雄双股剑 / 离间依赖） */
export type Sex = 'm' | 'f';

/** 势力（主公技依赖）：魏/蜀/吴/群 */
export type Faction = 'wei' | 'shu' | 'wu' | 'qun';

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
  /** 本目标已打出的无懈张数：奇数=被抵消（M11 无懈链，替代原 negated 布尔） */
  wuxieCount: number;
  askedWuxieIds: number[];
  /** 决斗专用：当前轮到谁出杀 */
  duelTurn: number;
  /** 决斗专用：当前应答者已打出的杀数（无双需要两张） */
  duelShaPlayed: number;
  /** 五谷丰登：翻开待领的牌（逐目标各取一张，剩余进弃牌堆） */
  wuguCards?: Card[];
  /** 借刀杀人：被要求出杀者应当攻击的目标 */
  jiedaoTargetId?: number;
}

/** 延时锦囊判定帧（ADR-0005）：判定阶段逐张结算判定区里的锦囊 */
export interface DelayedFrame {
  kind: 'delayedJudge';
  id: number;
  sub: CardSub;
  /** 判定区主人 */
  ownerId: number;
  /** 无懈链：已打出的无懈张数，奇数=该延时锦囊不判定直接弃置（M11） */
  wuxieCount: number;
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
  kind: 'play' | 'respondShan' | 'respondSha' | 'respondWuxie' | 'respondTao' | 'shaAgain' | 'pickCard' | 'trigger' | 'skillCard' | 'discard' | 'cixiong' | 'guanshi' | 'guanxing' | 'liuli' | 'fanjian' | 'wuguPick' | 'jiedao' | 'lordSkill'
  | 'drawPhase' | 'tuxi' | 'yiji';
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
  /** fanjian：反间的发起者与待展示的手牌（M11） */
  fanjian?: { sourceId: number; cardId: number };
  /** wuguPick：五谷丰登待选的牌（公开信息，全员可见） */
  wuguCards?: Card[];
  /** jiedao：借刀——被要求出杀者、杀的目标、借刀人（拒出杀则武器归属借刀人） */
  jiedao?: { user: number; victim: number; weaponSub: CardSub };
  /** lordSkill（M14 护驾/激将）：主公求援时的三段式状态 */
  lordPend?: Inquiry;
  /** lordSkill：尚未询问的盟友；respondShan/Sha 上表示"还剩这些盟友可代劳" */
  aidIds?: number[];
  /** respondShan/respondSha：应答者是代主公出牌（aidForId = 主公 id）——
   *  牌从应答者手中出，效果归于主公（M14 护驾/激将） */
  aidForId?: number;
  /** tuxi（张辽·突袭）：可被夺取手牌的其他角色 */
  tuxiTo?: number[];
  /** yiji（郭嘉·遗计）：待分配的牌（摸到后逐张决定给谁，剩余留在自己手里） */
  yijiPool?: Card[];
}

export type WinSide = 'zhu' | 'fan' | 'nei' | 'draw';

export type GameEvent =
  | { t: 'turnStart'; player: number }
  | { t: 'draw'; player: number; n: number }
  | { t: 'playCard'; player: number; card: CardSub; target?: number; /** 方天画戟：多目标 */ targets?: number[] }
  | { t: 'respond'; player: number; card: CardSub | null; resp: 'shan' | 'sha' | 'tao' | 'wuxie'; /** 代主公打出时记主公 id（护驾/激将） */ aid?: number }
  | { t: 'damage'; player: number; amount: number; source?: number; loss?: boolean }
  | { t: 'heal'; player: number; amount: number }
  | { t: 'dying'; player: number }
  | { t: 'death'; player: number; identity: Identity; killer?: number }
  | { t: 'rewardDraw'; player: number; n: number }
  | { t: 'penaltyDiscard'; player: number; n: number }
  | { t: 'discardCards'; player: number; n: number }
  | { t: 'wuguReveal'; player: number; card: Card }
  | { t: 'equip'; player: number; sub: CardSub }
  | { t: 'unequip'; player: number; sub: CardSub }
  | { t: 'gainCard'; player: number; from: number }
  | { t: 'negate'; player: number; sub: CardSub; targetId?: number; /** 无懈链中的第几张（奇数=抵消，偶数=反无懈令其恢复） */ chain?: number }
  | { t: 'judge'; player: number; card: Card; reason: 'lebusi' | 'bingliang' | 'shandian' | 'bagua' | 'luoshen' | 'tieji' | 'ganglie' }
  | { t: 'judgeModify'; player: number; sub: SkillSub; card: Card }
  | { t: 'moveJudgement'; sub: CardSub; from: number; to: number }
  | { t: 'skill'; player: number; sub: SkillSub; detail?: string }
  | { t: 'ability'; player: number; sub: CardSub; detail?: string }
  | { t: 'gameOver'; side: WinSide };

export type Action =
  | { type: 'playSha'; cardId: number; targetId: number; /** 丈八蛇矛：第二张手牌 */ cardId2?: number; /** 方天画戟：多目标（2-3 个） */ targetIds?: number[] }
  | { type: 'playTao'; cardId: number }
  | { type: 'playTrick'; cardId: number; targetId?: number; /** 借刀杀人：[持武器者, 杀的目标] */ targetIds?: number[] }
  | { type: 'playEquip'; cardId: number }
  | { type: 'useSkill'; sub: SkillSub; /** 离间/青囊/反间：弃置（或展示）的手牌 */ cardId?: number; /** 离间：两名男性（前者为决斗使用者）；仁德/青囊/反间：目标 */ targetIds?: number[]; /** 制衡/仁德：多张手牌 */ cardIds?: number[] }
  | { type: 'respondFanjian'; /** 反间：猜测的花色 */ suit: Suit }
  | { type: 'respondWugu'; /** 五谷丰登：领取的牌 */ cardId: number }
  | { type: 'respondJiedao'; /** 借刀杀人：打出的杀（null = 交出武器） */ cardId: number | null }
  | { type: 'respondLord'; /** 主公技（护驾/激将）：是否向同势力盟友求助 */ use: boolean }
  | { type: 'respondDraw'; /** 摸牌阶段抉择（张辽突袭/许褚裸衣） */ skill?: 'tuxi' | 'luoyi' }
  | { type: 'respondTuxi'; /** 突袭：被夺取手牌的角色（至多两名） */ targetIds: number[] }
  | { type: 'respondYiji'; /** 遗计：把池中一张牌交给某人（null = 留给自己） */ cardId: number; toId: number | null }
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
  /** 本回合伤害加成（许褚·裸衣：杀/决斗 +1） */
  damageBonus: number;
  /** 本回合是否使用或打出过【杀】（吕蒙·克己 用） */
  shaUsed: boolean;
  /** 本回合是否已问过摸牌阶段抉择（张辽突袭/许褚裸衣，M16） */
  drawPhaseAsked: boolean;
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
