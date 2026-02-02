import type { SVGProps } from "react";

export const IconMovie = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
    <rect
      x="3.5"
      y="5"
      width="17"
      height="14"
      rx="2.5"
      strokeWidth={1.8}
    />
    <path d="M7 5v14" strokeWidth={1.8} strokeLinecap="round" />
    <path d="M17 5v14" strokeWidth={1.8} strokeLinecap="round" />
    <path d="M3.5 9h17" strokeWidth={1.8} strokeLinecap="round" />
  </svg>
);
