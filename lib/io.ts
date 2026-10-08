import type { Server } from "socket.io";

declare global {
  // eslint-disable-next-line no-var
  var io: Server | undefined;
}

/**
 * Returns the Socket.io server instance if one is running (i.e. the app was
 * started via `node server.js`), or undefined otherwise — e.g. in a serverless
 * deployment where there's no persistent process to hold a socket server.
 * Every caller treats undefined as "skip the broadcast, REST still works."
 */
export function getIO(): Server | undefined {
  return global.io;
}
