import {
  Alert,
  Button,
  Group,
  Paper,
  Progress,
  Stack,
  Text,
} from "@mantine/core";

import { progressPercent } from "@/lib/bgg";
import type { BggJob } from "@/types";

const TITLES: Record<BggJob["state"], string> = {
  idle: "",
  running: "Downloading",
  done: "Download finished",
  failed: "Download stopped",
  cancelled: "Download cancelled",
};

const BggJobProgress = ({
  job,
  onCancel,
}: {
  job: BggJob;
  onCancel: () => void;
}) => {
  if (job.state === "idle") return null;
  const running = job.state === "running";

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={600}>{TITLES[job.state]}</Text>
          {running && (
            <Button size="xs" variant="default" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </Group>
        <Progress
          value={progressPercent(job)}
          aria-label="Download progress"
          animated={running}
        />
        <Text size="sm" c="dimmed">
          {job.batchesDone} of {job.batchesTotal} batches, {job.done} of{" "}
          {job.total} games
          {job.notFound > 0 && `, ${job.notFound} not found on BoardGameGeek`}
        </Text>
        {job.errors.length > 0 && (
          <Alert color="red" title="Some batches had problems">
            {job.errors.map((e, i) => (
              <Text size="sm" key={i}>
                {e}
              </Text>
            ))}
            <Text size="sm">Games fetched before the problem were saved.</Text>
          </Alert>
        )}
      </Stack>
    </Paper>
  );
};

export default BggJobProgress;
