import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// Note: StrictMode removed because Flowgram's DI container
// doesn't support React's double-mounting in dev mode
createRoot(document.getElementById("root")!).render(<App />);
