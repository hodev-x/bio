import { NavLink, Outlet, useNavigate } from "react-router";
import { useAuth } from "../../hooks/useAuth";

const sections = ["profile", "experience", "education", "skills", "projects", "posts"] as const;

export function AdminLayout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="admin-shell">
      <nav className="admin-nav">
        <NavLink to="/admin" end>Dashboard</NavLink>
        {sections.map((s) => <NavLink key={s} to={`/admin/${s}`}>{s}</NavLink>)}
        <button className="btn btn-secondary" onClick={() => void signOut().then(() => navigate("/admin/login"))}>Log out</button>
      </nav>
      <main><Outlet /></main>
    </div>
  );
}
