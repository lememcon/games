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
    style={{ background: "#ffffff", borderBottom: "1px solid #ece4d5" }}
  >
    <Group h="100%" px="md">
      <img src={logo} height="40px" alt="LememCon logo" />
      <h3 style={{ margin: 0, color: "#2b2723" }}>LememCon</h3>
      <Select
        id="year"
        value={year}
        data={years}
        onChange={onYearChange}
        w={92}
        classNames={{ input: "tray-year" }}
      />
      <img src={bgg} height="24px" className="mantine-visible-from-sm" />
    </Group>
  </AppShell.Header>
);

export default Header;
