import { render, type RenderOptions } from "@testing-library/react";
import type { ReactNode } from "react";

import { MantineProvider } from "@mantine/core";

// Mantine components read from a theme context (useMantineTheme), so every
// component under test must be wrapped in a provider.
export const renderWithMantine = (ui: ReactNode, options?: RenderOptions) =>
  render(<MantineProvider>{ui}</MantineProvider>, options);
