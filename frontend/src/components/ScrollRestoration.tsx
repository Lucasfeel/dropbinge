import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

export const ScrollRestoration = () => {
  const location = useLocation();
  const key = `${location.pathname}${location.search}`;

  useLayoutEffect(() => {
    const stored = sessionStorage.getItem(`scroll:${key}`);
    if (stored) {
      const y = Number(stored);
      if (!Number.isNaN(y)) {
        window.scrollTo(0, y);
      }
    }

    return () => {
      sessionStorage.setItem(`scroll:${key}`, String(window.scrollY));
    };
  }, [key]);

  return null;
};
