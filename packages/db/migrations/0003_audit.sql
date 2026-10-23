CREATE TABLE "audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" text NOT NULL,
	"commit" text NOT NULL,
	"vendor" text NOT NULL,
	"model" text NOT NULL,
	"call_id" uuid NOT NULL,
	"inputs_hash" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" text NOT NULL,
	"audit_id" uuid NOT NULL,
	"brick" text NOT NULL,
	"check" text NOT NULL,
	"verdict" text NOT NULL,
	"text" text NOT NULL,
	"file" text,
	"line" integer,
	"check_verdict" text NOT NULL,
	"auditor_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_site_id_sites_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_call_id_model_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."model_calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_site_id_sites_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER audits_append_only BEFORE UPDATE OR DELETE ON "audits" FOR EACH ROW EXECUTE FUNCTION rama_refuse_change();
--> statement-breakpoint
CREATE TRIGGER audits_no_truncate BEFORE TRUNCATE ON "audits" FOR EACH STATEMENT EXECUTE FUNCTION rama_refuse_change();
--> statement-breakpoint
CREATE TRIGGER findings_append_only BEFORE UPDATE OR DELETE ON "findings" FOR EACH ROW EXECUTE FUNCTION rama_refuse_change();
--> statement-breakpoint
CREATE TRIGGER findings_no_truncate BEFORE TRUNCATE ON "findings" FOR EACH STATEMENT EXECUTE FUNCTION rama_refuse_change();
--> statement-breakpoint
CREATE TRIGGER audits_audit AFTER INSERT ON "audits" FOR EACH ROW EXECUTE FUNCTION rama_audit_insert();
--> statement-breakpoint
CREATE TRIGGER findings_audit AFTER INSERT ON "findings" FOR EACH ROW EXECUTE FUNCTION rama_audit_insert();
