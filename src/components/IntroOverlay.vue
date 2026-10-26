<script setup lang="ts">
// 新手引导覆盖层（M17，M22 自 App.vue 迁出）：纯展示，关闭交还父级处理
// （首次显隐状态在 useSettings，含 localStorage 记忆）。
import { ref } from 'vue';
import { useModalA11y } from '../composables/useModalA11y';

const emit = defineEmits<{ dismiss: [] }>();
const open = ref(true);
const modalRef = ref<HTMLElement | null>(null);
const startRef = ref<HTMLElement | null>(null);

function dismiss() {
  if (!open.value) return;
  open.value = false;
  emit('dismiss');
}

useModalA11y({
  open,
  modal: modalRef,
  initialFocus: startRef,
  onClose: dismiss,
});
</script>

<template>
  <div class="intro-overlay" @click.self="dismiss">
    <div ref="modalRef" class="intro-card" role="dialog" aria-modal="true" aria-labelledby="intro-title" tabindex="-1">
      <header class="intro-head">
        <span class="intro-seal" aria-hidden="true">杀</span>
        <div>
          <span class="intro-kicker">QUICK START · 五人身份局</span>
          <h2 id="intro-title">第一次玩？先看这五条</h2>
        </div>
      </header>
      <ol>
        <li><b>身份即胜利条件</b>——主公/忠臣：杀光反贼和内奸；反贼：杀死主公；内奸：最后与主公单挑并赢下。你的身份在顶部徽章，主公的身份开局公开。</li>
        <li><b>出牌 = 点牌再点目标</b>——点一张手牌选中它，再点目标座次。【杀】要射程内、顺手牵羊要距离 1；无中/南蛮/万箭/桃园/五谷不需要目标。</li>
        <li><b>回合四阶段</b>——判定 → 摸牌 → 出牌 → 弃牌。弃牌阶段手牌数不能超过当前体力。</li>
        <li><b>应答看底部提示条</b>——被【杀】指到要出闪、濒死要求桃、锦囊可被无懈；按钮都在底部提示条里，不出就点"不出"。</li>
        <li><b>技能在座次卡上</b>——技能名下方就是描述；能主动发动的技能会在底部提示条出现按钮。武将图鉴（顶部）可查全部 25 将。</li>
      </ol>
      <p class="intro-tip">输了想复盘：结束后下方有回放条，可拖到任意时刻。顶部输入 seed 可复现同一局。</p>
      <button ref="startRef" class="btn intro-btn" @click="dismiss">知道了，开始</button>
    </div>
  </div>
</template>

<style>
/* 新手引导覆盖层（M17） */
.intro-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
  background:
    radial-gradient(circle at 50% 28%, rgb(217 181 111 / 10%), transparent 34%),
    rgb(5 9 11 / 82%);
  backdrop-filter: blur(6px);
}
.intro-card {
  width: min(600px, 100%);
  max-width: 560px;
  max-height: 86vh;
  overflow-y: auto;
  padding: 22px 24px;
  border: 1px solid rgb(217 181 111 / 34%);
  border-radius: 16px;
  background:
    radial-gradient(circle at 8% 0%, rgb(217 181 111 / 11%), transparent 32%),
    linear-gradient(145deg, #19211f, #12191d 60%, #151b20);
  box-shadow: 0 28px 90px rgb(0 0 0 / 64%), inset 0 1px rgb(255 255 255 / 4%);
  color: #cbd3d0;
  scrollbar-color: #3a474f transparent;
  scrollbar-width: thin;
}
.intro-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 15px;
  padding-bottom: 13px;
  border-bottom: 1px solid rgb(255 255 255 / 8%);
}
.intro-seal {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid #a9433f;
  border-radius: 9px;
  background: linear-gradient(145deg, rgb(255 255 255 / 12%), transparent 44%), #7e2d2b;
  box-shadow: inset 0 0 0 2px rgb(0 0 0 / 16%), 0 5px 12px rgb(0 0 0 / 32%);
  color: #f1d8b2;
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: 23px;
  font-weight: 900;
}
.intro-kicker {
  display: block;
  margin-bottom: 3px;
  color: #8f7951;
  font: 700 9px/1.2 Georgia, serif;
  letter-spacing: 0.18em;
}
.intro-card h2 {
  margin: 0;
  color: var(--gold-bright);
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: 20px;
  letter-spacing: 0.04em;
}
.intro-card ol {
  margin: 0;
  padding: 0;
  display: grid;
  gap: 9px;
  list-style: none;
  counter-reset: rule;
  font-size: 13px;
  line-height: 1.65;
}
.intro-card li {
  position: relative;
  padding-left: 31px;
  counter-increment: rule;
}
.intro-card li::before {
  content: counter(rule);
  position: absolute;
  top: 2px;
  left: 0;
  display: grid;
  width: 21px;
  height: 21px;
  place-items: center;
  border: 1px solid rgb(217 181 111 / 32%);
  border-radius: 50%;
  background: rgb(217 181 111 / 7%);
  color: var(--gold);
  font: 700 10px/1 Georgia, serif;
}
.intro-card li b {
  color: #e2d2ad;
}
.intro-tip {
  margin: 15px 0 0;
  padding: 9px 11px;
  border-left: 2px solid var(--gold-dim);
  background: rgb(217 181 111 / 5%);
  color: #8f9b9e;
  font-size: 12px;
}
.intro-btn {
  margin-top: 16px;
  width: 100%;
  min-height: 38px;
}
@media (max-width: 520px) {
  .intro-overlay {
    align-items: flex-start;
    padding: 8px;
  }
  .intro-card {
    max-height: calc(100vh - 16px);
    padding: 17px;
    border-radius: 13px;
  }
  .intro-head {
    align-items: flex-start;
  }
  .intro-card h2 {
    font-size: 17px;
  }
  .intro-card ol {
    font-size: 12px;
  }
}
</style>
