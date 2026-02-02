import type { SVGProps } from "react";

export const IconHome = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
    <path
      d="M4 10.5L12 4l8 6.5V20a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 20v-9.5Z"
      strokeWidth={1.8}
      strokeLinejoin="round"
    />
    <path
      d="M9.5 21.5v-6.2A1.3 1.3 0 0 1 10.8 14h2.4a1.3 1.3 0 0 1 1.3 1.3v6.2"
      strokeWidth={1.8}
      strokeLinecap="round"
    />
  </svg>
);
