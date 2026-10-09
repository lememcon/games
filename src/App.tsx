import {
  Button,
  Loader,
  MantineProvider,
  Stack,
  Text,
  Title,
  createTheme,
} from "@mantine/core";

import AuthedApp from "@/components/AuthedApp";
import PendingApproval from "@/components/PendingApproval";
import SignIn from "@/components/SignIn";
import useMe from "@/hooks/useMe";

import "@mantine/core/styles.css";
import "@/assets/styles.css";

// Component-tray identity: a rounded, friendly display face, an amber
// victory-point accent, and a monospace face for the scores so digits line up
// like a scorepad. The light paper surfaces live in src/assets/styles.css.
const theme = createTheme({
  primaryColor: "amber",
  primaryShade: 6,
  colors: {
    amber: [
      "#fbf3e0",
      "#f4e7c6",
      "#e9cd8d",
      "#dfb457",
      "#d79f2c",
      "#d1961d",
      "#c9871c",
      "#a86e12",
      "#8a5d0c",
      "#6f4706",
    ],
  },
  defaultRadius: "md",
  fontFamily:
    "'Trebuchet MS', 'Segoe UI', system-ui, Helvetica, Arial, sans-serif",
  fontFamilyMonospace:
    "'SF Mono', 'JetBrains Mono', 'Roboto Mono', ui-monospace, Menlo, Consolas, monospace",
  headings: {
    fontFamily:
      "'Trebuchet MS', 'Segoe UI', system-ui, Helvetica, Arial, sans-serif",
  },
});

function Gate() {
  const { me, error, loading, retry } = useMe();

  if (error) {
    return (
      <Stack align="center" gap="xs" mt="xl" px="md">
        <Title order={3}>Couldn&apos;t reach the server</Title>
        <Text c="dimmed" ta="center">
          Check your connection and try again.
        </Text>
        <Button onClick={retry} disabled={loading}>
          Retry
        </Button>
      </Stack>
    );
  }
  if (!me) {
    return (
      <Stack align="center" mt="xl">
        <Loader />
      </Stack>
    );
  }
  if (me.status === "anonymous") return <SignIn />;
  if (me.status === "pending") {
    return (
      <PendingApproval
        name={me.user.name}
        onCheckAgain={retry}
        checking={loading}
      />
    );
  }
  return <AuthedApp user={me.user} />;
}

function App() {
  return (
    <MantineProvider theme={theme}>
      <Gate />
    </MantineProvider>
  );
}

export default App;
