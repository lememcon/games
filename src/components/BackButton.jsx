import { CircleArrowLeft } from "lucide-react";
import { Link } from "wouter";

import { Button } from "@mantine/core";

const BackButton = ({ style }) => (
  <Link href="/">
    <Button style={style}>
      <CircleArrowLeft color="white" size="16" />
    </Button>
  </Link>
);

export default BackButton;
