CREATE TABLE "agent_reflections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"issue_id" uuid,
	"run_id" uuid,
	"summary" text NOT NULL,
	"learned" text NOT NULL,
	"proposed_memory_updates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposed_skill_updates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"shared_change_proposals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'recorded' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_reflections" ADD CONSTRAINT "agent_reflections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_reflections" ADD CONSTRAINT "agent_reflections_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_reflections" ADD CONSTRAINT "agent_reflections_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_reflections" ADD CONSTRAINT "agent_reflections_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_reflections_company_agent_status_idx" ON "agent_reflections" USING btree ("company_id","agent_id","status");--> statement-breakpoint
CREATE INDEX "agent_reflections_company_agent_updated_idx" ON "agent_reflections" USING btree ("company_id","agent_id","updated_at");--> statement-breakpoint
CREATE INDEX "agent_reflections_company_issue_idx" ON "agent_reflections" USING btree ("company_id","issue_id");--> statement-breakpoint
CREATE INDEX "agent_reflections_company_run_idx" ON "agent_reflections" USING btree ("company_id","run_id");
