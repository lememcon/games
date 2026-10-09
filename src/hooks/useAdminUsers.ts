import { useCallback, useEffect, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import type { AdminUser, Role } from "@/types";

const describe = (e: unknown): string =>
  e instanceof ApiError && e.status === 409
    ? "Built-in admins can't be changed."
    : e instanceof ApiError && e.status === 400
      ? `The change was rejected: ${e.message}`
      : "Something went wrong. Try again.";

// Admin user list plus mutations. Mutations are not optimistic: the list only
// changes with what the server returns, and a failure leaves it untouched.
const useAdminUsers = (fetchImpl: typeof fetch = fetch) => {
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
      } catch (e) {
        setActionError(describe(e));
      }
    },
    [fetchImpl],
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
    } catch (e) {
      setActionError(describe(e));
    }
  };

  return { users, loading, error, actionError, approve, setRole, remove };
};

export default useAdminUsers;
