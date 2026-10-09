import { useState } from "react";

import {
  Alert,
  Button,
  Group,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";

import BggDataTable from "@/components/admin/BggDataTable";
import BggJobProgress from "@/components/admin/BggJobProgress";
import BggKeyCard from "@/components/admin/BggKeyCard";
import useBggKey from "@/hooks/useBggKey";
import useBggStatus from "@/hooks/useBggStatus";
import { incompleteIds, isRunning } from "@/lib/bgg";

const NO_KEY = "Set and verify an API key to enable downloads.";

const BggDataPanel = () => {
  const key = useBggKey();
  const data = useBggStatus();
  const [selected, setSelected] = useState<number[]>([]);

  if (key.loading || data.loading)
    return <Text mt="md">Loading game data...</Text>;
  if (key.error || data.error || !key.info || !data.status) {
    return (
      <Alert color="red" mt="md" title="Couldn't load game data">
        Refresh the page to try again.
      </Alert>
    );
  }

  const { status } = data;
  const running = isRunning(status.job);
  // Only the server's view counts: a key that can't be read is not usable.
  const keyReady = key.info.configured;
  const todo = incompleteIds(status.games);
  const canDownload = keyReady && !running;
  const noKeyTip = keyReady ? undefined : NO_KEY;

  const start = (req: Parameters<typeof data.download>[0]) => {
    setSelected([]);
    return data.download(req);
  };

  return (
    <Stack mt="xl">
      <Title order={2}>Board Game Geek data</Title>
      <BggKeyCard
        info={key.info}
        testing={key.testing}
        testResult={key.testResult}
        error={key.actionError}
        onSave={async (k) => {
          const ok = await key.save(k);
          if (ok) await data.refresh();
          return ok;
        }}
        onRemove={async () => {
          await key.remove();
          await data.refresh();
        }}
        onTest={key.test}
      />

      {!keyReady && <Alert color="yellow">{NO_KEY}</Alert>}
      {status.scoresUnavailable && (
        <Alert color="red" title="Scores unavailable">
          The score data couldn&apos;t be loaded, so only games already stored
          are listed.
        </Alert>
      )}
      {data.actionError && (
        <Alert color="red" role="alert">
          {data.actionError}
        </Alert>
      )}

      <Title order={4}>Game data</Title>
      <Text>
        Needed {status.totals.needed} · Loaded {status.totals.loaded} · Missing{" "}
        {status.totals.missing} ({status.totals.partial} partial)
      </Text>

      <Group gap="xs">
        <Tooltip label={noKeyTip} disabled={keyReady}>
          <span>
            <Button
              size="xs"
              disabled={!canDownload || todo.length === 0}
              onClick={() => start({ mode: "missing" })}
            >
              Download missing ({todo.length})
            </Button>
          </span>
        </Tooltip>
        <Tooltip label={noKeyTip} disabled={keyReady}>
          <span>
            <Button
              size="xs"
              variant="default"
              disabled={!canDownload || selected.length === 0}
              onClick={() => start({ mode: "ids", ids: selected })}
            >
              Redownload selected ({selected.length})
            </Button>
          </span>
        </Tooltip>
        <Button size="xs" variant="subtle" onClick={() => data.refresh()}>
          Refresh
        </Button>
      </Group>

      <BggJobProgress job={status.job} onCancel={data.cancel} />
      <BggDataTable
        games={status.games}
        selected={selected}
        onSelectedChange={setSelected}
        disabled={running}
      />
    </Stack>
  );
};

export default BggDataPanel;
