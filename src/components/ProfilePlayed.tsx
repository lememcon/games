import { useState } from "react";

import {
  Button,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import useData from "@/hooks/useData";
import usePlayedCounts from "@/hooks/usePlayedCounts";
import useYears from "@/hooks/useYears";
import {
  addOptions,
  defaultYear,
  gameNamesById,
  playedGames,
} from "@/lib/played";

// The member's own played games for a year, with remove and add.
const ProfilePlayed = () => {
  const { years, loading: yearsLoading, error: yearsError } = useYears();
  // Empty until the member picks one, so a refetched years list cannot reset it.
  const [chosen, setChosen] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const year = chosen || defaultYear(years, new Date());
  const data = useData(year || null);
  const [, toggle, counts, , playedError] = usePlayedCounts(year);

  const names = gameNamesById(data.scores);
  const loaded = counts !== null;
  const canAdd = loaded && !data.loading && !data.error;

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
            }}
          />
          {!loaded ? (
            <Text size="sm">Loading played games...</Text>
          ) : Object.keys(counts).length === 0 ? (
            <Text size="sm">You haven&apos;t marked any games this year.</Text>
          ) : (
            <Stack gap={4}>
              {playedGames(counts, names).map((g) => (
                <Group key={g.id} justify="space-between" wrap="nowrap">
                  <Text>{g.name}</Text>
                  <Button
                    size="xs"
                    variant="default"
                    aria-label={`Remove ${g.name}`}
                    onClick={() => toggle(g.id)}
                  >
                    Remove
                  </Button>
                </Group>
              ))}
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
              aria-label="Game to add"
              placeholder="Search games..."
              searchable
              data={addOptions(names, counts ?? {})}
              value={picked}
              onChange={setPicked}
              disabled={!canAdd}
            />
            <Button disabled={!canAdd || !picked} onClick={add}>
              Add
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
};

export default ProfilePlayed;
