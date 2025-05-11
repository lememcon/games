import { MantineProvider } from "@mantine/core";
import { useState } from "react";

import logo from "./assets/logo.png";

import "@mantine/core/styles.css";

function App() {
  const [count, setCount] = useState(0);

  return (
    <MantineProvider>
      <div>
        <a href="https://games.lememcon.com" target="_blank">
          <img src={logo} className="logo" alt="LememCon logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.jsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </MantineProvider>
  );
}

export default App;
