import { useNavigate } from "react-router-dom";

import { IconMy } from "../icons/nav/IconMy";
import { BrandLogo } from "./BrandLogo";

export const TopHeader = () => {
  const navigate = useNavigate();

  return (
    <header className="top-header">
      <div className="top-header-inner container">
        <BrandLogo className="brand-logo" />
        <div className="top-header-actions">
          <button
            type="button"
            className="top-action-button search-icon-button"
            onClick={() => navigate("/search")}
            aria-label="Search"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.2-3.2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="top-action-button profile-shortcut-button"
            onClick={() => navigate("/me")}
            aria-label="My page shortcut"
          >
            <IconMy aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
};
