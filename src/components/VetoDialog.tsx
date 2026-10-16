import { Button, Group, Modal, Stack } from "@mantine/core";

interface VetoDialogProps {
  game: string;
  year: string;
  // Vetoed for every year.
  vetoed: boolean;
  // Vetoed for this year only.
  yearVetoed: boolean;
  savingVeto: boolean;
  savingYear: boolean;
  onVeto: (on: boolean) => void;
  onYearVeto: (on: boolean) => void;
  onClose: () => void;
}

// Chooses how a game is vetoed: for every year or only for the viewed year.
// A scope that is already set offers its removal instead. A choice closes the
// dialog; the save carries on in the caller.
const VetoDialog = ({
  game,
  year,
  vetoed,
  yearVetoed,
  savingVeto,
  savingYear,
  onVeto,
  onYearVeto,
  onClose,
}: VetoDialogProps) => (
  <Modal opened onClose={onClose} title={`Veto "${game}"`}>
    <Stack gap="xs">
      <Button
        variant="default"
        disabled={savingVeto}
        onClick={() => {
          onVeto(!vetoed);
          onClose();
        }}
      >
        {vetoed ? "Remove: not for me" : "Not for me · every year"}
      </Button>
      <Button
        variant={yearVetoed ? "default" : "filled"}
        disabled={savingYear}
        onClick={() => {
          onYearVeto(!yearVetoed);
          onClose();
        }}
      >
        {yearVetoed ? `Remove: not in ${year}` : `Not in ${year}`}
      </Button>
    </Stack>
    <Group justify="flex-end" mt="md">
      <Button variant="subtle" onClick={onClose}>
        Cancel
      </Button>
    </Group>
  </Modal>
);

export default VetoDialog;
