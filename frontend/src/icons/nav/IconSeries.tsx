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
    <rect x="2.6" y="5.4" width="10.6" height="13.2" rx="2.2" strokeWidth={1.9} />
    <path d="M14.4 8.1h4.7c1.1 0 2 .9 2 2v3.8c0 1.1-.9 2-2 2h-4.7" strokeWidth={1.9} />
    <circle cx="19.5" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
);
