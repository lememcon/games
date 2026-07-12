import { ArrowLeft } from "lucide-react";
import type { CSSProperties } from "react";
import { Link } from "wouter";

// A tray-style pill that reads as a paper control on the light surface, matching
// the podium's play steppers. Names its destination rather than leaning on a
// bare icon.
const BackButton = ({ style }: { style?: CSSProperties }) => (
  <Link href="/" className="tray-back" style={style}>
    <ArrowLeft size={16} aria-hidden />
    Back to games
  </Link>
);

export default BackButton;
