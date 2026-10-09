import type { ReactNode } from "react";
import { Redirect, Route, Switch } from "wouter";

import { AppShell } from "@mantine/core";

import AdminPage from "@/components/AdminPage";
import BackButton from "@/components/BackButton";
import Header from "@/components/Header";
import Scoreboard from "@/components/Scoreboard";
import AdminImport from "@/components/admin/AdminImport";
import type { ApprovedUser } from "@/types";

interface AuthedAppProps {
  user: ApprovedUser;
}

// The admin pages deliberately live outside Scoreboard so they never load
// scores, years or game data.
const AdminShell = ({
  user,
  children,
}: AuthedAppProps & { children: ReactNode }) => (
  <AppShell header={{ height: 60 }} padding="md">
    <Header user={user} />
    <AppShell.Main>
      <BackButton label="Back to scores" />
      {children}
    </AppShell.Main>
  </AppShell>
);

function AuthedApp({ user }: AuthedAppProps) {
  const isAdmin = user.role === "admin";

  return (
    <Switch>
      <Route path="/admin">
        {isAdmin ? (
          <AdminShell user={user}>
            <AdminPage meId={user.discordId} />
          </AdminShell>
        ) : (
          <Redirect to="/" />
        )}
      </Route>
      <Route path="/admin/import">
        {isAdmin ? (
          <AdminShell user={user}>
            <AdminImport />
          </AdminShell>
        ) : (
          <Redirect to="/" />
        )}
      </Route>
      <Route>
        <Scoreboard user={user} />
      </Route>
    </Switch>
  );
}

export default AuthedApp;
