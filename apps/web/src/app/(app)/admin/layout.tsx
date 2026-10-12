import { AdminGuard } from "@/components/admin/admin-guard";

/** Everything under /admin needs an administrator. The API enforces it again on every request. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
