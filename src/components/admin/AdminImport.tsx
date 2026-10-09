import { useMemo, useState } from "react";
import { Link } from "wouter";

import {
  Alert,
  Button,
  FileInput,
  List,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";

import useLocalState from "@/hooks/useLocalState";
import { ApiError, apiFetch } from "@/lib/api";
import {
  fileYear,
  parseFile,
  prepareImport,
  problemsFrom,
} from "@/lib/importFile";
import type { ImportProblem, ImportResult } from "@/types";

const MAX_SHOWN = 10;

type Outcome =
  | { kind: "success"; result: ImportResult }
  | { kind: "error"; message: string; problems: ImportProblem[] };

const failure = (e: unknown, year: number | null): Outcome => {
  const error = (message: string, problems: ImportProblem[] = []): Outcome => ({
    kind: "error",
    message,
    problems,
  });
  if (!(e instanceof ApiError))
    return error("Something went wrong. Try again.");
  switch (e.status) {
    case 409:
      return error(`Year ${year} already exists.`);
    case 422:
      return error("The file has problems:", problemsFrom(e.body));
    case 400:
      return error("The server couldn't read that file as JSON.");
    case 413:
      return error("That file is too large to import.");
    case 401:
    case 403:
      return error("You no longer have admin access.");
    default:
      return error("Something went wrong. Try again.");
  }
};

const AdminImport = () => {
  const [raw, setRaw] = useState<Record<string, unknown> | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [yearInput, setYearInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [, setYear] = useLocalState("year", "");
  const [, setPlayers] = useLocalState<string[]>("players", []);

  const prepared = useMemo(
    () => (raw ? prepareImport(raw, yearInput) : null),
    [raw, yearInput],
  );

  const handleFile = async (file: File | null) => {
    setOutcome(null);
    setRaw(null);
    setFileError(null);
    if (!file) return;
    const parsed = parseFile(await file.text());
    if (parsed.ok) {
      setRaw(parsed.raw);
      setYearInput(fileYear(parsed.raw));
    } else {
      setFileError(parsed.error);
    }
  };

  const handleSubmit = async () => {
    if (!prepared?.ok) return;
    setSubmitting(true);
    setOutcome(null);
    try {
      const result = await apiFetch<ImportResult>("/admin/import", {
        method: "POST",
        body: prepared.body,
      });
      setOutcome({ kind: "success", result });
    } catch (e) {
      setOutcome(failure(e, prepared.year));
    } finally {
      setSubmitting(false);
    }
  };

  const viewYear = (year: number) => {
    setPlayers([]);
    setYear(`${year}`);
  };

  const problem =
    fileError ?? (prepared && !prepared.ok ? prepared.error : null);

  return (
    <Stack mt="md" maw={520}>
      <Title order={2}>Import scores</Title>
      <Text c="dimmed" size="sm">
        Upload a score JSON file to create a new year, or a games-only file to
        update game metadata.
      </Text>
      <TextInput
        label="Year"
        description="Leave blank for a games-only upload."
        value={yearInput}
        onChange={(e) => {
          setYearInput(e.currentTarget.value);
          setOutcome(null);
        }}
        inputMode="numeric"
      />
      <FileInput
        label="File"
        accept="application/json,.json"
        placeholder="Choose a .json file"
        clearable
        clearButtonProps={{ "aria-label": "Clear file" }}
        onChange={handleFile}
      />
      {prepared?.ok && (
        <Text size="sm" c="dimmed">
          Preview: {prepared.summary}
        </Text>
      )}
      {problem && <Alert color="red">{problem}</Alert>}
      <Button
        onClick={handleSubmit}
        disabled={!prepared?.ok}
        loading={submitting}
        w="max-content"
      >
        {prepared?.ok && prepared.year !== null
          ? `Import ${prepared.year}`
          : "Import"}
      </Button>

      {outcome?.kind === "success" && (
        <Alert color="green">
          {outcome.result.year === null
            ? `Imported games: ${outcome.result.games.new} new, ${outcome.result.games.updated} updated.`
            : `Imported ${outcome.result.year}: ${outcome.result.scores} scores, ${outcome.result.games.new} new games, ${outcome.result.games.updated} updated.`}
          {outcome.result.year !== null && (
            <>
              {" "}
              <Link href="/" onClick={() => viewYear(outcome.result.year!)}>
                View {outcome.result.year}
              </Link>
            </>
          )}
          {outcome.result.warnings.length > 0 && (
            <List size="sm" mt="xs">
              {outcome.result.warnings.map((w) => (
                <List.Item key={w}>{w}</List.Item>
              ))}
            </List>
          )}
        </Alert>
      )}
      {outcome?.kind === "error" && (
        <Alert color="red">
          {outcome.message}
          {outcome.problems.length > 0 && (
            <List size="sm" mt="xs">
              {outcome.problems.slice(0, MAX_SHOWN).map((p, i) => (
                <List.Item key={i}>
                  {p.path ? `${p.path}: ` : ""}
                  {p.message}
                </List.Item>
              ))}
              {outcome.problems.length > MAX_SHOWN && (
                <List.Item>
                  and {outcome.problems.length - MAX_SHOWN} more
                </List.Item>
              )}
            </List>
          )}
        </Alert>
      )}
    </Stack>
  );
};

export default AdminImport;
