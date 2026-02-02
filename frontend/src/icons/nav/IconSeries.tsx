import type { SVGProps } from "react";

export const IconSeries = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
    <rect x="4" y="4" width="7" height="7" rx="2" strokeWidth={1.8} />
    <rect x="13" y="4" width="7" height="7" rx="2" strokeWidth={1.8} />
    <rect x="4" y="13" width="7" height="7" rx="2" strokeWidth={1.8} />
    <rect x="13" y="13" width="7" height="7" rx="2" strokeWidth={1.8} />
  </svg>
);
