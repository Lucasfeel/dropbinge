import type { SVGProps } from "react";

export const IconHome = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
    <path
      d="M3 10.5L12 3l9 7.5"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M5.5 9.75V20a1 1 0 001 1h4.5v-5.5a1 1 0 011-1h2a1 1 0 011 1V21h4.5a1 1 0 001-1V9.75"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
