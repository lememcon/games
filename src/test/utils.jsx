import { render } from "@testing-library/react";

import { MantineProvider } from "@mantine/core";

// Mantine components read from a theme context (useMantineTheme), so every
// component under test must be wrapped in a provider.
export const renderWithMantine = (ui, options) =>
  render(<MantineProvider>{ui}</MantineProvider>, options);
