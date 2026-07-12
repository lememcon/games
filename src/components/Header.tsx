import { AppShell, Group, Select } from "@mantine/core";

import bgg from "@/assets/bgg.svg";
import logo from "@/assets/logo.png";

interface HeaderProps {
  year: string;
  years: string[];
  onYearChange: (value: string | null) => void;
}

const Header = ({ year, years, onYearChange }: HeaderProps) => (
  <AppShell.Header
    style={{ background: "#16302a", borderBottom: "1px solid #274b42" }}
  >
    <Group h="100%" px="md">
      <img src={logo} height="48px" />
      <h3 style={{ margin: 0, color: "#f1ead8" }}>LememCon</h3>
      <Select id="year" value={year} data={years} onChange={onYearChange} />
      <img src={bgg} height="24px" className="mantine-visible-from-sm" />
    </Group>
  </AppShell.Header>
);

export default Header;
