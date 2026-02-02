import type { ReactNode } from "react";

type ChipFilterRowProps = {
  children: ReactNode;
};

export const ChipFilterRow = ({ children }: ChipFilterRowProps) => (
  <div className="chip-filter-row">{children}</div>
);
