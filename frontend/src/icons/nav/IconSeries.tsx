import type { SVGProps } from "react";

export const IconSeries = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect x="2.5" y="5.5" width="10.5" height="13" rx="2" strokeWidth={1.8} />
    <path
      d="M14 7.4h4.2c1 0 1.8 0.8 1.8 1.8v5.6c0 1-0.8 1.8-1.8 1.8H14"
      strokeWidth={1.8}
    />
    <path
      d="M17.4 9.1h2.8c0.7 0 1.3 0.6 1.3 1.3v3.2c0 0.7-0.6 1.3-1.3 1.3h-2.8"
      strokeWidth={1.8}
    />
  </svg>
);
