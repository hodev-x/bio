import { Markdown } from "../../../components/Markdown";
import type { Item } from "../../../hooks/usePublic";

export function Hero({ profile }: { profile: Item }) {
  return (
    <section className="hero">
      <h1>{String(profile.name)}</h1>
      {profile.tagline != null && <p className="tagline">{String(profile.tagline)}</p>}
      {typeof profile.about === "string" && profile.about && <Markdown source={profile.about} />}
    </section>
  );
}
