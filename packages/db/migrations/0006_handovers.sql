CREATE TABLE "handovers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" text NOT NULL,
	"audit_id" uuid NOT NULL,
	"commit" text NOT NULL,
	"person_id" uuid NOT NULL,
	"person" text NOT NULL,
	"structure" jsonb NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_site_id_sites_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER handovers_append_only BEFORE UPDATE OR DELETE ON "handovers" FOR EACH ROW EXECUTE FUNCTION rama_refuse_change();
--> statement-breakpoint
CREATE TRIGGER handovers_no_truncate BEFORE TRUNCATE ON "handovers" FOR EACH STATEMENT EXECUTE FUNCTION rama_refuse_change();
--> statement-breakpoint
CREATE TRIGGER handovers_audit AFTER INSERT ON "handovers" FOR EACH ROW EXECUTE FUNCTION rama_audit_insert();
