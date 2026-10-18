import { Alert, Button, Group, Stack, Text, Title } from "@mantine/core";

import CoverJobProgress from "@/components/admin/CoverJobProgress";
import useCoverStatus from "@/hooks/useCoverStatus";
import { isCoverRunning } from "@/lib/coverJob";

const NO_STORAGE = "Cover storage isn't configured on the server.";

const CoverPanel = () => {
  const data = useCoverStatus();

  if (data.loading) return <Text mt="md">Loading covers...</Text>;
  if (!data.status) {
    return (
      <Alert color="red" mt="md" title="Couldn't load covers">
        Refresh the page to try again.
      </Alert>
    );
  }

  const { status } = data;
  const canMirror =
    status.configured && !isCoverRunning(status.job) && status.pending > 0;

  return (
    <Stack mt="md">
      <Title order={2}>Cover images</Title>
      {!status.configured && <Alert color="yellow">{NO_STORAGE}</Alert>}
      {data.error && (
        <Alert color="red" role="alert">
          Couldn&apos;t refresh covers. Showing the last loaded view.
        </Alert>
      )}
      {data.actionError && (
        <Alert color="red" role="alert">
          {data.actionError}
        </Alert>
      )}
      <Text>Covers waiting to be mirrored: {status.pending}</Text>
      <Group gap="xs">
        <Button size="xs" disabled={!canMirror} onClick={() => data.mirror()}>
          Mirror missing ({status.pending})
        </Button>
        <Button size="xs" variant="subtle" onClick={() => data.refresh()}>
          Refresh
        </Button>
      </Group>
      <CoverJobProgress job={status.job} onCancel={data.cancel} />
    </Stack>
  );
};

export default CoverPanel;
