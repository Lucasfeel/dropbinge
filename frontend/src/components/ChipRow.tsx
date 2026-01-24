import { ReactNode } from "react";

type ChipRowProps = {
  children: ReactNode;
};

export const ChipRow = ({ children }: ChipRowProps) => (
  <div className="chip-row">{children}</div>
);
