import { CircleArrowLeft } from "lucide-react";
import type { CSSProperties } from "react";
import { Link } from "wouter";

import { Button } from "@mantine/core";

const BackButton = ({ style }: { style?: CSSProperties }) => (
  <Link href="/">
    <Button style={style}>
      <CircleArrowLeft color="white" size="16" />
    </Button>
  </Link>
);

export default BackButton;
