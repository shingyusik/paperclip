import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { approvals, issues } from "@paperclipai/db";
import type {
  GovernedChangeProposalScope,
  GovernedChangeProposalTarget,
  GovernedChangeType,
} from "@paperclipai/shared";
import { notFound, unprocessable } from "../errors.js";
import { governedChangeProposalConstants } from "./governed-change-proposals.js";

export type GovernedChangeApprovalGateInput = {
  issueId: string;
  changeType: GovernedChangeType;
  target?: GovernedChangeProposalTarget;
  scope?: GovernedChangeProposalScope;
};

function sortedJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(sortedJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${sortedJson(entryValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function matchesSuppliedFields(
  payload: Record<string, unknown>,
  input: GovernedChangeApprovalGateInput,
) {
  if (payload.changeType !== input.changeType) {
    return false;
  }
  if (input.scope !== undefined && payload.scope !== input.scope) {
    return false;
  }
  if (input.target !== undefined && sortedJson(payload.target ?? {}) !== sortedJson(input.target)) {
    return false;
  }
  return true;
}

export function governedChangeApprovalGateService(db: Db) {
  async function assertApproved(companyId: string, input: GovernedChangeApprovalGateInput) {
    const issue = await db
      .select()
      .from(issues)
      .where(and(eq(issues.companyId, companyId), eq(issues.id, input.issueId)))
      .then((rows) => rows[0] ?? null);

    if (!issue) {
      throw notFound("Governed change proposal issue not found");
    }
    if (issue.originKind !== governedChangeProposalConstants.originKind) {
      throw unprocessable("Issue is not a governed change proposal");
    }

    const linkedApprovals = await db
      .select()
      .from(approvals)
      .where(and(
        eq(approvals.companyId, companyId),
        eq(approvals.type, governedChangeProposalConstants.approvalType),
        sql`${approvals.payload}->>'issueId' = ${input.issueId}`,
      ));

    if (linkedApprovals.length === 0) {
      throw unprocessable("Governed change proposal has no linked approval");
    }

    const approvedMatchingApproval = linkedApprovals.find((approval) => {
      if (approval.status !== "approved") {
        return false;
      }
      return matchesSuppliedFields(approval.payload, input);
    });

    if (!approvedMatchingApproval) {
      throw unprocessable("Governed change proposal is not approved for this change");
    }

    return { issue, approval: approvedMatchingApproval };
  }

  return {
    assertApproved,
    assertGovernedChangeApproved: assertApproved,
  };
}
