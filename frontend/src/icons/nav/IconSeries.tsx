import type { SVGProps } from "react";

export const IconSeries = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
    <path
      d="M6.5 6.5h11A2 2 0 0 1 19.5 8.5v2A2 2 0 0 1 17.5 12.5h-11A2 2 0 0 1 4.5 10.5v-2A2 2 0 0 1 6.5 6.5Z"
      strokeWidth={1.8}
      strokeLinejoin="round"
    />
    <path
      d="M6.5 12.5h11A2 2 0 0 1 19.5 14.5v2A2 2 0 0 1 17.5 18.5h-11A2 2 0 0 1 4.5 16.5v-2A2 2 0 0 1 6.5 12.5Z"
      strokeWidth={1.8}
      strokeLinejoin="round"
    />
    <path d="M7.6 9.5h.01M7.6 15.5h.01" strokeWidth={2.4} strokeLinecap="round" />
  </svg>
);
