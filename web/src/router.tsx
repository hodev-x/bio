import { Routes, Route } from "react-router";
import { Home } from "./pages/Home";
import { AdminLayout } from "./pages/admin/AdminLayout";

const Todo = ({ name }: { name: string }) => <p>{name} — coming in a later task</p>;

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/admin/login" element={<Todo name="Login" />} />
      <Route path="/admin/register" element={<Todo name="Register" />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Todo name="Dashboard" />} />
        <Route path="profile" element={<Todo name="Profile" />} />
        <Route path="experience" element={<Todo name="Experience" />} />
        <Route path="education" element={<Todo name="Education" />} />
        <Route path="skills" element={<Todo name="Skills" />} />
        <Route path="projects" element={<Todo name="Projects" />} />
        <Route path="posts" element={<Todo name="Posts" />} />
        <Route path="posts/new" element={<Todo name="New post" />} />
        <Route path="posts/:slug" element={<Todo name="Edit post" />} />
      </Route>
    </Routes>
  );
}
