import { ArrowLeft } from "lucide-react";
import type { CSSProperties } from "react";
import { Link } from "wouter";

// A tray-style pill that reads as a paper control on the light surface, matching
// the podium's play steppers. Names its destination rather than leaning on a
// bare icon.
const BackButton = ({
  style,
  label = "Back to games",
  href = "/",
}: {
  style?: CSSProperties;
  label?: string;
  href?: string;
}) => (
  <Link href={href} className="tray-back" style={style}>
    <ArrowLeft size={16} aria-hidden />
    {label}
  </Link>
);

export default BackButton;
