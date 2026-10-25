import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./features/galgame/GalgameApp";
import { isTauri } from '@tauri-apps/api/core';
import "./index.css";
import { initLogging } from './lib/logging';

const disposeLogging = isTauri() ? initLogging() : () => {};
if (import.meta.hot) import.meta.hot.dispose(disposeLogging);
const Router = import.meta.env.MODE === "pages" ? HashRouter : BrowserRouter;

/** Render the shared studio immediately. Native services are mounted only by
 * DesktopSync; a browser preview must not call the Tauri/SQLite bridge. */
function bootstrap(): void {
  document.documentElement.className = 'galgame-theme';
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </Router>
    </React.StrictMode>,
  );
}

bootstrap();
