import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import type { Role } from "../../types";
import { hasModuleAccess } from "../../config/modules";

export function ProtectedRoute({
  allowedRoles,
  moduleId,
}: {
  allowedRoles?: Role[];
  moduleId?: string;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-gray-500">Carregando...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === "ADMIN") return <Outlet />;

  // Check via moduleId (custom permissions-aware)
  if (moduleId) {
    if (!hasModuleAccess(user.role, user.permissions, moduleId)) {
      return <Navigate to="/" replace />;
    }
    return <Outlet />;
  }

  // Fallback: role-based check
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
