CREATE TABLE "company_document_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"folder_id" uuid,
	"title" text,
	"position" integer DEFAULT 0 NOT NULL,
	"source_project_id" uuid,
	"source_issue_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_milestone_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"target_date" date,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_document_folders" ADD CONSTRAINT "company_document_folders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_document_folders" ADD CONSTRAINT "company_document_folders_parent_id_company_document_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."company_document_folders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_documents" ADD CONSTRAINT "company_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_documents" ADD CONSTRAINT "company_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_documents" ADD CONSTRAINT "company_documents_folder_id_company_document_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."company_document_folders"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_documents" ADD CONSTRAINT "company_documents_source_project_id_projects_id_fk" FOREIGN KEY ("source_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_documents" ADD CONSTRAINT "company_documents_source_issue_id_issues_id_fk" FOREIGN KEY ("source_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_milestone_issues" ADD CONSTRAINT "project_milestone_issues_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_milestone_issues" ADD CONSTRAINT "project_milestone_issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_milestone_issues" ADD CONSTRAINT "project_milestone_issues_milestone_id_project_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_milestone_issues" ADD CONSTRAINT "project_milestone_issues_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "company_document_folders_company_parent_idx" ON "company_document_folders" USING btree ("company_id","parent_id");
--> statement-breakpoint
CREATE INDEX "company_document_folders_company_parent_position_idx" ON "company_document_folders" USING btree ("company_id","parent_id","position");
--> statement-breakpoint
CREATE UNIQUE INDEX "company_document_folders_sibling_name_uq" ON "company_document_folders" USING btree ("company_id","parent_id","name");
--> statement-breakpoint
CREATE INDEX "company_documents_company_folder_idx" ON "company_documents" USING btree ("company_id","folder_id");
--> statement-breakpoint
CREATE INDEX "company_documents_company_folder_position_idx" ON "company_documents" USING btree ("company_id","folder_id","position");
--> statement-breakpoint
CREATE INDEX "company_documents_source_project_idx" ON "company_documents" USING btree ("company_id","source_project_id");
--> statement-breakpoint
CREATE INDEX "company_documents_source_issue_idx" ON "company_documents" USING btree ("company_id","source_issue_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "company_documents_document_uq" ON "company_documents" USING btree ("document_id");
--> statement-breakpoint
CREATE INDEX "project_milestone_issues_milestone_position_idx" ON "project_milestone_issues" USING btree ("milestone_id","position");
--> statement-breakpoint
CREATE UNIQUE INDEX "project_milestone_issues_project_issue_uq" ON "project_milestone_issues" USING btree ("project_id","issue_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "project_milestone_issues_milestone_issue_uq" ON "project_milestone_issues" USING btree ("milestone_id","issue_id");
--> statement-breakpoint
CREATE INDEX "project_milestones_company_project_idx" ON "project_milestones" USING btree ("company_id","project_id");
--> statement-breakpoint
CREATE INDEX "project_milestones_project_position_idx" ON "project_milestones" USING btree ("project_id","position");
--> statement-breakpoint
CREATE INDEX "project_milestones_project_status_idx" ON "project_milestones" USING btree ("project_id","status");
