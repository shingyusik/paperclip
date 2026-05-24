import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { createGovernedChangeProposalSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { governedChangeProposalService } from "../services/governed-change-proposals.js";

export function governedChangeProposalRoutes(db: Db) {
  const router = Router();
  const svc = governedChangeProposalService(db);

  router.post(
    "/companies/:companyId/governed-change-proposals",
    validate(createGovernedChangeProposalSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const actor = getActorInfo(req);

      const result = await svc.create(companyId, req.body, actor);
      res.status(result.created ? 201 : 200).json(result);
    },
  );

  return router;
}
