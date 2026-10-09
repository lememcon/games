import type { AdminUser } from "@/types";

export function splitUsers(users: AdminUser[]): {
  pending: AdminUser[];
  members: AdminUser[];
} {
  return {
    pending: users.filter((u) => u.status === "pending"),
    members: users.filter((u) => u.status === "approved"),
  };
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
