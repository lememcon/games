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
import type { CoverJob } from "@/types";

const TITLES: Record<CoverJob["state"], string> = {
  idle: "",
  running: "Mirroring covers",
  done: "Mirror finished",
  failed: "Mirror stopped",
  cancelled: "Mirror cancelled",
};

const CoverJobProgress = ({
  job,
  onCancel,
}: {
  job: CoverJob;
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
          aria-label="Mirror progress"
          animated={running}
        />
        <Text size="sm" c="dimmed">
          {job.done} of {job.total} covers, {job.mirrored} stored
          {job.failed > 0 && `, ${job.failed} failed`}
        </Text>
        {job.errors.length > 0 && (
          <Alert
            color="red"
            title="Some covers had problems"
            style={{ overflowWrap: "anywhere" }}
          >
            {job.errors.map((e, i) => (
              <Text size="sm" key={i}>
                {e}
              </Text>
            ))}
          </Alert>
        )}
      </Stack>
    </Paper>
  );
};

export default CoverJobProgress;
