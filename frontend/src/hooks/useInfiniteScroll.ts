import { useEffect, useRef } from "react";

type InfiniteScrollOptions = {
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
};

export const useInfiniteScroll = ({ onLoadMore, hasMore, loading }: InfiniteScrollOptions) => {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const triggerLockRef = useRef(false);

  useEffect(() => {
    if (!loading) {
      triggerLockRef.current = false;
    }
  }, [loading, hasMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        if (loading || !hasMore || triggerLockRef.current) return;
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
