import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tutorRouter from "./tutor";
import sourceChecksRouter from "./source-checks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sourceChecksRouter);
router.use(tutorRouter);

export default router;
