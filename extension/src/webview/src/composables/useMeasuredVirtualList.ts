import { ref, watch, nextTick, type Ref } from 'vue';
import { useVirtualList } from '@vueuse/core';

export interface UseMeasuredVirtualListOptions<T> {
  items: Ref<T[]>;
  getItemId: (item: T) => string;
  estimatedHeight?: number;
  overscan?: number;
}

export interface UseMeasuredVirtualListReturn<T> {
  list: Ref<{ data: T; index: number }[]>;
  containerProps: {
    ref: Ref<HTMLElement | null>;
    onScroll: () => void;
    style: Record<string, string>;
  };
  wrapperProps: any;
  scrollTo: (index: number) => void;
  setItemRef: (el: Element | null, item: T) => void;
  forceUpdate: () => void;
}

/**
 * 动态高度虚拟列表
 *
 * 在 @vueuse/core useVirtualList 基础上，通过 ResizeObserver 测量每个 item 的实际高度，
 * 用于消息高度差异大的聊天场景。
 */
export function useMeasuredVirtualList<T>(
  options: UseMeasuredVirtualListOptions<T>
): UseMeasuredVirtualListReturn<T> {
  const { items, getItemId, estimatedHeight = 80, overscan = 5 } = options;

  const heightCache = ref(new Map<string, number>());
  const itemElements = ref(new Map<string, HTMLElement>());

  const itemHeight = (index: number) => {
    const item = items.value[index];
    if (!item) {
      return estimatedHeight;
    }
    return heightCache.value.get(getItemId(item)) ?? estimatedHeight;
  };

  const { list, containerProps, wrapperProps, scrollTo } = useVirtualList(items, {
    itemHeight,
    overscan,
  });

  const forceUpdate = () => {
    nextTick(() => {
      containerProps.onScroll();
    });
  };

  const setItemRef = (el: Element | null, item: T) => {
    if (!el) {
      return;
    }
    const id = getItemId(item);
    itemElements.value.set(id, el as HTMLElement);
  };

  // 监听当前渲染的 item，测量高度变化
  watch(
    () => list.value.map((item) => getItemId(item.data)),
    async (ids) => {
      await nextTick();
      let changed = false;
      for (const id of ids) {
        const el = itemElements.value.get(id);
        if (el) {
          const height = el.getBoundingClientRect().height;
          const cached = heightCache.value.get(id);
          if (!cached || Math.abs(cached - height) > 1) {
            heightCache.value.set(id, height);
            changed = true;
          }
        }
      }
      if (changed) {
        forceUpdate();
      }
    },
    { immediate: true }
  );

  // ResizeObserver：item 尺寸变化时更新高度
  const observedElements = new Map<string, HTMLElement>();
  const resizeObserver = new ResizeObserver((entries) => {
    let changed = false;
    for (const entry of entries) {
      const el = entry.target as HTMLElement;
      const id = el.dataset.virtualId;
      if (!id) {
        continue;
      }
      const height = entry.contentRect.height;
      const cached = heightCache.value.get(id);
      if (!cached || Math.abs(cached - height) > 1) {
        heightCache.value.set(id, height);
        changed = true;
      }
    }
    if (changed) {
      forceUpdate();
    }
  });

  watch(
    () => list.value.map((item) => getItemId(item.data)),
    (ids) => {
      // 清理不再渲染的 element 观测
      for (const [id, el] of observedElements.entries()) {
        if (!ids.includes(id)) {
          resizeObserver.unobserve(el);
          observedElements.delete(id);
        }
      }
      // 观测新渲染的 element
      for (const id of ids) {
        const el = itemElements.value.get(id);
        if (el && !observedElements.has(id)) {
          el.dataset.virtualId = id;
          resizeObserver.observe(el);
          observedElements.set(id, el);
        }
      }
    },
    { flush: 'post' }
  );

  // 列表整体变化时清理已不存在项的缓存，保留仍存在的项高度
  watch(
    () => items.value.map((item) => getItemId(item)),
    (ids, prevIds) => {
      if (!prevIds) {
        return;
      }
      const idSet = new Set(ids);
      let changed = false;
      for (const id of heightCache.value.keys()) {
        if (!idSet.has(id)) {
          heightCache.value.delete(id);
          changed = true;
        }
      }
      // 如果大量项被替换（切换会话），完全清空缓存
      if (Math.abs(ids.length - prevIds.length) > 10 || !prevIds.some((id) => idSet.has(id))) {
        heightCache.value.clear();
        changed = true;
      }
      if (changed) {
        forceUpdate();
      }
    }
  );

  return {
    list,
    containerProps: containerProps as UseMeasuredVirtualListReturn<T>['containerProps'],
    wrapperProps,
    scrollTo,
    setItemRef,
    forceUpdate,
  };
}
