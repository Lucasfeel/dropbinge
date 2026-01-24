import { NavLink } from "react-router-dom";

export const BottomNav = () => (
  <nav className="bottom-nav">
    <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}
    >
      Home
    </NavLink>
    <NavLink to="/movie" className={({ isActive }) => (isActive ? "active" : "")}
    >
      Movie
    </NavLink>
    <NavLink to="/tv" className={({ isActive }) => (isActive ? "active" : "")}
    >
      TV
    </NavLink>
    <NavLink
      to="/series"
      className={({ isActive }) => (isActive ? "active" : "")}
    >
      Series
    </NavLink>
    <NavLink to="/my" className={({ isActive }) => (isActive ? "active" : "")}
    >
      My
    </NavLink>
  </nav>
);
