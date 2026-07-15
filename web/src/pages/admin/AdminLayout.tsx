import { NavLink, Outlet } from "react-router";

const sections = ["profile", "experience", "education", "skills", "projects", "posts"] as const;

export function AdminLayout() {
  return (
    <div className="admin-shell">
      <nav className="admin-nav">
        <NavLink to="/admin" end>Dashboard</NavLink>
        {sections.map((s) => <NavLink key={s} to={`/admin/${s}`}>{s}</NavLink>)}
      </nav>
      <main><Outlet /></main>
    </div>
  );
}
