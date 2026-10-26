// 模态框无障碍：Esc 关闭、Tab 焦点锁定、打开聚焦、关闭归还焦点、背景滚动锁。
import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';

interface ModalA11yOptions {
  open: Ref<boolean>;
  modal: Ref<HTMLElement | null>;
  initialFocus: Ref<HTMLElement | null>;
  onClose: () => void;
}

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useModalA11y(options: ModalA11yOptions) {
  let returnFocus: HTMLElement | null = null;
  let previousOverflow = '';
  let active = false;

  function focusable(): HTMLElement[] {
    const root = options.modal.value;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => !el.hidden && el.getClientRects().length > 0);
  }

  function onKeydown(event: KeyboardEvent) {
    if (!active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      options.onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusable();
    if (items.length === 0) {
      event.preventDefault();
      options.modal.value?.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const current = document.activeElement as HTMLElement | null;
    if (event.shiftKey && (current === first || !options.modal.value?.contains(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || !options.modal.value?.contains(current))) {
      event.preventDefault();
      first.focus();
    }
  }

  async function activate() {
    if (active) return;
    active = true;
    returnFocus = document.activeElement as HTMLElement | null;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeydown);
    await nextTick();
    (options.initialFocus.value ?? options.modal.value)?.focus();
  }

  function deactivate() {
    if (!active) return;
    active = false;
    document.removeEventListener('keydown', onKeydown);
    document.body.style.overflow = previousOverflow;
    returnFocus?.focus?.();
    returnFocus = null;
  }

  watch(options.open, open => {
    if (open) void activate();
    else deactivate();
  }, { immediate: true });

  onBeforeUnmount(deactivate);
  return { deactivate };
}
