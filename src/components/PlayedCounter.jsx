import { Button } from "@mantine/core";

const PlayedCounter = ({ count, onInc, onDec }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: "0.3em",
      alignItems: "center",
    }}
  >
    <p style={{ margin: 0, padding: 0 }}>{count}</p>
    <div style={{ display: "flex", flexDirection: "row", gap: "1em" }}>
      <Button size="compact-xs" disabled={count <= 0} onClick={onDec}>
        -
      </Button>
      <Button size="compact-xs" onClick={onInc}>
        +
      </Button>
    </div>
  </div>
);

export default PlayedCounter;
