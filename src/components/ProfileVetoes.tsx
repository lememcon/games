import { useState } from "react";

import {
  Alert,
  Button,
  Group,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import type { GamesState } from "@/hooks/useGames";
import useMyVetoes from "@/hooks/useMyVetoes";
import { gameOptions } from "@/lib/games";

// The member's own vetoes, with undo and add.
interface ProfileVetoesProps {
  games: GamesState;
}

const ProfileVetoes = ({ games }: ProfileVetoesProps) => {
  const myVetoes = useMyVetoes();
  const [picked, setPicked] = useState<string | null>(null);

  const veto = async () => {
    if (!picked) return;
    await myVetoes.add(Number(picked));
    setPicked(null);
  };

  return (
    <Stack gap="xs">
      <Title order={3}>Games you&apos;ve vetoed</Title>
      <Text c="dimmed" size="sm">
        These are left out of suggestions for any group that includes you, in
        every year.
      </Text>
      {games.error && (
        <Alert color="red" role="alert">
          Couldn&apos;t load the game list.
        </Alert>
      )}
      {myVetoes.error && (
        <Alert color="red" role="alert">
          {myVetoes.error}
        </Alert>
      )}
      {!myVetoes.loading && myVetoes.vetoes.length === 0 && (
        <Text size="sm">You haven&apos;t vetoed any games.</Text>
      )}
      {myVetoes.vetoes.length > 0 && (
        <Stack gap="calc(var(--mantine-spacing-xs) / 2)">
          {myVetoes.vetoes.map((v) => (
            <Group key={v.bggId} justify="space-between" wrap="nowrap">
              <Text>{v.name ?? `Game ${v.bggId}`}</Text>
              <Button
                size="xs"
                variant="default"
                aria-label={`Undo veto of ${v.name ?? `Game ${v.bggId}`}`}
                disabled={myVetoes.saving}
                onClick={() => myVetoes.clear(v.bggId)}
              >
                Undo
              </Button>
            </Group>
          ))}
        </Stack>
      )}
      <Group gap="xs" wrap="nowrap">
        <Select
          flex={1}
          miw={0}
          aria-label="Game to veto"
          placeholder="Search games..."
          searchable
          data={gameOptions(
            games.games,
            myVetoes.vetoes.map((v) => v.bggId),
          )}
          value={picked}
          onChange={setPicked}
          disabled={myVetoes.saving || games.error}
        />
        <Button loading={myVetoes.saving} disabled={!picked} onClick={veto}>
          Veto
        </Button>
      </Group>
    </Stack>
  );
};

export default ProfileVetoes;
