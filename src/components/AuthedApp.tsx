import type { ReactNode } from "react";
import { Redirect, Route, Switch } from "wouter";

import { AppShell } from "@mantine/core";

import AdminPage from "@/components/AdminPage";
import BackButton from "@/components/BackButton";
import Header from "@/components/Header";
import PageBackdrop from "@/components/PageBackdrop";
import ProfilePage from "@/components/ProfilePage";
import PublicProfile from "@/components/PublicProfile";
import Scoreboard from "@/components/Scoreboard";
import YearRecap from "@/components/YearRecap";
import AdminImport from "@/components/admin/AdminImport";
import useImportFeed from "@/hooks/useImportFeed";
import useLocalState from "@/hooks/useLocalState";
import type { ApprovedUser } from "@/types";

interface AuthedAppProps {
  user: ApprovedUser;
  // Refreshes the account after the display name changes.
  onUserChanged?: () => void;
}

// The admin and profile pages deliberately live outside Scoreboard so they
// load no scoreboard data; only the shared backdrop fetches the years and one
// year's scores for the floating covers.
const AdminShell = ({
  user,
  children,
}: { user: ApprovedUser } & { children: ReactNode }) => (
  <AppShell header={{ height: 60 }} padding="md">
    <Header user={user} />
    <AppShell.Main>
      <BackButton label="Back to scores" />
      {children}
    </AppShell.Main>
  </AppShell>
);

function AuthedApp({ user, onUserChanged = () => {} }: AuthedAppProps) {
  const isAdmin = user.role === "admin";
  const [showBackdrop, setShowBackdrop] = useLocalState("show_backdrop", true);
  useImportFeed();

  return (
    <>
      {showBackdrop && <PageBackdrop />}
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
        <Route path="/profile">
          <AdminShell user={user}>
            <ProfilePage
              user={user}
              onSaved={onUserChanged}
              showBackdrop={showBackdrop}
              onShowBackdropChange={setShowBackdrop}
            />
          </AdminShell>
        </Route>
        <Route path="/players/:discordId/recap/:year">
          {(params) => (
            <AdminShell user={user}>
              <YearRecap discordId={params.discordId} year={params.year} />
            </AdminShell>
          )}
        </Route>
        <Route path="/players/:discordId">
          {(params) => (
            <AdminShell user={user}>
              <PublicProfile discordId={params.discordId} />
            </AdminShell>
          )}
        </Route>
        <Route>
          <Scoreboard user={user} />
        </Route>
      </Switch>
    </>
  );
}

export default AuthedApp;
