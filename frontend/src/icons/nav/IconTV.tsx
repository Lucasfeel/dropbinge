import type { SVGProps } from "react";

export const IconTV = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
    <rect x="3.5" y="6" width="17" height="11" rx="2.5" strokeWidth={1.8} />
    <path d="M8 20h8" strokeWidth={1.8} strokeLinecap="round" />
    <path d="M12 17v3" strokeWidth={1.8} strokeLinecap="round" />
    <path d="M9 4l3 2" strokeWidth={1.8} strokeLinecap="round" />
    <path d="M15 4l-3 2" strokeWidth={1.8} strokeLinecap="round" />
  </svg>
);
