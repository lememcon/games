import { useState } from "react";

const read = <T>(key: string, initialValue: T): T => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : initialValue;
  } catch (error) {
    console.error(error);
    return initialValue;
  }
};

const useLocalState = <T>(
  key: string,
  initialValue: T,
): [T, (value: T) => void] => {
  const [state, setState] = useState(() => ({
    key,
    value: read(key, initialValue),
  }));

  // Re-read when the key changes (e.g. a year that resolves after first render).
  let storedValue = state.value;
  if (state.key !== key) {
    storedValue = read(key, initialValue);
    setState({ key, value: storedValue });
  }

  const setValue = (value: T) => {
    try {
      setState({ key, value });
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.log(error);
    }
  };

  return [storedValue, setValue];
};

export default useLocalState;
