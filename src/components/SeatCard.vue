<script setup lang="ts">
// 单个座次的可见信息：头像、身份、体力、技能、装备、判定与浮字。
// 外框定位和点击/目标高亮由 TableArea 编排。
import { ref } from 'vue';
import { FACTION_NAMES, GENERAL_FACTION, GENERAL_INFO, IDENTITY_NAMES } from '../engine/types';
import type { PublicPlayer } from '../engine/view';
import type { FloatText } from '../composables/useAnimations';
import { disp } from '../composables/labels';

defineProps<{
  p: PublicPlayer;
  isHuman: boolean;
  skillOn: boolean;
  floats: FloatText[];
}>();

const AVATAR_PINYIN: Record<string, string> = {
  刘备: 'liubei', 关羽: 'guanyu', 张飞: 'zhangfei', 赵云: 'zhaoyun', 曹操: 'caocao',
  司马懿: 'simayi', 黄盖: 'huanggai', 周瑜: 'zhouyu', 吕布: 'lvbu',
  孙尚香: 'sunshangxiang', 貂蝉: 'diaochan',
  诸葛亮: 'zhugeliang', 甄姬: 'zhenji',
  大乔: 'dajiao', 甘宁: 'ganning',
  马超: 'machao', 孙权: 'sunquan', 夏侯惇: 'xiahoudun', 华佗: 'huatuo',
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
  <div class="seat-head">
    <div class="avatar-frame">
      <img
        class="avatar"
        :src="avatarSrc(p.name)"
        :alt="p.name"
        @error="onAvatarError(p.name)"
      />
      <span class="faction-mark" :class="'faction-' + GENERAL_FACTION[p.general]">{{ FACTION_NAMES[GENERAL_FACTION[p.general]] }}</span>
    </div>
    <div class="seat-person">
      <div class="pname">
        {{ p.name }}<span class="sex" :class="{ 'sex-f': p.sex === 'f' }">{{ p.sex === 'f' ? '♀' : '♂' }}</span>
        <span v-if="isHuman" class="you">你</span>
      </div>
      <div class="seat-meta">
        <span class="pid-badge" :class="p.identity ? 'id-' + p.identity : 'id-hidden'">
          {{ p.identity ? IDENTITY_NAMES[p.identity] : '身份?' }}
        </span>
        <span class="handcount" title="手牌数">手牌 {{ p.handCount }}</span>
      </div>
    </div>
    <span v-if="skillOn" class="skill-live" title="技能处于可发动状态" />
  </div>

  <div class="vitals">
    <span class="hp-number" aria-label="体力">{{ p.hp }}<small>/{{ p.maxHp }}</small></span>
    <span class="hp-track" aria-hidden="true">
      <i v-for="i in p.maxHp" :key="i" :class="{ on: i <= p.hp }" />
    </span>
  </div>

  <div class="skill" :class="{ 'skill-on': skillOn }">
    <span class="skill-dot" />
    <span>{{ GENERAL_INFO[p.general].skill || '无技能' }}</span>
  </div>

  <div class="seat-chips">
    <span class="equips" :class="{ empty: p.equips.length === 0 }" :title="p.equips.map(disp).join(' · ') || '无装备'">
      <span class="chip-key">装</span>{{ p.equips.map(disp).join(' · ') || '无' }}
    </span>
    <span v-if="p.judgements.length" class="judgs" :title="p.judgements.map(disp).join(' ')">
      <span class="chip-key">判</span>{{ p.judgements.map(disp).join(' ') }}
    </span>
  </div>

  <div class="float-layer">
    <div v-for="f in floats" :key="f.id" class="float" :class="'float-' + f.kind">
      {{ f.text }}
    </div>
  </div>
</template>

<style>
.seat-head {
  display: flex;
  align-items: center;
  gap: 9px;
  text-align: left;
}
.avatar-frame {
  position: relative;
  flex: 0 0 auto;
}
.avatar {
  display: block;
  width: 50px;
  height: 50px;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 9px;
  object-fit: cover;
  background: #252b31;
}
.faction-mark {
  position: absolute;
  right: -4px;
  bottom: -4px;
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border: 1px solid #0d1114;
  border-radius: 5px;
  background: #485157;
  color: #fff;
  font-size: 9px;
  font-weight: 800;
  box-shadow: 0 2px 5px rgb(0 0 0 / 45%);
}
.faction-wei { background: #3f628c; }
.faction-shu { background: #7e3835; }
.faction-wu { background: #2e6b4d; }
.faction-qun { background: #68636d; }
.seat-person {
  min-width: 0;
  flex: 1;
}
.pname {
  overflow: hidden;
  color: var(--text, #f2ead8);
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: 17px;
  font-weight: 800;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sex {
  margin-left: 2px;
  color: #92a2ad;
  font-family: inherit;
  font-size: 11px;
  font-weight: 400;
}
.sex-f {
  color: #e59ab7;
}
.you {
  display: inline-block;
  margin-left: 4px;
  padding: 0 5px;
  border: 1px solid #d6b36d;
  border-radius: 4px;
  background: rgb(217 181 111 / 15%);
  color: #f1d597;
  font-family: 'Microsoft YaHei', sans-serif;
  font-size: 9px;
  font-weight: 600;
  vertical-align: 2px;
}
.seat-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
}
.pid-badge {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.5;
}
.id-hidden {
  background: #252c32;
  color: #75838d;
}
.handcount {
  color: #84919a;
  font-size: 10px;
  white-space: nowrap;
}
.skill-live {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #ddbc72;
  box-shadow: 0 0 0 3px rgb(221 188 114 / 14%), 0 0 10px rgb(221 188 114 / 55%);
}
.vitals {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.hp-number {
  min-width: 25px;
  color: #f09a9a;
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
}
.hp-number small {
  color: #7e8991;
  font-size: 9px;
  font-weight: 400;
}
.hp-track {
  display: flex;
  flex: 1;
  gap: 3px;
}
.hp-track i {
  height: 6px;
  flex: 1;
  border-radius: 3px;
  background: #30383e;
  box-shadow: inset 0 1px 2px rgb(0 0 0 / 35%);
}
.hp-track i.on {
  background: linear-gradient(90deg, #a93f42, #e06a68);
  box-shadow: 0 0 5px rgb(224 106 104 / 28%);
}
.skill {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 17px;
  margin-top: 6px;
  overflow: hidden;
  color: #72a8bd;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.skill-dot {
  width: 4px;
  height: 4px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: currentColor;
}
.skill.skill-on {
  color: #e7c476;
  font-weight: 700;
}
.seat-chips {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 5px;
}
.equips,
.judgs {
  display: block;
  overflow: hidden;
  color: #8fbc98;
  font-size: 9px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.equips.empty {
  color: #657079;
}
.judgs {
  color: #d1aa66;
}
.chip-key {
  display: inline-grid;
  width: 14px;
  height: 14px;
  margin-right: 4px;
  place-items: center;
  border: 1px solid currentColor;
  border-radius: 3px;
  font-size: 8px;
  opacity: 0.75;
}
.float-layer {
  position: absolute;
  inset: 4px 0 auto;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}
.float {
  color: #f0d79a;
  font-size: 13px;
  font-weight: 800;
  text-shadow: 0 2px 4px #000;
  white-space: nowrap;
  animation: floatUp 1.5s ease-out forwards;
}
.float-dmg { color: #ff7777; font-size: 16px; }
.float-heal { color: #7fd08a; }
.float-death { color: #a6a6a6; }
.float-judge { color: #c9a3ff; }
.float-wuxie { color: #8ac9e8; }
@keyframes floatUp {
  0% { opacity: 0; transform: translateY(6px); }
  20% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-18px); }
}
@media (max-width: 760px) {
  .seat-head { gap: 7px; }
  .avatar { width: 38px; height: 38px; border-radius: 7px; }
  .faction-mark { width: 16px; height: 16px; font-size: 8px; }
  .pname { font-size: 14px; }
  .seat-meta { gap: 4px; margin-top: 3px; }
  .pid-badge { font-size: 9px; }
  .handcount { font-size: 9px; }
  .vitals { margin-top: 6px; }
  .skill { margin-top: 4px; font-size: 9px; }
  .seat-chips { margin-top: 4px; }
  .equips, .judgs { font-size: 8px; }
}
</style>
