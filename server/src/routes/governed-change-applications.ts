import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { acceptGovernedChangeApplicationSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { governedChangeApplicationService } from "../services/governed-change-application.js";

export function governedChangeApplicationRoutes(db: Db) {
  const router = Router();
  const svc = governedChangeApplicationService(db);

  router.post(
    "/companies/:companyId/governed-change-applications",
    validate(acceptGovernedChangeApplicationSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const actor = getActorInfo(req);

      const result = await svc.acceptApprovedApplication(companyId, req.body, actor);
      res.status(200).json(result);
    },
  );

  return router;
}
