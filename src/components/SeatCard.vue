<script setup lang="ts">
// 座次卡（ADR-0009，M22 自 App.vue 迁出）：单个座次的可见信息（头像/身份/体力/技能/装备/判定/浮字）。
// 纯展示组件：外框 .seat 定位与点击/悬停/目标高亮由父级（TableArea）编排。
import { ref } from 'vue';
import { GENERAL_INFO, IDENTITY_NAMES } from '../engine/types';
import type { PublicPlayer } from '../engine/view';
import type { FloatText } from '../composables/useAnimations';
import { disp } from '../composables/labels';

defineProps<{
  p: PublicPlayer;
  isHuman: boolean;
  skillOn: boolean;
  floats: FloatText[];
}>();

// —— 立绘（ADR-0009）：程序生成占位徽章；本地素材放 public/avatars/<pinyin>.png 自动覆盖 ——
const AVATAR_PINYIN: Record<string, string> = {
  刘备: 'liubei', 关羽: 'guanyu', 张飞: 'zhangfei', 赵云: 'zhaoyun', 曹操: 'caocao',
  司马懿: 'simayi', 黄盖: 'huanggai', 周瑜: 'zhouyu', 吕布: 'lvbu',
  孙尚香: 'sunshangxiang', 貂蝉: 'diaochan',
  诸葛亮: 'zhugeliang', 甄姬: 'zhenji',
  大乔: 'dajiao', 甘宁: 'ganning',
  马超: 'machao', 孙权: 'sunquan', 夏侯惇: 'xiahoudun', 刘备: 'liubei', 华佗: 'huatuo',
};
const AVATAR_COLORS: Record<string, [string, string]> = {
  liubei: ['#2c5f8a', '#5b9bd5'],
  guanyu: ['#1e4d2b', '#3f9e5a'],
  zhangfei: ['#5c1f1f', '#b04242'],
  zhaoyun: ['#3a2d5c', '#7a63c4'],
  caocao: ['#4a3a12', '#b08a2e'],
  simayi: ['#2a2f3a', '#5a6478'],
  huanggai: ['#5c3a1f', '#a06a2e'],
  zhouyu: ['#5c1f3a', '#b04278'],
  lvbu: ['#3a1f1f', '#8a3a3a'],
  sunshangxiang: ['#7a1f3a', '#c45a8a'],
  diaochan: ['#5c2a5c', '#b06ac4'],
  zhugeliang: ['#1f4a5c', '#3a9eb0'],
  zhenji: ['#2a3a5c', '#6a8ac4'],
  dajiao: ['#3a5c2a', '#7ab04a'],
  ganning: ['#2a2a3a', '#6a6a8a'],
  machao: ['#5c3a1a', '#b07a3a'],
  sunquan: ['#1a3a5c', '#3a7ab0'],
  xiahoudun: ['#3a1a2a', '#8a3a5a'],
  liubei: ['#2c5f8a', '#5b9bd5'],
  huatuo: ['#1f4a3a', '#3a9e7a'],
  baiban: ['#333', '#666'],
};
const avatarFailed = ref<Set<string>>(new Set());

function avatarFallback(name: string): string {
  const pinyin = AVATAR_PINYIN[name] ?? 'baiban';
  const [c1, c2] = AVATAR_COLORS[pinyin] ?? ['#333', '#666'];
  const ch = name[0] ?? '?';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>` +
    `</linearGradient></defs>` +
    `<rect width="64" height="64" rx="8" fill="url(#g)"/>` +
    `<text x="32" y="42" font-size="30" font-family="serif" font-weight="bold" fill="#fff" text-anchor="middle" opacity="0.92">${ch}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function avatarSrc(name: string): string {
  if (avatarFailed.value.has(name)) return avatarFallback(name);
  const pinyin = AVATAR_PINYIN[name];
  return pinyin ? `/avatars/${pinyin}.png` : avatarFallback(name);
}

function onAvatarError(name: string) {
  avatarFailed.value.add(name);
}
</script>

<template>
  <div class="phead">
    <img
      class="avatar"
      :src="avatarSrc(p.name)"
      :alt="p.name"
      @error="onAvatarError(p.name)"
    />
    <div class="pname">{{ p.name }}<span class="sex" :class="{ 'sex-f': p.sex === 'f' }">{{ p.sex === 'f' ? '♀' : '♂' }}</span> <span v-if="isHuman" class="you">你</span></div>
  </div>
  <div class="pid" :class="p.identity ? 'id-' + p.identity : ''">
    {{ p.identity ? IDENTITY_NAMES[p.identity] : '身份?' }}
  </div>
  <div class="hp">
    <span v-for="i in p.maxHp" :key="i" class="heart" :class="{ on: i <= p.hp }">♥</span>
  </div>
  <div class="skill" :class="{ 'skill-on': skillOn }">
    {{ GENERAL_INFO[p.general].skill || '白板' }}
  </div>
  <div class="equips">{{ p.equips.map(disp).join(' · ') }}</div>
  <div class="judgs">{{ p.judgements.map(disp).join(' ') }}</div>
  <div class="handcount">手牌 {{ p.handCount }}</div>
  <div class="float-layer">
    <div v-for="f in floats" :key="f.id" class="float" :class="'float-' + f.kind">
      {{ f.text }}
    </div>
  </div>
</template>

<style>
.phead {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.avatar {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  flex: 0 0 auto;
}
.pname {
  font-size: 15px;
  font-weight: bold;
}
.you {
  background: #2d6cdf;
  color: #fff;
  font-size: 11px;
  border-radius: 4px;
  padding: 0 4px;
  margin-left: 2px;
}
.sex {
  font-size: 12px;
  opacity: 0.65;
  margin-left: 2px;
}
.sex-f {
  color: #e88ab0;
  opacity: 1;
}
.pid {
  font-size: 12px;
  color: #8b93a3;
  margin: 4px 0;
}
.hp {
  font-size: 13px;
  letter-spacing: 2px;
  margin-bottom: 4px;
}
.heart {
  color: #3a3f4a;
}
.heart.on {
  color: #e05555;
}
.skill {
  font-size: 11px;
  color: #7fb8e0;
  min-height: 15px;
}
.skill.skill-on {
  color: #e5b567;
  font-weight: bold;
}
.equips {
  font-size: 11px;
  color: #7fd08a;
  min-height: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.judgs {
  font-size: 11px;
  color: #e5b567;
  min-height: 15px;
}
.handcount {
  font-size: 12px;
  color: #8b93a3;
}
.float-layer {
  position: absolute;
  left: 0;
  right: 0;
  top: 10%;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 6;
}
.float {
  font-size: 13px;
  font-weight: bold;
  white-space: nowrap;
  animation: floatUp 1.5s ease-out forwards;
  text-shadow: 0 1px 3px #000;
}
.float-card {
  color: #ffd9a8;
}
.float-dmg {
  color: #ff6b6b;
  font-size: 16px;
}
.float-heal {
  color: #7fd08a;
}
.float-death {
  color: #999;
}
.float-judge {
  color: #c39bff;
}
.float-wuxie {
  color: #7fb8e0;
}
@keyframes floatUp {
  0% {
    opacity: 0;
    transform: translateY(6px);
  }
  20% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-18px);
  }
}
</style>
