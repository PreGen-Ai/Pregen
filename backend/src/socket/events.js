import { hydrateSocketAuth } from "./auth.js";
import { deriveRoomsFromAuth } from "./rooms.js";

function leaveDerivedRooms(socket) {
  for (const room of socket.data.joinedRooms || []) {
    socket.leave(room);
  }
  socket.data.joinedRooms = [];
}

function joinDerivedRooms(socket) {
  const rooms = deriveRoomsFromAuth(socket.data.auth || {});
  for (const room of rooms) {
    socket.join(room);
  }
  socket.data.joinedRooms = rooms;
  return rooms;
}

async function refreshSocketRooms(socket) {
  leaveDerivedRooms(socket);
  await hydrateSocketAuth(socket);
  return joinDerivedRooms(socket);
}

export function registerSocketHandlers(io) {
  io.on("connection", async (socket) => {
    const authContext = socket.data.auth || {};
    const joinedRooms = joinDerivedRooms(socket);

    console.log(
      `[socket] connected user=${authContext.userId} role=${authContext.role} rooms=${joinedRooms.length}`,
    );

    socket.emit("socket:ready", {
      connectedAt: new Date().toISOString(),
      userId: authContext.userId || null,
      role: authContext.role || null,
      rooms: joinedRooms,
      transport: socket.conn?.transport?.name || null,
    });

    socket.on("rooms:refresh", async (ack) => {
      try {
        const rooms = await refreshSocketRooms(socket);
        const payload = {
          ok: true,
          refreshedAt: new Date().toISOString(),
          rooms,
        };

        if (typeof ack === "function") ack(payload);
        socket.emit("rooms:refreshed", payload);
      } catch (error) {
        const payload = {
          ok: false,
          message: error?.message || "Unable to refresh realtime subscriptions",
        };

        if (typeof ack === "function") ack(payload);
        socket.emit("socket:error", payload);
      }
    });

    socket.on("notification:ack", (payload = {}, ack) => {
      if (typeof ack === "function") {
        ack({
          ok: true,
          notificationId: payload.notificationId || null,
          acknowledgedAt: new Date().toISOString(),
        });
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(
        `[socket] disconnected user=${authContext.userId} reason=${reason}`,
      );
    });
  });
}
