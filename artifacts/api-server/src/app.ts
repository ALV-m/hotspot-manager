import express, { type Express } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve built portal static files
const portalDist = path.resolve(__dirname, "../../hotspot-portal/dist/public");
app.use(express.static(portalDist));

app.use("/api", router);

app.get("/ping", (_req, res) => {
  res.send("OK");
});

// SPA fallback — serve index.html for any non-API route
app.get("*", (_req, res) => {
  res.sendFile(path.resolve(portalDist, "index.html"));
});

export default app;
