import { Link, Outlet } from "react-router";
import { useMode } from "../mode/ModeContext";

export function PublicLayout({ socials }: { socials?: Record<string, string> }) {
  const { dev, toggle } = useMode();
  return (
    <div className="public">
      <header className="site-header">
        <Link to="/" className="site-name">Daniel Hodeta</Link>
        <nav>
          <Link to="/blog">Writing</Link>
          <button type="button" className="mode-toggle" aria-pressed={dev} onClick={toggle}>dev mode</button>
        </nav>
      </header>
      <main><Outlet /></main>
      <footer className="site-footer">
        {socials && Object.entries(socials).map(([name, href]) => (
          <a key={name} href={href} rel="me noopener" target="_blank">{name}</a>
        ))}
      </footer>
    </div>
  );
}
