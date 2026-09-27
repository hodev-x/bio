import { usePublicContent } from "../../hooks/usePublic";
import { Meta } from "../../components/Meta";
import { Hero } from "./sections/Hero";
import { Experience } from "./sections/Experience";
import { Projects } from "./sections/Projects";
import { Skills } from "./sections/Skills";
import { Education } from "./sections/Education";
import { LatestPosts } from "./sections/LatestPosts";

export function Home() {
  const q = usePublicContent();
  if (q.isPending) return <div aria-busy="true"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>;
  if (q.isError) return <div className="error"><p>Couldn't load the page.</p><button type="button" onClick={() => void q.refetch()}>Retry</button></div>;
  const c = q.data;
  return (
    <>
      <Meta title="Daniel Hodeta" description={String(c.profile?.tagline ?? "")} />
      {c.profile && <Hero profile={c.profile} />}
      <Experience items={c.experience} />
      <Projects items={c.projects} />
      <Skills items={c.skills} />
      <Education items={c.education} />
      <LatestPosts />
    </>
  );
}
