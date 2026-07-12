import { AppShell, Group, Select } from "@mantine/core";

import bgg from "@/assets/bgg.svg";
import logo from "@/assets/logo.png";

const Header = ({ year, years, onYearChange }) => (
  <AppShell.Header>
    <Group h="100%" px="md">
      <img src={logo} height="48px" />
      <h3>LememCon</h3>
      <Select id="year" value={year} data={years} onChange={onYearChange} />
      <img src={bgg} height="24px" className="mantine-visible-from-sm" />
    </Group>
  </AppShell.Header>
);

export default Header;
