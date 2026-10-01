import { Markdown } from "../../../components/Markdown";
import { TechChips } from "../../../components/TechChips";
import type { Item } from "../../../hooks/usePublic";

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export function Hero({ profile }: { profile: Item }) {
  const title = str(profile.title);
  const company = str(profile.company);
  const team = str(profile.team);
  const subtitle = [title, company].filter(Boolean).join(" · ") + (team ? ` (${team})` : "");
  const avatar = str(profile.avatarUrl);
  return (
    <section className="hero">
      {avatar && <img className="avatar" src={avatar} alt="" width={96} height={96} loading="lazy" />}
      <h1>{String(profile.name)}</h1>
      {subtitle && <p className="subtitle">{subtitle}</p>}
      {profile.tagline != null && <p className="tagline">{String(profile.tagline)}</p>}
      {typeof profile.about === "string" && profile.about && <Markdown source={profile.about} />}
      <TechChips tech={profile.tech as Record<string, unknown> | undefined} />
    </section>
  );
}
