import { Switch, Text } from "@mantine/core";

interface MyVetoProps {
  vetoed: boolean;
  saving: boolean;
  error: string | null;
  onChange: (vetoed: boolean) => void;
}

// Lets a member keep this game out of suggestions in every year for any group
// that includes them. Their scores stay on the page and in the tables.
const MyVeto = ({ vetoed, saving, error, onChange }: MyVetoProps) => (
  <section className="my-veto">
    <Switch
      label="Not for me"
      checked={vetoed}
      disabled={saving}
      onChange={(e) => onChange(e.currentTarget.checked)}
    />
    <Text size="sm" c="dimmed">
      Leave this game out of suggestions in every year for any group that
      includes you. It only applies when your name is linked to your account.
    </Text>
    {error && (
      <Text size="xs" c="red" role="alert">
        {error}
      </Text>
    )}
  </section>
);

export default MyVeto;
