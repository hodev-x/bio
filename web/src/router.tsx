import { Routes, Route } from "react-router";
import { PublicLayout } from "./components/PublicLayout";
import { usePublicContent } from "./hooks/usePublic";
import { Home } from "./pages/public/Home";
import { BlogList } from "./pages/public/BlogList";
import { PostPage } from "./pages/public/PostPage";
import { NotFound } from "./pages/public/NotFound";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { LoginPage } from "./pages/admin/LoginPage";
import { RegisterPage } from "./pages/admin/RegisterPage";
import { Dashboard } from "./pages/admin/Dashboard";
import { ProfilePage } from "./pages/admin/ProfilePage";
import { EntityListPage } from "./pages/admin/EntityListPage";
import { experienceConfig, educationConfig, skillsConfig, projectsConfig } from "./pages/admin/entityConfigs";
import { PostsPage } from "./pages/admin/PostsPage";
import { PostEditorPage } from "./pages/admin/PostEditorPage";
import { RequireAuth } from "./components/RequireAuth";

function PublicShell() {
  const { data } = usePublicContent();
  return <PublicLayout socials={(data?.profile?.socials as Record<string, string> | undefined) ?? undefined} />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/blog" element={<BlogList />} />
        <Route path="/blog/:slug" element={<PostPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="/admin/login" element={<LoginPage />} />
      <Route path="/admin/register" element={<RegisterPage />} />
      <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="experience" element={<EntityListPage config={experienceConfig} />} />
        <Route path="education" element={<EntityListPage config={educationConfig} />} />
        <Route path="skills" element={<EntityListPage config={skillsConfig} />} />
        <Route path="projects" element={<EntityListPage config={projectsConfig} />} />
        <Route path="posts" element={<PostsPage />} />
        <Route path="posts/new" element={<PostEditorPage mode="create" />} />
        <Route path="posts/:slug" element={<PostEditorPage mode="edit" />} />
      </Route>
    </Routes>
  );
}
