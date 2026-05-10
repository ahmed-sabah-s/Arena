import { createExpressMiddleware } from "@trpc/server/adapters/express";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { closePool, pool } from "./db";
import { RefreshTokenRepository } from "./domain/auth/auth.repository";
import { createContext } from "./presentation/context";
import { appRouter } from "./presentation/routers/_app";
import { config } from "./shared/config";
import { logEnabledServices } from "./shared/config/optional-services";
import { startScheduler, stopScheduler } from "./domain/scheduler";

const app = express();

// Trust the first proxy hop (nginx, load balancer) so req.ip reflects the real client IP.
// Set to the number of hops in your infrastructure; '1' is correct for a single reverse proxy.
app.set('trust proxy', 1);

// Security & parsing middleware
app.use(helmet());
app.use(
  cors({
    origin: config.FRONTEND_URL,
    credentials: true,
  }),
);
app.use(express.json());

// Only tRPC endpoint - no REST APIs
app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

// Global error handler — never expose internal error details in production
app.use(
  (
    err: Error & { statusCode?: number; code?: string },
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Error:", err);
    const isProd = config.NODE_ENV === "production";
    const statusCode = err.statusCode ?? 500;
    const message =
      isProd && statusCode >= 500
        ? "Internal server error"
        : err.message || "Internal server error";
    res.status(statusCode).json({
      error: { message, code: err.code },
    });
  },
);

// Start server
const PORT = config.PORT || 3000;

async function startServer() {
  try {
    // Test database connection
    await pool.query("SELECT NOW()");
    console.log("✅ Database connected");

    // Log which optional services are enabled
    logEnabledServices();

    app.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log(`✅ tRPC endpoint: http://localhost:${PORT}/trpc`);
    });

    // Clean up expired/revoked refresh tokens once every 24h
    const refreshTokenRepo = new RefreshTokenRepository();
    setInterval(
      () => refreshTokenRepo.deleteExpired().catch(console.error),
      24 * 60 * 60 * 1000
    );

    // Phase 8 in-process cron scheduler. Reads SCHEDULER_ENABLED so tests
    // can opt out. The startup logs each registered job and its expression.
    const scheduler = await startScheduler();
    if (scheduler.started) {
      console.log(`✅ Scheduler started with ${scheduler.jobs} job(s)`);
    } else {
      console.log("ℹ️  Scheduler disabled (SCHEDULER_ENABLED=false)");
    }
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
const shutdown = async () => {
  console.log("\n🛑 Shutting down gracefully...");
  stopScheduler();
  await closePool();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startServer();
