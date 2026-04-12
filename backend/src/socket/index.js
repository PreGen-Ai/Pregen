import { Server } from "socket.io";

import { configureSocketAdapter } from "./adapter.js";
import { authenticateSocket } from "./auth.js";
import { registerSocketHandlers } from "./events.js";

let ioInstance = null;

export function initSocketServer(httpServer, { corsOptions } = {}) {
  if (ioInstance) return ioInstance;

  ioInstance = new Server(httpServer, {
    cors: corsOptions,
    transports: ["websocket", "polling"],
    allowUpgrades: true,
    serveClient: false,
    pingInterval: 25000,
    pingTimeout: 30000,
    connectTimeout: 20000,
  });

  ioInstance.use(authenticateSocket);

  configureSocketAdapter(ioInstance).catch((error) => {
    console.error("[socket] adapter init failed:", error?.message || error);
  });

  registerSocketHandlers(ioInstance);
  return ioInstance;
}

export function getIo() {
  return ioInstance;
}
