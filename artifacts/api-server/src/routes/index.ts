import { Router, type IRouter } from "express";
import healthRouter from "./health";
import packagesRouter from "./packages";
import sessionsRouter from "./sessions";
import paymentsRouter from "./payments";
import visitorsRouter from "./visitors";
import routerRouter from "./router";
import configRouter from "./config";

const router: IRouter = Router();

router.use(healthRouter);
router.use(packagesRouter);
router.use(sessionsRouter);
router.use(paymentsRouter);
router.use(visitorsRouter);
router.use(routerRouter);
router.use(configRouter);

export default router;
