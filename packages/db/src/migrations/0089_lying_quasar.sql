CREATE TABLE "meeting_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"message_type" text NOT NULL,
	"body" text NOT NULL,
	"format" text DEFAULT 'markdown' NOT NULL,
	"author_user_id" text,
	"author_agent_id" uuid,
	"author_participant_id" uuid,
	"source_run_id" uuid,
	"source_summary_id" uuid,
	"reply_to_message_id" uuid,
	"metadata" jsonb,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"participant_type" text NOT NULL,
	"user_id" text,
	"agent_id" uuid,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"invited_by_user_id" text,
	"invited_by_agent_id" uuid,
	"last_seen_message_id" uuid,
	"last_invoked_run_id" uuid,
	"joined_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid,
	"issue_id" uuid,
	"project_document_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'open' NOT NULL,
	"origin_kind" text DEFAULT 'user_created' NOT NULL,
	"origin_id" text,
	"created_by_user_id" text,
	"created_by_agent_id" uuid,
	"last_message_id" uuid,
	"last_message_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"summary_kind" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"decisions" jsonb,
	"action_items" jsonb,
	"open_questions" jsonb,
	"source_message_start_id" uuid,
	"source_message_end_id" uuid,
	"generated_by_user_id" text,
	"generated_by_agent_id" uuid,
	"source_run_id" uuid,
	"linked_issue_id" uuid,
	"linked_project_document_id" uuid,
	"linked_agent_reflection_id" uuid,
	"proposal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meeting_messages" ADD CONSTRAINT "meeting_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_messages" ADD CONSTRAINT "meeting_messages_room_id_meeting_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."meeting_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_messages" ADD CONSTRAINT "meeting_messages_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_messages" ADD CONSTRAINT "meeting_messages_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_messages" ADD CONSTRAINT "meeting_messages_author_participant_id_meeting_participants_id_fk" FOREIGN KEY ("author_participant_id") REFERENCES "public"."meeting_participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_messages" ADD CONSTRAINT "meeting_messages_source_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_messages" ADD CONSTRAINT "meeting_messages_source_summary_id_meeting_summaries_id_fk" FOREIGN KEY ("source_summary_id") REFERENCES "public"."meeting_summaries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_messages" ADD CONSTRAINT "meeting_messages_reply_to_message_id_meeting_messages_id_fk" FOREIGN KEY ("reply_to_message_id") REFERENCES "public"."meeting_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_room_id_meeting_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."meeting_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_invited_by_agent_id_agents_id_fk" FOREIGN KEY ("invited_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_last_seen_message_id_meeting_messages_id_fk" FOREIGN KEY ("last_seen_message_id") REFERENCES "public"."meeting_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_last_invoked_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("last_invoked_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_project_document_id_project_documents_id_fk" FOREIGN KEY ("project_document_id") REFERENCES "public"."project_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_last_message_id_meeting_messages_id_fk" FOREIGN KEY ("last_message_id") REFERENCES "public"."meeting_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_summaries" ADD CONSTRAINT "meeting_summaries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_summaries" ADD CONSTRAINT "meeting_summaries_room_id_meeting_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."meeting_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_summaries" ADD CONSTRAINT "meeting_summaries_source_message_start_id_meeting_messages_id_fk" FOREIGN KEY ("source_message_start_id") REFERENCES "public"."meeting_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_summaries" ADD CONSTRAINT "meeting_summaries_source_message_end_id_meeting_messages_id_fk" FOREIGN KEY ("source_message_end_id") REFERENCES "public"."meeting_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_summaries" ADD CONSTRAINT "meeting_summaries_generated_by_user_id_user_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_summaries" ADD CONSTRAINT "meeting_summaries_generated_by_agent_id_agents_id_fk" FOREIGN KEY ("generated_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_summaries" ADD CONSTRAINT "meeting_summaries_source_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_summaries" ADD CONSTRAINT "meeting_summaries_linked_issue_id_issues_id_fk" FOREIGN KEY ("linked_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_summaries" ADD CONSTRAINT "meeting_summaries_linked_project_document_id_project_documents_id_fk" FOREIGN KEY ("linked_project_document_id") REFERENCES "public"."project_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_summaries" ADD CONSTRAINT "meeting_summaries_linked_agent_reflection_id_agent_reflections_id_fk" FOREIGN KEY ("linked_agent_reflection_id") REFERENCES "public"."agent_reflections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_messages_room_sequence_uq" ON "meeting_messages" USING btree ("room_id","sequence");--> statement-breakpoint
CREATE INDEX "meeting_messages_company_room_created_idx" ON "meeting_messages" USING btree ("company_id","room_id","created_at");--> statement-breakpoint
CREATE INDEX "meeting_messages_company_author_agent_created_idx" ON "meeting_messages" USING btree ("company_id","author_agent_id","created_at");--> statement-breakpoint
CREATE INDEX "meeting_participants_company_room_idx" ON "meeting_participants" USING btree ("company_id","room_id");--> statement-breakpoint
CREATE INDEX "meeting_participants_company_agent_status_idx" ON "meeting_participants" USING btree ("company_id","agent_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_participants_room_user_active_uq" ON "meeting_participants" USING btree ("room_id","participant_type","user_id") WHERE "meeting_participants"."participant_type" = 'user'
          and "meeting_participants"."status" in ('invited', 'active')
          and "meeting_participants"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_participants_room_agent_active_uq" ON "meeting_participants" USING btree ("room_id","participant_type","agent_id") WHERE "meeting_participants"."participant_type" = 'agent'
          and "meeting_participants"."status" in ('invited', 'active')
          and "meeting_participants"."agent_id" is not null;--> statement-breakpoint
CREATE INDEX "meeting_rooms_company_status_last_message_idx" ON "meeting_rooms" USING btree ("company_id","status","last_message_at");--> statement-breakpoint
CREATE INDEX "meeting_rooms_company_project_status_idx" ON "meeting_rooms" USING btree ("company_id","project_id","status");--> statement-breakpoint
CREATE INDEX "meeting_rooms_company_issue_status_idx" ON "meeting_rooms" USING btree ("company_id","issue_id","status");--> statement-breakpoint
CREATE INDEX "meeting_rooms_company_project_document_status_idx" ON "meeting_rooms" USING btree ("company_id","project_document_id","status");--> statement-breakpoint
CREATE INDEX "meeting_rooms_company_origin_idx" ON "meeting_rooms" USING btree ("company_id","origin_kind","origin_id");--> statement-breakpoint
CREATE INDEX "meeting_summaries_company_room_status_created_idx" ON "meeting_summaries" USING btree ("company_id","room_id","status","created_at");--> statement-breakpoint
CREATE INDEX "meeting_summaries_company_linked_issue_idx" ON "meeting_summaries" USING btree ("company_id","linked_issue_id");--> statement-breakpoint
CREATE INDEX "meeting_summaries_company_linked_project_document_idx" ON "meeting_summaries" USING btree ("company_id","linked_project_document_id");