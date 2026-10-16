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

import VetoRow from "@/components/VetoRow";
import type { GamesState } from "@/hooks/useGames";
import useMyYearVetoes from "@/hooks/useMyYearVetoes";
import useYears from "@/hooks/useYears";
import { gameOptions } from "@/lib/games";
import { groupYearVetoes } from "@/lib/profile";

// The member's own single-year vetoes, grouped by year, with undo and add.
interface ProfileYearVetoesProps {
  games: GamesState;
}

const ProfileYearVetoes = ({ games }: ProfileYearVetoesProps) => {
  const mine = useMyYearVetoes();
  const { years, error: yearsError } = useYears();
  const [chosenYear, setChosenYear] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const thisYear = String(new Date().getFullYear());
  const year =
    chosenYear ??
    (years.includes(thisYear) ? thisYear : (years.at(-1) ?? null));

  const changeYear = (next: string | null) => {
    setChosenYear(next);
    setPicked(null);
  };

  const veto = async () => {
    if (!picked || !year) return;
    if (await mine.add(Number(year), Number(picked))) setPicked(null);
  };

  return (
    <Stack gap="xs">
      <Title order={3}>Games you&apos;ve vetoed for one year</Title>
      <Text c="dimmed" size="sm">
        These are left out of suggestions for any group that includes you, for
        that year only.
      </Text>
      {games.error && (
        <Alert color="red" role="alert">
          Couldn&apos;t load the game list.
        </Alert>
      )}
      {yearsError && (
        <Alert color="red" role="alert">
          Couldn&apos;t load the years.
        </Alert>
      )}
      {mine.error && (
        <Alert color="red" role="alert">
          {mine.error}
        </Alert>
      )}
      {!mine.loading && mine.vetoes.length === 0 && (
        <Text size="sm">
          You haven&apos;t vetoed any games for a single year.
        </Text>
      )}
      {groupYearVetoes(mine.vetoes).map(({ year, vetoes }) => (
        <Stack key={year} gap="calc(var(--mantine-spacing-xs) / 2)">
          <Title order={4}>Vetoed in {year}</Title>
          {vetoes.map((v) => (
            <VetoRow
              key={v.bggId}
              bggId={v.bggId}
              year={year}
              name={v.name}
              image={v.image}
              ext={v.ext}
              cover={games.games[String(v.bggId)]?.cover}
              undo={{
                label: `Undo ${year} veto of ${v.name ?? `Game ${v.bggId}`}`,
                disabled: mine.saving,
                onClick: () => mine.clear(year, v.bggId),
              }}
            />
          ))}
        </Stack>
      ))}
      <Group gap="xs" wrap="nowrap">
        <Select
          flex={1}
          miw={0}
          aria-label="Game for a one-year veto"
          placeholder="Search games..."
          searchable
          data={gameOptions(
            games.games,
            mine.vetoes
              .filter((v) => String(v.year) === year)
              .map((v) => v.bggId),
          )}
          value={picked}
          onChange={setPicked}
          disabled={mine.saving || games.error}
        />
        <Select
          w={100}
          flex="none"
          aria-label="Year for the veto"
          data={years}
          value={year}
          onChange={changeYear}
          allowDeselect={false}
          disabled={mine.saving || yearsError}
        />
        <Button
          loading={mine.saving}
          disabled={!picked || !year}
          onClick={veto}
        >
          Veto
        </Button>
      </Group>
    </Stack>
  );
};

export default ProfileYearVetoes;
