import { useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";

import usePlayerLinks from "@/hooks/usePlayerLinks";
import type { LinkableUser, PlayerLink } from "@/types";

const memberLabel = (u: LinkableUser) =>
  u.status === "pending" ? `${u.name} (pending)` : u.name;

interface RowProps {
  player: PlayerLink;
  users: LinkableUser[];
  onLink: (playerId: number, discordId: string) => void;
  onUnlink: (playerId: number) => void;
}

const PlayerRow = ({ player, users, onLink, onUnlink }: RowProps) => {
  const [chosen, setChosen] = useState<string | null>(null);
  const linked = player.discordId !== null;
  const data = users.map((u) => ({
    value: u.discordId,
    label: memberLabel(u),
  }));
  // A linked member may have no login row to list; still show who it is.
  if (linked && !data.some((d) => d.value === player.discordId))
    data.push({
      value: player.discordId!,
      label: player.userName ?? player.discordId!,
    });

  return (
    <Table.Tr>
      <Table.Td>
        {player.name}{" "}
        {linked ? (
          <Badge color="green" variant="light">
            Linked
          </Badge>
        ) : (
          <Badge color="yellow" variant="light">
            Needs link
          </Badge>
        )}
      </Table.Td>
      <Table.Td>{player.scoreCount}</Table.Td>
      <Table.Td>
        <Select
          aria-label={`Member for ${player.name}`}
          size="xs"
          w={240}
          searchable
          placeholder="Choose a member"
          data={data}
          value={linked ? player.discordId : chosen}
          onChange={setChosen}
          disabled={linked}
        />
      </Table.Td>
      <Table.Td>
        {linked ? (
          <Button
            size="xs"
            variant="default"
            aria-label={`Unlink ${player.name}`}
            onClick={() => onUnlink(player.id)}
          >
            Unlink
          </Button>
        ) : (
          <Button
            size="xs"
            aria-label={`Link ${player.name}`}
            disabled={chosen === null}
            onClick={() => onLink(player.id, chosen!)}
          >
            Link
          </Button>
        )}
      </Table.Td>
    </Table.Tr>
  );
};

const PlayerLinksPanel = () => {
  const { players, users, loading, error, actionError, link, unlink } =
    usePlayerLinks();

  if (loading) return <Text mt="md">Loading players...</Text>;
  if (error) {
    return (
      <Alert color="red" mt="md" title="Couldn't load players">
        Refresh the page to try again.
      </Alert>
    );
  }

  const linkedCount = players.filter((p) => p.discordId !== null).length;

  return (
    <Stack mt="xl">
      <Title order={2}>Player links</Title>
      <Text>
        {linkedCount} of {players.length} players linked
      </Text>
      {actionError && (
        <Alert color="red" role="alert">
          {actionError}
        </Alert>
      )}
      {players.length === 0 ? (
        <Text c="dimmed">No players yet. Import scores first.</Text>
      ) : (
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
              {players.map((p) => (
                <PlayerRow
                  key={p.id}
                  player={p}
                  users={users}
                  onLink={link}
                  onUnlink={unlink}
                />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
};

export default PlayerLinksPanel;
