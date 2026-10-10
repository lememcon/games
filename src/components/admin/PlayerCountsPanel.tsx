import { Alert, Stack, Text, Title } from "@mantine/core";

import PlayerCountsTable from "@/components/admin/PlayerCountsTable";
import useGamePlayers from "@/hooks/useGamePlayers";

const PlayerCountsPanel = () => {
  const { games, loading, error, saving, rowErrors, save, reset } =
    useGamePlayers();

  if (loading) return <Text mt="md">Loading player counts...</Text>;
  if (error) {
    return (
      <Alert color="red" mt="md" title="Couldn't load player counts">
        Refresh the page to try again.
      </Alert>
    );
  }

  const overridden = games.filter((g) => g.override).length;

  return (
    <Stack mt="xl">
      <Title order={2}>Player counts</Title>
      <Text>
        Restrict a game&apos;s player range from what BGG lists. Scoring and the
        player filter use the restricted range. {overridden} of {games.length}{" "}
        games restricted.
      </Text>
      {games.length === 0 ? (
        <Text c="dimmed">No games yet. Import scores first.</Text>
      ) : (
        <PlayerCountsTable
          games={games}
          saving={saving}
          errors={rowErrors}
          onSave={save}
          onReset={reset}
        />
      )}
    </Stack>
  );
};

export default PlayerCountsPanel;
