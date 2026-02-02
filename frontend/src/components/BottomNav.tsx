import { NavLink } from "react-router-dom";

import { IconHome } from "../icons/nav/IconHome";
import { IconMovie } from "../icons/nav/IconMovie";
import { IconTV } from "../icons/nav/IconTV";
import { IconSeries } from "../icons/nav/IconSeries";
import { IconMy } from "../icons/nav/IconMy";

const navItems = [
  { to: "/", label: "Home", Icon: IconHome },
  { to: "/movie", label: "Movie", Icon: IconMovie },
  { to: "/tv", label: "TV", Icon: IconTV },
  { to: "/series", label: "Series", Icon: IconSeries },
  { to: "/me", label: "My Page", Icon: IconMy },
];

export const BottomNav = () => (
  <nav className="bottom-nav">
    {navItems.map(({ to, label, Icon }) => (
      <NavLink
        key={to}
        to={to}
        end={to === "/"}
        className={({ isActive }) => (isActive ? "active" : "")}
      >
        <Icon className="nav-icon" aria-hidden="true" />
        <span>{label}</span>
      </NavLink>
    ))}
  </nav>
);
