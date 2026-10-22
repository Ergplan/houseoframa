CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" text NOT NULL,
	"session_id" uuid,
	"title" text NOT NULL,
	"statement" text NOT NULL,
	"bricks" jsonb NOT NULL,
	"screen_id" text,
	"status" text NOT NULL,
	"by" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"reconstructed" boolean DEFAULT false NOT NULL,
	"supersedes" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" text NOT NULL,
	"title" text NOT NULL,
	"reconstructed" boolean DEFAULT false NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" text NOT NULL,
	"session_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"speaker" text NOT NULL,
	"text" text NOT NULL,
	"draft" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" text NOT NULL,
	"person" text NOT NULL,
	"person_id" uuid NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"target_commit" text NOT NULL,
	"statement" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"supersedes" uuid,
	"withdrawn" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_site_id_sites_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_session_id_discovery_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."discovery_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_supersedes_decisions_id_fk" FOREIGN KEY ("supersedes") REFERENCES "public"."decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_sessions" ADD CONSTRAINT "discovery_sessions_site_id_sites_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_turns" ADD CONSTRAINT "discovery_turns_site_id_sites_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_turns" ADD CONSTRAINT "discovery_turns_session_id_discovery_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."discovery_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signoffs" ADD CONSTRAINT "signoffs_site_id_sites_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signoffs" ADD CONSTRAINT "signoffs_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signoffs" ADD CONSTRAINT "signoffs_supersedes_signoffs_id_fk" FOREIGN KEY ("supersedes") REFERENCES "public"."signoffs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Hand-added after `drizzle-kit generate` (Drizzle cannot express triggers). The ceremony tables are
-- append-only: a change is a new row that supersedes the old (Invariant 3). rama_refuse_change() is from 0000.
CREATE TRIGGER discovery_sessions_append_only BEFORE UPDATE OR DELETE ON "discovery_sessions" FOR EACH ROW EXECUTE FUNCTION rama_refuse_change();
--> statement-breakpoint
CREATE TRIGGER discovery_sessions_no_truncate BEFORE TRUNCATE ON "discovery_sessions" FOR EACH STATEMENT EXECUTE FUNCTION rama_refuse_change();
--> statement-breakpoint
CREATE TRIGGER discovery_turns_append_only BEFORE UPDATE OR DELETE ON "discovery_turns" FOR EACH ROW EXECUTE FUNCTION rama_refuse_change();
--> statement-breakpoint
CREATE TRIGGER discovery_turns_no_truncate BEFORE TRUNCATE ON "discovery_turns" FOR EACH STATEMENT EXECUTE FUNCTION rama_refuse_change();
--> statement-breakpoint
CREATE TRIGGER decisions_append_only BEFORE UPDATE OR DELETE ON "decisions" FOR EACH ROW EXECUTE FUNCTION rama_refuse_change();
--> statement-breakpoint
CREATE TRIGGER decisions_no_truncate BEFORE TRUNCATE ON "decisions" FOR EACH STATEMENT EXECUTE FUNCTION rama_refuse_change();
--> statement-breakpoint
CREATE TRIGGER signoffs_append_only BEFORE UPDATE OR DELETE ON "signoffs" FOR EACH ROW EXECUTE FUNCTION rama_refuse_change();
--> statement-breakpoint
CREATE TRIGGER signoffs_no_truncate BEFORE TRUNCATE ON "signoffs" FOR EACH STATEMENT EXECUTE FUNCTION rama_refuse_change();
--> statement-breakpoint
-- Every insert into decisions and signoffs appends to audit_log in the same transaction (Invariant 8), so
-- no code path can write one without the other.
CREATE OR REPLACE FUNCTION rama_audit_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO audit_log (site_id, table_name, row_id, action, payload, created_by)
  VALUES (NEW.site_id, TG_TABLE_NAME, NEW.id::text, 'insert', to_jsonb(NEW), NEW.created_by);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER decisions_audit AFTER INSERT ON "decisions" FOR EACH ROW EXECUTE FUNCTION rama_audit_insert();
--> statement-breakpoint
CREATE TRIGGER signoffs_audit AFTER INSERT ON "signoffs" FOR EACH ROW EXECUTE FUNCTION rama_audit_insert();
