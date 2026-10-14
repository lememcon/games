import { useEffect, useState, type CSSProperties } from "react";

import { pickFloaters } from "@/lib/floaters";
import images from "@/lib/images";

const COUNT = 10;

/** Decorative drifting game covers behind the sign-in card. */
const FloatingCovers = () => {
  const [floaters] = useState(() => pickFloaters(Object.keys(images), COUNT));
  const [mounted, setMounted] = useState(false);
  // Mount after the first paint so the card is never held up by the covers.
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  if (!mounted) return null;

  return (
    <div className="floaters" aria-hidden="true">
      {floaters.map((f) => (
        <img
          key={f.id}
          src={images[f.id]}
          alt=""
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          style={
            {
              "--left": `${f.left}%`,
              "--top": `${f.top}%`,
              "--size": `${f.size}px`,
              "--dur": `${f.duration}s`,
              "--delay": `${f.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
};

export default FloatingCovers;
