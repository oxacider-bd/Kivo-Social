/**
 * KIVO Realtime Service
 * ─────────────────────────────────────────────────────────────────
 * Port 3003 : socket.io endpoint (browser connects via gateway:
 *             io("/?XTransformPort=3003")).
 *             Each socket authenticates by forwarding the session cookie
 *             to the Next.js API — spoofing a user id is not possible.
 * Port 3004 : internal HTTP emitter used by Next.js API routes
 *             (POST /internal/emit, guarded by x-internal-secret).
 *
 * Events → client: "notification" (NotificationDTO)
 */
import { createServer } from "http";
import { Server } from "socket.io";

const PORT = 3003;
const INTERNAL_PORT = 3004;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "kivo-internal-dev-secret";
const NEXT_APP_URL = process.env.NEXT_APP_URL ?? "http://127.0.0.1:3000";

const httpServer = createServer();
const io = new Server(httpServer, {
  // DO NOT change the path — the gateway forwards "/" to this port.
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

interface SessionPayload {
  ok: boolean;
  data: { id: string; profile: { username: string } } | null;
}

async function validateSession(cookieHeader: string | undefined): Promise<string | null> {
  if (!cookieHeader) return null;
  try {
    const res = await fetch(`${NEXT_APP_URL}/api/auth/session`, {
      headers: { cookie: cookieHeader },
      signal: AbortSignal.timeout(4000),
    });
    const json = (await res.json()) as SessionPayload;
    if (!json.ok || !json.data) return null;
    return json.data.id;
  } catch {
    return null;
  }
}

io.on("connection", async (socket) => {
  const cookieHeader = socket.request.headers.cookie;
  const userId = await validateSession(cookieHeader);
  if (!userId) {
    socket.emit("auth-error", { message: "Session expired. Sign in again." });
    socket.disconnect(true);
    return;
  }

  socket.join(`user:${userId}`);
  socket.emit("ready", { userId });

  socket.on("ping-rt", (cb) => {
    if (typeof cb === "function") cb({ t: Date.now() });
  });

  socket.on("disconnect", () => {
    // room cleanup is automatic
  });

  socket.on("error", (err) => {
    console.error(`[rt] socket error (${socket.id}):`, err);
  });
});

// ─── Internal emitter ────────────────────────────────────────────────────────

const internalServer = createServer((req, res) => {
  if (req.method !== "POST" || !req.url?.startsWith("/internal/emit")) {
    res.writeHead(404).end();
    return;
  }
  if (req.headers["x-internal-secret"] !== INTERNAL_SECRET) {
    res.writeHead(403).end(JSON.stringify({ ok: false }));
    return;
  }
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) req.destroy();
  });
  req.on("end", () => {
    try {
      const { userIds, event, payload } = JSON.parse(body);
      if (!Array.isArray(userIds) || typeof event !== "string") {
        res.writeHead(400).end(JSON.stringify({ ok: false }));
        return;
      }
      let delivered = 0;
      for (const userId of userIds) {
        io.to(`user:${userId}`).emit(event, payload);
        delivered += 1;
      }
      res.writeHead(200).end(JSON.stringify({ ok: true, delivered }));
    } catch {
      res.writeHead(400).end(JSON.stringify({ ok: false }));
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`[rt] KIVO realtime service listening on :${PORT}`);
});
internalServer.listen(INTERNAL_PORT, "127.0.0.1", () => {
  console.log(`[rt] internal emitter listening on :${INTERNAL_PORT}`);
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
