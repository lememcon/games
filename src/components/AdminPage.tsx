import { useState } from "react";
import { Link } from "wouter";

import {
  Alert,
  Avatar,
  Button,
  Code,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";

import BggDataPanel from "@/components/admin/BggDataPanel";
import useAdminUsers from "@/hooks/useAdminUsers";
import { splitUsers, timeAgo } from "@/lib/users";
import type { AdminUser, Role } from "@/types";

const BUILT_IN = "Built-in admin, can't be changed";

type Confirm =
  { kind: "remove"; user: AdminUser } | { kind: "demote"; user: AdminUser };

const Account = ({ user }: { user: AdminUser }) => (
  <Group gap="xs" wrap="nowrap">
    <Avatar src={user.image} name={user.name} size="sm" />
    <div>
      <Text size="sm">
        {user.name}
        {user.locked && (
          <Text span size="xs" c="dimmed">
            {" "}
            (built-in)
          </Text>
        )}
      </Text>
      <Text size="xs" c="dimmed">
        {user.username
          ? `Discord username: ${user.username}`
          : "Discord username unknown"}
      </Text>
    </div>
  </Group>
);

const DiscordId = ({ id }: { id: string }) => <Code fw={700}>{id}</Code>;

const AdminPage = ({ meId }: { meId: string }) => {
  const { users, loading, error, actionError, approve, setRole, remove } =
    useAdminUsers(undefined, meId);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  if (loading) return <Text mt="md">Loading members...</Text>;
  if (error) {
    return (
      <Alert color="red" mt="md" title="Couldn't load members">
        Refresh the page to try again.
      </Alert>
    );
  }

  const { pending, members } = splitUsers(users);

  const handleRole = (user: AdminUser, role: string | null) => {
    // allowDeselect is off, so role is never null.
    if (role === user.role) return;
    if (role === "member" && user.discordId === meId) {
      setConfirm({ kind: "demote", user });
    } else {
      setRole(user.discordId, role as Role);
    }
  };

  const handleConfirm = () => {
    const { kind, user } = confirm!;
    setConfirm(null);
    if (kind === "remove") remove(user.discordId);
    else setRole(user.discordId, "member");
  };

  return (
    <Stack mt="md">
      <Group justify="space-between">
        <Title order={2}>Manage members</Title>
        <Button component={Link} href="/admin/import" variant="light">
          Import scores
        </Button>
      </Group>
      {actionError && (
        <Alert color="red" role="alert">
          {actionError}
        </Alert>
      )}

      <Title order={4}>Pending approval ({pending.length})</Title>
      <Table.ScrollContainer minWidth={560}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Account</Table.Th>
              <Table.Th>Discord ID</Table.Th>
              <Table.Th>Requested</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {pending.map((u) => (
              <Table.Tr key={u.discordId}>
                <Table.Td>
                  <Account user={u} />
                </Table.Td>
                <Table.Td>
                  <DiscordId id={u.discordId} />
                </Table.Td>
                <Table.Td>{timeAgo(u.createdAt)}</Table.Td>
                <Table.Td>
                  <Group gap="xs" wrap="nowrap">
                    <Button size="xs" onClick={() => approve(u.discordId)}>
                      Approve
                    </Button>
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() => setConfirm({ kind: "remove", user: u })}
                    >
                      Reject
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Title order={4}>Members ({members.length})</Title>
      <Table.ScrollContainer minWidth={560}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Account</Table.Th>
              <Table.Th>Discord ID</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {members.map((u) => (
              <Table.Tr key={u.discordId}>
                <Table.Td>
                  <Account user={u} />
                </Table.Td>
                <Table.Td>
                  <DiscordId id={u.discordId} />
                </Table.Td>
                <Table.Td>
                  <Tooltip label={BUILT_IN} disabled={!u.locked}>
                    <span>
                      <Select
                        aria-label={`Role for ${u.name}`}
                        size="xs"
                        w={110}
                        allowDeselect={false}
                        data={[
                          { value: "member", label: "Member" },
                          { value: "admin", label: "Admin" },
                        ]}
                        value={u.role}
                        disabled={u.locked}
                        onChange={(role) => handleRole(u, role)}
                      />
                    </span>
                  </Tooltip>
                </Table.Td>
                <Table.Td>
                  <Tooltip label={BUILT_IN} disabled={!u.locked}>
                    <span>
                      <Button
                        size="xs"
                        variant="default"
                        aria-label={`Remove ${u.name}`}
                        disabled={u.locked}
                        onClick={() => setConfirm({ kind: "remove", user: u })}
                      >
                        Remove
                      </Button>
                    </span>
                  </Tooltip>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Modal
        opened={confirm !== null}
        onClose={() => setConfirm(null)}
        title={
          confirm?.kind === "demote"
            ? "Remove your admin role?"
            : confirm?.user.status === "pending"
              ? "Reject this account?"
              : "Remove this member?"
        }
      >
        <Text size="sm">
          {confirm?.kind === "demote"
            ? "You will lose access to this page."
            : `${confirm?.user.name} will lose access. They can sign in again and request approval.`}
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
          <Button color="red" onClick={handleConfirm}>
            Confirm
          </Button>
        </Group>
      </Modal>

      <BggDataPanel />
    </Stack>
  );
};

export default AdminPage;
