import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./features/galgame/GalgameApp";
import { isTauri } from '@tauri-apps/api/core';
import "./index.css";
import { initLogging } from './lib/logging';

const disposeLogging = isTauri() ? initLogging() : () => {};
if (import.meta.hot) import.meta.hot.dispose(disposeLogging);

/** Render the shared studio immediately. Native services are mounted only by
 * DesktopSync; a browser preview must not call the Tauri/SQLite bridge. */
function bootstrap(): void {
  document.documentElement.className = 'galgame-theme';
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
}

bootstrap();
