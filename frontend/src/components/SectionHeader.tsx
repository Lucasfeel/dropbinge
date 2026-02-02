import type { ReactNode } from "react";

type SectionHeaderProps = {
  title: string;
  action?: ReactNode;
  subtitle?: string;
};

export const SectionHeader = ({ title, action, subtitle }: SectionHeaderProps) => (
  <div className="section-header">
    <div>
      <h2>{title}</h2>
      {subtitle && <p className="muted">{subtitle}</p>}
    </div>
    {action && <div className="section-action">{action}</div>}
  </div>
);
