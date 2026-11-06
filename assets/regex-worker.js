import { computeRegex } from "./core.js";

self.onmessage = (event) => {
  const { id, pattern, flags, text, replaceText } = event.data;
  try {
    const result = computeRegex(pattern, flags, text, replaceText);
    self.postMessage({ id, status: "success", ...result });
  } catch (error) {
    self.postMessage({ id, status: "error", message: error.message });
  }
};
