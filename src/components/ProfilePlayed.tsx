import { useState } from "react";

import {
  Button,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import GameCover from "@/components/GameCover";
import useData from "@/hooks/useData";
import type { GamesState } from "@/hooks/useGames";
import usePlayed from "@/hooks/usePlayed";
import useYears from "@/hooks/useYears";
import {
  addOptions,
  defaultYear,
  gameNamesById,
  playedGames,
} from "@/lib/played";

// The member's own played games for a year, with remove and add.
const ProfilePlayed = ({ games }: { games: GamesState }) => {
  const { years, loading: yearsLoading, error: yearsError } = useYears();
  // Empty until the member picks one, so a refetched years list cannot reset it.
  const [chosen, setChosen] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const year = chosen || defaultYear(years, new Date());
  const data = useData(year || null);
  const [, toggle, played, , playedError, clear] = usePlayed(year);
  const [confirming, setConfirming] = useState(false);
  // Snapshot at open so the title stays put while the modal fades out.
  const [confirmCount, setConfirmCount] = useState(0);

  const names = gameNamesById(data.scores);
  const loaded = played !== null;
  const canAdd = loaded && !data.loading && !data.error;

  const confirmClear = () => {
    clear();
    setConfirming(false);
  };

  const add = () => {
    if (!picked) return;
    toggle(picked);
    setPicked(null);
  };

  return (
    <Stack gap="xs">
      <Title order={3}>Games you&apos;ve played</Title>
      <Text c="dimmed" size="sm">
        The games you&apos;ve marked as played, by year.
      </Text>
      {yearsLoading ? (
        <Loader size="sm" />
      ) : yearsError ? (
        <Text size="sm">Couldn&apos;t load years.</Text>
      ) : years.length === 0 ? (
        <Text size="sm">No years yet.</Text>
      ) : (
        <>
          <Select
            aria-label="Year"
            data={years}
            value={year}
            allowDeselect={false}
            onChange={(v) => {
              setChosen(v ?? "");
              setPicked(null);
              setConfirming(false);
            }}
          />
          {!loaded ? (
            <Text size="sm">Loading played games...</Text>
          ) : Object.keys(played).length === 0 ? (
            <Text size="sm">You haven&apos;t marked any games this year.</Text>
          ) : (
            <Stack gap="calc(var(--mantine-spacing-xs) / 2)">
              {playedGames(played, names).map((g) => (
                <Group key={g.id} justify="space-between" wrap="nowrap">
                  <GameCover
                    bggId={g.id}
                    image={games.games[g.id]?.image}
                    ext={games.games[g.id]?.ext}
                  />
                  <Text flex={1} miw={0} style={{ overflowWrap: "anywhere" }}>
                    {g.name}
                  </Text>
                  <Button
                    size="xs"
                    variant="default"
                    style={{ flex: "none" }}
                    aria-label={`Remove ${g.name}`}
                    onClick={() => toggle(g.id)}
                  >
                    Remove
                  </Button>
                </Group>
              ))}
              <Group justify="flex-end">
                <Button
                  size="xs"
                  variant="default"
                  color="red"
                  disabled={data.loading}
                  onClick={() => {
                    setConfirmCount(Object.keys(played).length);
                    setConfirming(true);
                  }}
                >
                  Clear all
                </Button>
              </Group>
            </Stack>
          )}
          {playedError && (
            <Text c="red" size="sm" role="alert">
              {playedError}
            </Text>
          )}
          {data.loading && <Loader size="sm" aria-label="Loading games" />}
          {data.error && <Text size="sm">Couldn&apos;t load games.</Text>}
          <Group gap="xs" wrap="nowrap">
            <Select
              flex={1}
              miw={0}
              aria-label="Game to add"
              placeholder="Search games..."
              searchable
              data={addOptions(names, played ?? {})}
              value={picked}
              onChange={setPicked}
              disabled={!canAdd}
            />
            <Button disabled={!canAdd || !picked} onClick={add}>
              Add
            </Button>
          </Group>
          <Modal
            opened={confirming}
            onClose={() => setConfirming(false)}
            title={`Clear all ${confirmCount} ${confirmCount === 1 ? "game" : "games"} for ${year}?`}
          >
            <Text size="sm">This can&apos;t be undone.</Text>
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button color="red" onClick={confirmClear}>
                Clear all
              </Button>
            </Group>
          </Modal>
        </>
      )}
    </Stack>
  );
};

export default ProfilePlayed;
