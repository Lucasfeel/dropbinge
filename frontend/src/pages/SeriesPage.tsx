import { FollowCard } from "../components/FollowCard";
import { useFollows } from "../hooks/useFollows";

export const SeriesPage = () => {
  const { follows } = useFollows();
  const series = follows.filter((follow) => follow.target_type === "tv_full");
  return (
    <div className="page">
      {series.map((follow) => (
        <FollowCard
          key={follow.id}
          follow={follow}
          subtitle={`Status: ${follow.status_raw || "Status TBD"} · Next: ${follow.next_air_date || "Next TBD"}`}
        />
      ))}
    </div>
  );
};
