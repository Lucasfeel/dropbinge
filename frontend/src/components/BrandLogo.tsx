import { Link } from "react-router-dom";

import logo from "../assets/brand-logo.svg";

type BrandLogoProps = {
  className?: string;
};

export const BrandLogo = ({ className }: BrandLogoProps) => (
  <Link to="/" className={className} aria-label="DropBinge home">
    <img src={logo} alt="DropBinge" />
  </Link>
);
