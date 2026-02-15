import { useEffect, useRef } from "react";

type InfiniteScrollOptions = {
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
};

export const useInfiniteScroll = ({ onLoadMore, hasMore, loading }: InfiniteScrollOptions) => {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const triggerLockRef = useRef(false);
  const wasIntersectingRef = useRef(false);
  const lastTriggeredAtRef = useRef(0);
  const LOAD_MORE_COOLDOWN_MS = 400;

  useEffect(() => {
    if (!loading) {
      triggerLockRef.current = false;
    }
  }, [loading, hasMore]);

  useEffect(() => {
    if (hasMore) return;
    wasIntersectingRef.current = false;
    triggerLockRef.current = false;
  }, [hasMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry) return;
        if (!entry.isIntersecting) {
          wasIntersectingRef.current = false;
          return;
        }
        const isRisingEdge = !wasIntersectingRef.current;
        wasIntersectingRef.current = true;
        if (!isRisingEdge) return;
        if (loading || !hasMore || triggerLockRef.current) return;
        const now = Date.now();
        if (now - lastTriggeredAtRef.current < LOAD_MORE_COOLDOWN_MS) return;
        lastTriggeredAtRef.current = now;
        triggerLockRef.current = true;
        onLoadMore();
      },
      { rootMargin: "600px" },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, loading, onLoadMore]);

  return sentinelRef;
};
