import { useNavigate } from "react-router-dom";
import type { CSSProperties } from "react";

import { IconMy } from "../icons/nav/IconMy";
import { useAuth } from "../hooks/useAuth";
import { BrandLogo } from "./BrandLogo";

const hashEmail = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const buildProfileAvatar = (email: string) => {
  const normalized = email.trim().toLowerCase();
  const initial = normalized ? normalized[0].toUpperCase() : "?";
  const hue = hashEmail(normalized) % 360;
  return {
    initial,
    style: {
      backgroundColor: `hsl(${hue} 62% 82%)`,
      color: `hsl(${hue} 35% 18%)`,
    } as CSSProperties,
  };
};

export const TopHeader = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const avatar = user?.email ? buildProfileAvatar(user.email) : null;

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
            {avatar ? (
              <span className="profile-avatar" style={avatar.style} aria-hidden="true">
                {avatar.initial}
              </span>
            ) : (
              <IconMy aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
