import { useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Group,
  Pill,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";

import usePlayerLinks from "@/hooks/usePlayerLinks";
import type { MemberGroup } from "@/lib/playerLinks";
import type { LinkableUser, PlayerLink } from "@/types";

const memberLabel = (u: LinkableUser) =>
  u.status === "pending" ? `${u.name} (pending)` : u.name;

interface MemberProps {
  member: MemberGroup;
  unlinked: PlayerLink[];
  onLink: (playerId: number, discordId: string) => void;
  onUnlink: (playerId: number) => void;
}

const MemberCard = ({ member, unlinked, onLink, onUnlink }: MemberProps) => (
  <Stack gap="xs">
    <Group gap="xs">
      <Text fw={600}>{member.label}</Text>
      <Badge variant="light">
        {member.players.length} {member.players.length === 1 ? "name" : "names"}
      </Badge>
    </Group>
    <Group gap="xs">
      {member.players.map((p) => (
        <Pill
          key={p.id}
          size="md"
          withRemoveButton
          onRemove={() => onUnlink(p.id)}
          removeButtonProps={{
            "aria-hidden": false,
            "aria-label": `Unlink ${p.name}`,
          }}
        >
          {p.name}
        </Pill>
      ))}
      <Select
        aria-label={`Add a name for ${member.label}`}
        size="xs"
        w={200}
        searchable
        placeholder="Add a name"
        data={unlinked.map((p) => ({ value: String(p.id), label: p.name }))}
        value={null}
        onChange={(id) => id !== null && onLink(Number(id), member.discordId)}
      />
    </Group>
  </Stack>
);

interface RowProps {
  player: PlayerLink;
  users: LinkableUser[];
  onLink: (playerId: number, discordId: string) => void;
}

const UnlinkedRow = ({ player, users, onLink }: RowProps) => {
  const [chosen, setChosen] = useState<string | null>(null);
  const data = users.map((u) => ({
    value: u.discordId,
    label: memberLabel(u),
  }));

  return (
    <Table.Tr>
      <Table.Td>{player.name}</Table.Td>
      <Table.Td>{player.scoreCount}</Table.Td>
      <Table.Td>
        <Select
          aria-label={`Member for ${player.name}`}
          size="xs"
          w={240}
          searchable
          placeholder="Choose a member"
          data={data}
          value={chosen}
          onChange={setChosen}
        />
      </Table.Td>
      <Table.Td>
        <Button
          size="xs"
          aria-label={`Link ${player.name}`}
          disabled={!users.some((u) => u.discordId === chosen)}
          onClick={() => {
            const id = chosen!;
            setChosen(null);
            onLink(player.id, id);
          }}
        >
          Link
        </Button>
      </Table.Td>
    </Table.Tr>
  );
};

const PlayerLinksPanel = () => {
  const {
    players,
    users,
    members,
    unlinked,
    loading,
    error,
    actionError,
    link,
    unlink,
  } = usePlayerLinks();

  if (loading) return <Text mt="md">Loading players...</Text>;
  if (error) {
    return (
      <Alert color="red" mt="md" title="Couldn't load players">
        Refresh the page to try again.
      </Alert>
    );
  }

  const linkedCount = players.length - unlinked.length;

  return (
    <Stack mt="xl">
      <Title order={2}>Player links</Title>
      <Text>
        {linkedCount} of {players.length} players linked to {members.length}{" "}
        {members.length === 1 ? "member" : "members"}
      </Text>
      {actionError && (
        <Alert color="red" role="alert">
          {actionError}
        </Alert>
      )}
      {players.length === 0 ? (
        <Text c="dimmed">No players yet. Import scores first.</Text>
      ) : (
        <>
          {members.length > 0 && (
            <Stack>
              <Title order={3}>Members</Title>
              {members.map((m) => (
                <MemberCard
                  key={m.discordId}
                  member={m}
                  unlinked={unlinked}
                  onLink={link}
                  onUnlink={unlink}
                />
              ))}
            </Stack>
          )}
          {unlinked.length > 0 && (
            <Stack>
              <Title order={3}>Unlinked players ({unlinked.length})</Title>
              <Table.ScrollContainer minWidth={560}>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Player</Table.Th>
                      <Table.Th>Scores</Table.Th>
                      <Table.Th>Member</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {unlinked.map((p) => (
                      <UnlinkedRow
                        key={p.id}
                        player={p}
                        users={users}
                        onLink={link}
                      />
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
};

export default PlayerLinksPanel;
