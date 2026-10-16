import { Alert, Stack, Text, Title } from "@mantine/core";

import VetoRow from "@/components/VetoRow";
import useMyYearVetoes from "@/hooks/useMyYearVetoes";
import { groupYearVetoes } from "@/lib/profile";

// The member's own single-year vetoes, grouped by year, with undo.
const ProfileYearVetoes = () => {
  const mine = useMyYearVetoes();

  return (
    <Stack gap="xs">
      <Title order={3}>Games you&apos;ve vetoed for one year</Title>
      <Text c="dimmed" size="sm">
        These are left out of suggestions for any group that includes you, for
        that year only.
      </Text>
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
              name={v.name}
              undo={{
                label: `Undo ${year} veto of ${v.name ?? `Game ${v.bggId}`}`,
                disabled: mine.saving,
                onClick: () => mine.clear(year, v.bggId),
              }}
            />
          ))}
        </Stack>
      ))}
    </Stack>
  );
};

export default ProfileYearVetoes;
