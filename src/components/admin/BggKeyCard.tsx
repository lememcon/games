import { useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import type { BggKeyInfo, BggKeyTest } from "@/types";

interface Props {
  info: BggKeyInfo;
  testing: boolean;
  testResult: BggKeyTest | null;
  error: string | null;
  onSave: (apiKey: string) => Promise<boolean>;
  onRemove: () => void;
  // Tests the typed candidate, or the stored key when none is given.
  onTest: (candidate?: string) => void;
}

const BggKeyCard = ({
  info,
  testing,
  testResult,
  error,
  onSave,
  onRemove,
  onTest,
}: Props) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const typing = editing && draft.trim() !== "";

  const close = () => {
    setEditing(false);
    setDraft("");
  };

  const save = async () => {
    if (await onSave(draft)) close();
  };

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={4}>BGG API key</Title>
          {info.configured ? (
            <Badge color="green">Configured</Badge>
          ) : info.unreadable ? (
            <Badge color="red">Unreadable</Badge>
          ) : (
            <Badge color="gray">Not set</Badge>
          )}
        </Group>

        {info.unreadable && (
          <Alert color="red">
            The stored key can no longer be read. Enter it again.
          </Alert>
        )}
        {info.configured && !editing && (
          <Text ff="monospace">{info.masked}</Text>
        )}
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}

        {editing && (
          <PasswordInput
            label="New key"
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
          />
        )}

        <Group gap="xs">
          {editing ? (
            <>
              <Button size="xs" disabled={!typing} onClick={save}>
                Save
              </Button>
              <Button size="xs" variant="default" onClick={close}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              size="xs"
              variant="default"
              onClick={() => setEditing(true)}
            >
              {info.configured ? "Edit" : "Set key"}
            </Button>
          )}
          <Button
            size="xs"
            variant="default"
            loading={testing}
            disabled={!typing && !info.configured}
            onClick={() => onTest(typing ? draft : undefined)}
          >
            Test key
          </Button>
          {info.configured && !editing && (
            <Button size="xs" color="red" variant="subtle" onClick={onRemove}>
              Remove
            </Button>
          )}
        </Group>

        {testResult && (
          <Text size="sm" c={testResult.ok ? "green" : "red"} role="status">
            {testResult.message}
          </Text>
        )}
      </Stack>
    </Paper>
  );
};

export default BggKeyCard;
