import { useState } from "react";
import { Link } from "wouter";

import { AppShell, Avatar, Group, Menu, Select, Text } from "@mantine/core";

import bgg from "@/assets/bgg.svg";
import logo from "@/assets/logo.png";
import { signOut } from "@/lib/auth";
import type { ApprovedUser } from "@/types";

interface HeaderProps {
  // The year picker is only shown when years are given (not on admin pages).
  year?: string;
  years?: string[];
  onYearChange?: (value: string | null) => void;
  user?: ApprovedUser;
}

const Header = ({ year, years, onYearChange, user }: HeaderProps) => {
  const [signOutFailed, setSignOutFailed] = useState(false);

  const handleSignOut = async () => {
    setSignOutFailed(false);
    try {
      await signOut();
      window.location.reload();
    } catch {
      setSignOutFailed(true);
    }
  };

  return (
    <AppShell.Header
      style={{ background: "#ffffff", borderBottom: "1px solid #ece4d5" }}
    >
      <Group h="100%" px="md">
        <Link
          href="/"
          aria-label="LememCon home"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--mantine-spacing-xs)",
            textDecoration: "none",
          }}
        >
          <img src={logo} width={35} height={40} alt="" className="tray-logo" />
          <h3 style={{ margin: 0, color: "#2b2723" }}>LememCon</h3>
        </Link>
        {years && (
          <Select
            id="year"
            value={year}
            data={years}
            onChange={onYearChange}
            w={92}
            classNames={{ input: "tray-year" }}
          />
        )}
        <img src={bgg} height="24px" className="mantine-visible-from-sm" />
        {user && (
          <Menu position="bottom-end">
            <Menu.Target>
              <Avatar
                src={user.image}
                name={user.name}
                ml="auto"
                style={{ cursor: "pointer" }}
                role="button"
                tabIndex={0}
                aria-label="Account menu"
              />
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{user.name}</Menu.Label>
              <Menu.Item component={Link} href="/profile">
                My profile
              </Menu.Item>
              {user.role === "admin" && (
                <Menu.Item component={Link} href="/admin">
                  Admin
                </Menu.Item>
              )}
              <Menu.Item onClick={handleSignOut} closeMenuOnClick={false}>
                Sign out
              </Menu.Item>
              {signOutFailed && (
                <Text c="red" size="xs" px="sm" role="alert">
                  Couldn&apos;t sign out. Try again.
                </Text>
              )}
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
    </AppShell.Header>
  );
};

export default Header;
