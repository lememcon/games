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
  TextInput,
  Title,
} from "@mantine/core";

import useCoverStorage from "@/hooks/useCoverStorage";
import {
  isComplete,
  isEdited,
  sourceLabel,
  toForm,
  toInput,
  type StorageForm,
} from "@/lib/coverStorage";

type Storage = ReturnType<typeof useCoverStorage>;
type Loaded = Storage & { info: NonNullable<Storage["info"]> };

const FIELDS: { key: keyof StorageForm; label: string; hint?: string }[] = [
  { key: "bucket", label: "Bucket" },
  { key: "region", label: "Region" },
  {
    key: "endpoint",
    label: "Endpoint (optional)",
    hint: "Leave blank for AWS.",
  },
  { key: "coverBaseUrl", label: "Cover base URL" },
  { key: "accessKeyId", label: "Access key id" },
];

const StorageFormView = ({
  info,
  testing,
  testResult,
  actionError,
  save,
  clear,
  clearTest,
  test,
}: Loaded) => {
  const saved = toForm(info);
  const [form, setForm] = useState(saved);
  const edited = isEdited(form, saved);
  const set = (key: keyof StorageForm, value: string) => {
    clearTest();
    setForm((f) => ({ ...f, [key]: value }));
  };

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Title order={4}>Cover storage</Title>
        <Badge color={info.configured ? "green" : "gray"}>
          {sourceLabel(info.source)}
        </Badge>
      </Group>

      {info.unreadable && (
        <Alert color="red">
          The saved settings can no longer be read. Enter them again.
        </Alert>
      )}
      {info.accessKeyId && (
        <Text size="sm">
          Access key id{" "}
          <Text span ff="monospace" style={{ overflowWrap: "anywhere" }}>
            {info.accessKeyId}
          </Text>
        </Text>
      )}
      {actionError && (
        <Alert color="red" role="alert">
          {actionError}
        </Alert>
      )}

      {FIELDS.map(({ key, label, hint }) => (
        <TextInput
          key={key}
          label={label}
          description={hint}
          autoComplete="off"
          value={form[key]}
          onChange={(e) => set(key, e.currentTarget.value)}
        />
      ))}
      <PasswordInput
        label="Secret access key"
        autoComplete="off"
        placeholder={info.secretSet ? "Saved: leave blank to keep" : undefined}
        value={form.secretAccessKey}
        onChange={(e) => set("secretAccessKey", e.currentTarget.value)}
      />

      <Group gap="xs">
        <Button
          size="xs"
          disabled={!edited || !isComplete(form)}
          onClick={() => save(toInput(form))}
        >
          Save
        </Button>
        <Button
          size="xs"
          variant="default"
          loading={testing}
          disabled={edited ? !isComplete(form) : !info.configured}
          onClick={() => test(edited ? toInput(form) : undefined)}
        >
          Test storage
        </Button>
        {info.source === "admin" && (
          <Button size="xs" color="red" variant="subtle" onClick={clear}>
            Remove override
          </Button>
        )}
      </Group>

      {edited && !isComplete(form) && (
        <Text size="sm" c="dimmed">
          Re-enter the access key id to change any setting.
        </Text>
      )}

      {testResult && (
        <Stack gap={0} role="status">
          <Text size="sm" c={testResult.ok ? "green" : "red"}>
            {testResult.message}
          </Text>
          {testResult.warning && (
            <Text size="sm" c="yellow.8">
              {testResult.warning}
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
};

const CoverStorageCard = () => {
  const storage = useCoverStorage();
  const { info } = storage;

  return (
    <Paper withBorder p="md" radius="md" mt="md">
      {storage.loading ? (
        <Text>Loading cover storage...</Text>
      ) : storage.error || !info ? (
        <Alert color="red" title="Couldn't load cover storage">
          Refresh the page to try again.
        </Alert>
      ) : (
        <StorageFormView
          key={`${info.source}-${info.updatedAt}`}
          {...storage}
          info={info}
        />
      )}
    </Paper>
  );
};

export default CoverStorageCard;
