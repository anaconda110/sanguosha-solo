<script setup lang="ts">
// 新手引导覆盖层（M17，M22 自 App.vue 迁出）：纯展示，关闭交还父级处理
// （首次显隐状态在 useSettings，含 localStorage 记忆）。
defineEmits<{ dismiss: [] }>();
</script>

<template>
  <div class="intro-overlay" @click.self="$emit('dismiss')">
    <div class="intro-card">
      <h2>第一次玩？先看这五条</h2>
      <ol>
        <li><b>身份即胜利条件</b>——主公/忠臣：杀光反贼和内奸；反贼：杀死主公；内奸：最后与主公单挑并赢下。你的身份在顶部徽章，主公的身份开局公开。</li>
        <li><b>出牌 = 点牌再点目标</b>——点一张手牌选中它，再点目标座次。【杀】要射程内、顺手牵羊要距离 1；无中/南蛮/万箭/桃园/五谷不需要目标。</li>
        <li><b>回合四阶段</b>——判定 → 摸牌 → 出牌 → 弃牌。弃牌阶段手牌数不能超过当前体力。</li>
        <li><b>应答看底部提示条</b>——被【杀】指到要出闪、濒死要求桃、锦囊可被无懈；按钮都在底部提示条里，不出就点"不出"。</li>
        <li><b>技能在座次卡上</b>——技能名下方就是描述；能主动发动的技能会在底部提示条出现按钮。武将图鉴（顶部）可查全部 25 将。</li>
      </ol>
      <p class="intro-tip">输了想复盘：结束后下方有回放条，可拖到任意时刻。顶部输入 seed 可复现同一局。</p>
      <button class="btn intro-btn" @click="$emit('dismiss')">知道了，开始</button>
    </div>
  </div>
</template>

<style>
/* 新手引导覆盖层（M17） */
.intro-overlay {
  position: fixed;
  inset: 0;
  background: rgba(8, 10, 14, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}
.intro-card {
  max-width: 560px;
  max-height: 86vh;
  overflow-y: auto;
  background: #14171e;
  border: 1px solid #2a3140;
  border-radius: 12px;
  padding: 20px 24px;
  color: #cfd5df;
}
.intro-card h2 {
  margin: 0 0 10px;
  font-size: 16px;
  color: #e8c268;
}
.intro-card ol {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 8px;
  font-size: 13px;
  line-height: 1.65;
}
.intro-tip {
  margin: 12px 0 0;
  font-size: 12px;
  color: #8b93a3;
}
.intro-btn {
  margin-top: 14px;
  width: 100%;
}
</style>
