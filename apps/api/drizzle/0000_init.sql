CREATE TYPE "public"."capi_status" AS ENUM('pending', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."capi_trigger" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."count_mode" AS ENUM('customer_only', 'customer_admin');--> statement-breakpoint
CREATE TYPE "public"."keyword_match" AS ENUM('contains', 'word');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('text', 'image', 'video', 'audio', 'document', 'sticker', 'other');--> statement-breakpoint
CREATE TYPE "public"."sender_scope" AS ENUM('lead', 'admin', 'both');--> statement-breakpoint
CREATE TYPE "public"."trigger_mode" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."wa_status" AS ENUM('pending', 'connected', 'disconnected', 'logged_out', 'suspended');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capi_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"pixel_id" uuid,
	"event_name" text NOT NULL,
	"event_id" text NOT NULL,
	"trigger" "capi_trigger" NOT NULL,
	"sent_by" text,
	"status" "capi_status" DEFAULT 'pending' NOT NULL,
	"request" jsonb,
	"response" jsonb,
	"fbtrace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capi_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"pixel_id" uuid,
	"dataset_id" text NOT NULL,
	"lead_id" uuid,
	"source" text NOT NULL,
	"event_name" text,
	"test_event_code" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"ok" boolean NOT NULL,
	"http_status" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"request" jsonb,
	"response" jsonb,
	"fbtrace_id" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wa_account_id" uuid NOT NULL,
	"contact_jid" text NOT NULL,
	"phone" text,
	"name" text,
	"ctwa_clid" text,
	"ad_source_id" text,
	"ad_source_type" text,
	"ad_source_url" text,
	"ad_headline" text,
	"first_message_at" timestamp with time zone NOT NULL,
	"last_message_at" timestamp with time zone NOT NULL,
	"last_message_preview" text,
	"msg_in_count" integer DEFAULT 0 NOT NULL,
	"msg_out_count" integer DEFAULT 0 NOT NULL,
	"is_potential" boolean DEFAULT false NOT NULL,
	"potential_reason" jsonb,
	"potential_at" timestamp with time zone,
	"capi_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"wa_account_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"wa_message_id" text NOT NULL,
	"from_me" boolean NOT NULL,
	"type" "message_type" NOT NULL,
	"text" text,
	"sent_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pixel_wa_accounts" (
	"pixel_id" uuid NOT NULL,
	"wa_account_id" uuid NOT NULL,
	CONSTRAINT "pixel_wa_accounts_pixel_id_wa_account_id_pk" PRIMARY KEY("pixel_id","wa_account_id")
);
--> statement-breakpoint
CREATE TABLE "pixels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"pixel_id" text NOT NULL,
	"access_token_enc" text NOT NULL,
	"waba_id" text,
	"page_id" text,
	"test_event_code" text,
	"apply_all" boolean DEFAULT true NOT NULL,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "trigger_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"sender_scope" "sender_scope" DEFAULT 'lead' NOT NULL,
	"match" "keyword_match" DEFAULT 'contains' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trigger_wa_accounts" (
	"trigger_id" uuid NOT NULL,
	"wa_account_id" uuid NOT NULL,
	CONSTRAINT "trigger_wa_accounts_trigger_id_wa_account_id_pk" PRIMARY KEY("trigger_id","wa_account_id")
);
--> statement-breakpoint
CREATE TABLE "triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"apply_all" boolean DEFAULT true NOT NULL,
	"min_messages" integer,
	"count_mode" "count_mode" DEFAULT 'customer_only' NOT NULL,
	"mode" "trigger_mode" DEFAULT 'manual' NOT NULL,
	"event_name" text DEFAULT 'Lead' NOT NULL,
	"value" bigint,
	"currency" text DEFAULT 'IDR',
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"label" text,
	"jid" text,
	"phone" text,
	"push_name" text,
	"status" "wa_status" DEFAULT 'pending' NOT NULL,
	"last_connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capi_events" ADD CONSTRAINT "capi_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capi_events" ADD CONSTRAINT "capi_events_pixel_id_pixels_id_fk" FOREIGN KEY ("pixel_id") REFERENCES "public"."pixels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capi_logs" ADD CONSTRAINT "capi_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capi_logs" ADD CONSTRAINT "capi_logs_pixel_id_pixels_id_fk" FOREIGN KEY ("pixel_id") REFERENCES "public"."pixels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capi_logs" ADD CONSTRAINT "capi_logs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_wa_account_id_wa_accounts_id_fk" FOREIGN KEY ("wa_account_id") REFERENCES "public"."wa_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_wa_account_id_wa_accounts_id_fk" FOREIGN KEY ("wa_account_id") REFERENCES "public"."wa_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixel_wa_accounts" ADD CONSTRAINT "pixel_wa_accounts_pixel_id_pixels_id_fk" FOREIGN KEY ("pixel_id") REFERENCES "public"."pixels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixel_wa_accounts" ADD CONSTRAINT "pixel_wa_accounts_wa_account_id_wa_accounts_id_fk" FOREIGN KEY ("wa_account_id") REFERENCES "public"."wa_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixels" ADD CONSTRAINT "pixels_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_keywords" ADD CONSTRAINT "trigger_keywords_trigger_id_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."triggers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_wa_accounts" ADD CONSTRAINT "trigger_wa_accounts_trigger_id_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."triggers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_wa_accounts" ADD CONSTRAINT "trigger_wa_accounts_wa_account_id_wa_accounts_id_fk" FOREIGN KEY ("wa_account_id") REFERENCES "public"."wa_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_accounts" ADD CONSTRAINT "wa_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "capi_events_lead_idx" ON "capi_events" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "capi_events_lead_event_uq" ON "capi_events" USING btree ("lead_id","event_name") WHERE "capi_events"."status" <> 'failed';--> statement-breakpoint
CREATE INDEX "capi_logs_user_idx" ON "capi_logs" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_account_contact_uq" ON "leads" USING btree ("wa_account_id","contact_jid");--> statement-breakpoint
CREATE INDEX "leads_account_last_msg_idx" ON "leads" USING btree ("wa_account_id","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "messages_account_wamid_uq" ON "messages" USING btree ("wa_account_id","wa_message_id");--> statement-breakpoint
CREATE INDEX "messages_lead_sent_idx" ON "messages" USING btree ("lead_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pixel_wa_accounts_wa_uq" ON "pixel_wa_accounts" USING btree ("wa_account_id");--> statement-breakpoint
CREATE INDEX "pixels_user_idx" ON "pixels" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trigger_keywords_trigger_idx" ON "trigger_keywords" USING btree ("trigger_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trigger_wa_accounts_wa_uq" ON "trigger_wa_accounts" USING btree ("wa_account_id");--> statement-breakpoint
CREATE INDEX "triggers_user_idx" ON "triggers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wa_accounts_user_idx" ON "wa_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_accounts_jid_uq" ON "wa_accounts" USING btree ("jid");