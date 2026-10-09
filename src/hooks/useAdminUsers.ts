import { useCallback, useEffect, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import type { AdminUser, Role } from "@/types";

const describe = (e: unknown): string =>
  e instanceof ApiError && (e.status === 401 || e.status === 403)
    ? "You no longer have admin access."
    : e instanceof ApiError && e.status === 409
      ? "Built-in admins can't be changed."
      : e instanceof ApiError && e.status === 400
        ? `The change was rejected: ${e.message}`
        : "Something went wrong. Try again.";

// Admin user list plus mutations. Mutations are not optimistic: the list only
// changes with what the server returns, and a failure leaves it untouched.
// `meId` is the signed-in user's Discord id: after a successful role change or
// removal of that user, the page reloads so the rest of the UI drops stale
// admin access.
const useAdminUsers = (fetchImpl: typeof fetch = fetch, meId?: string) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<AdminUser[]>("/admin/users", {}, fetchImpl)
      .then((list) => !cancelled && setUsers(list))
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchImpl]);

  const reloadIfSelf = useCallback(
    (discordId: string) => {
      if (discordId === meId) window.location.assign("/");
    },
    [meId],
  );

  const mutate = useCallback(
    async (discordId: string, body: { status?: "approved"; role?: Role }) => {
      setActionError(null);
      try {
        const updated = await apiFetch<AdminUser>(
          `/admin/users/${discordId}`,
          { method: "PATCH", body },
          fetchImpl,
        );
        setUsers((list) =>
          list.map((u) => (u.discordId === discordId ? updated : u)),
        );
        if (body.role) reloadIfSelf(discordId);
      } catch (e) {
        setActionError(describe(e));
      }
    },
    [fetchImpl, reloadIfSelf],
  );

  const approve = (discordId: string) =>
    mutate(discordId, { status: "approved" });
  const setRole = (discordId: string, role: Role) =>
    mutate(discordId, { role });

  const remove = async (discordId: string) => {
    setActionError(null);
    try {
      await apiFetch<void>(
        `/admin/users/${discordId}`,
        { method: "DELETE" },
        fetchImpl,
      );
      setUsers((list) => list.filter((u) => u.discordId !== discordId));
      reloadIfSelf(discordId);
    } catch (e) {
      setActionError(describe(e));
    }
  };

  return { users, loading, error, actionError, approve, setRole, remove };
};

export default useAdminUsers;
