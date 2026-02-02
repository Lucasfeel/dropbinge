import type { SVGProps } from "react";

export const IconMy = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
    <circle cx="12" cy="8" r="3.5" strokeWidth={1.8} />
    <path
      d="M4.5 20a7.5 7.5 0 0115 0"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
