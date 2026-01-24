import { useContext } from "react";

import { FollowsContext } from "../context/FollowsContext";

export const useFollows = () => {
  const context = useContext(FollowsContext);
  if (!context) {
    throw new Error("useFollows must be used within FollowsProvider");
  }
  return context;
};
