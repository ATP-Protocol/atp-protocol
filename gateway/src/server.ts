/**
 * ATP Gateway Express HTTP Server
 *
 * Exposes the ATPGateway via REST endpoints for governed execution,
 * contract registration, credential management, and audit logging.
 */

import express, { Request, Response, NextFunction } from "express";
import { ATPGateway } from "./gateway";
import type { ExecutionRequest, ATPContract, StoredCredential } from "./types";

// Initialize Express app
const app = express();

// Middleware
app.use(express.json());

// Initialize gateway with default config
const gateway = new ATPGateway({
  gateway_id: "gw_http_default",
  port: parseInt(process.env.PORT || "3100", 10),
  conformance_level: "verified",
  dual_integration: false,
});

// ---------------------------------------------------------------------------
// Error Handling Middleware
// ---------------------------------------------------------------------------

interface AppError extends Error {
  status?: number;
}

const errorHandler = (err: AppError, req: Request, res: Response, next: NextFunction) => {
  const status = err.status || 500;
  const message = err.message || "Internal server error";

  console.error(`[ERROR] ${status}: ${message}`, err);

  res.status(status).json({
    error: message,
    status,
    timestamp: new Date().toISOString(),
  });
};

// ---------------------------------------------------------------------------
// REST Endpoints
// ---------------------------------------------------------------------------

/**
 * POST /execute
 * Execute a governed action through the ATP pipeline
 */
app.post("/execute", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const request = req.body as ExecutionRequest;

    // Validate request
    if (!request.contract_id || !request.action || !request.params || !request.wallet) {
      return res.status(400).json({
        error: "Missing required fields: contract_id, action, params, wallet",
      });
    }

    const result = await gateway.execute(request);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /contracts
 * Register a new contract with the gateway
 */
app.post("/contracts", (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, contract } = req.body as { id: string; contract: unknown };

    if (!id || !contract) {
      return res.status(400).json({
        error: "Missing required fields: id, contract",
      });
    }

    gateway.contracts.register(id, contract as ATPContract);

    res.status(201).json({
      contract_id: id,
      registered: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /contracts/:id
 * Resolve and retrieve a contract by ID
 */
app.get("/contracts/:id", (req: Request, res: Response, next: NextFunction) => {
  try {
    const contract = gateway.contracts.get(req.params.id);

    if (!contract) {
      return res.status(404).json({
        error: `Contract "${req.params.id}" not found`,
      });
    }

    res.status(200).json(contract);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /credentials
 * Register credentials with the gateway
 */
app.post("/credentials", (req: Request, res: Response, next: NextFunction) => {
  try {
    const { key, credential } = req.body as { key: string; credential: unknown };

    if (!key || !credential) {
      return res.status(400).json({
        error: "Missing required fields: key, credential",
      });
    }

    gateway.credentials.store(key, credential as StoredCredential);

    res.status(201).json({
      credential_key: key,
      registered: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /audit-log
 * Retrieve the gateway's audit log (evidence records)
 */
app.get("/audit-log", (req: Request, res: Response, next: NextFunction) => {
  try {
    const auditLog = gateway.evidence.list();

    res.status(200).json({
      total: auditLog.length,
      entries: auditLog,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get("/health", (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({
      status: "ok",
      version: "0.1.0",
      gateway_id: gateway.config.gateway_id,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /metadata
 * Get gateway metadata and conformance declaration
 */
app.get("/metadata", (req: Request, res: Response, next: NextFunction) => {
  try {
    const metadata = gateway.getMetadata();
    res.status(200).json(metadata);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// 404 Handler
// ---------------------------------------------------------------------------

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "Not found",
    path: req.path,
    method: req.method,
  });
});

// ---------------------------------------------------------------------------
// Apply error handler middleware
// ---------------------------------------------------------------------------

app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || "3100", 10);

const server = app.listen(PORT, () => {
  console.log(`ATP Gateway HTTP Server listening on port ${PORT}`);
  console.log(`Gateway ID: ${gateway.config.gateway_id}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

export { app, gateway };
