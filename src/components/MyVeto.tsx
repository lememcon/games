import { useState } from "react";

import { Text } from "@mantine/core";

import VetoDialog from "@/components/VetoDialog";
import VetoToggle from "@/components/VetoToggle";

interface MyVetoProps {
  game: string;
  year: string;
  vetoed: boolean;
  yearVetoed: boolean;
  savingVeto: boolean;
  savingYear: boolean;
  error: string | null;
  onVeto: (on: boolean) => void;
  onYearVeto: (on: boolean) => void;
}

const stateLine = (vetoed: boolean, yearVetoed: boolean, year: string) => {
  if (vetoed && yearVetoed)
    return `Vetoed for every year and skipped for ${year}.`;
  if (vetoed) return "Vetoed for every year.";
  if (yearVetoed) return `Skipped for ${year}.`;
  return "You have not vetoed this game.";
};

// Lets a member keep this game out of suggestions in every year, or only the
// viewed one, for any group that includes them. Their scores stay on the page
// and in the tables.
const MyVeto = ({
  game,
  year,
  vetoed,
  yearVetoed,
  savingVeto,
  savingYear,
  error,
  onVeto,
  onYearVeto,
}: MyVetoProps) => {
  const [opened, setOpened] = useState(false);
  return (
    <section className="my-veto">
      <div>
        <VetoToggle
          game={game}
          year={year}
          vetoed={vetoed}
          yearVetoed={yearVetoed}
          disabled={savingVeto || savingYear}
          onOpen={() => setOpened(true)}
        />
      </div>
      <Text size="sm">{stateLine(vetoed, yearVetoed, year)}</Text>
      <Text size="sm" c="dimmed">
        Leave this game out of suggestions in every year, or only in {year}, for
        any group that includes you. It only applies when your name is linked to
        your account.
      </Text>
      {error && (
        <Text size="xs" c="red" role="alert">
          {error}
        </Text>
      )}
      {opened && (
        <VetoDialog
          game={game}
          year={year}
          vetoed={vetoed}
          yearVetoed={yearVetoed}
          savingVeto={savingVeto}
          savingYear={savingYear}
          onVeto={onVeto}
          onYearVeto={onYearVeto}
          onClose={() => setOpened(false)}
        />
      )}
    </section>
  );
};

export default MyVeto;
