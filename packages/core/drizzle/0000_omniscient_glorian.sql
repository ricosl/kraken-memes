CREATE TYPE "public"."meme_classification" AS ENUM('AUTO_CLASSIFIED', 'INCLUDED', 'EXCLUDED', 'PENDING_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('NEW_HIGH_PRIORITY', 'INVALIDATED');--> statement-breakpoint
CREATE TYPE "public"."paper_trade_outcome" AS ENUM('OPEN', 'TARGET_HIT', 'INVALIDATED', 'EXPIRED', 'MANUAL_CLOSE');--> statement-breakpoint
CREATE TYPE "public"."signal_state" AS ENUM('WATCH', 'QUALIFIED', 'HIGH_PRIORITY', 'ACTIVE', 'STRENGTHENING', 'WEAKENING', 'INVALIDATED', 'TARGET_REACHED', 'EXPIRED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."timeframe" AS ENUM('5m', '15m', '1h', '4h', '24h');--> statement-breakpoint
CREATE TYPE "public"."trade_aggressor" AS ENUM('BUY', 'SELL', 'UNKNOWN');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"timeframe" timeframe NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"volume" double precision NOT NULL,
	"vwap" double precision,
	"trade_count" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"momentum" jsonb NOT NULL,
	"volume" jsonb NOT NULL,
	"order_book" jsonb NOT NULL,
	"liquidity" jsonb NOT NULL,
	"regime" jsonb NOT NULL,
	"social" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kraken_pair_name" text NOT NULL,
	"symbol" text NOT NULL,
	"base_asset" text NOT NULL,
	"quote_asset" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"meme_classification" "meme_classification" DEFAULT 'PENDING_REVIEW' NOT NULL,
	"classification_overridden" boolean DEFAULT false NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"price_decimals" integer DEFAULT 5 NOT NULL,
	"quantity_decimals" integer DEFAULT 8 NOT NULL,
	"min_order_size" double precision DEFAULT 0 NOT NULL,
	"ineligible_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitor_health" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'OFFLINE' NOT NULL,
	"last_kraken_connection" timestamp with time zone,
	"last_market_data_update" timestamp with time zone,
	"last_completed_scan" timestamp with time zone,
	"eligible_market_count" integer DEFAULT 0 NOT NULL,
	"active_setup_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"to_state" "signal_state" NOT NULL,
	"score" double precision NOT NULL,
	"subscriptions_targeted" integer DEFAULT 0 NOT NULL,
	"subscriptions_delivered" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"min_score" integer DEFAULT 75 NOT NULL,
	"quiet_start" text,
	"quiet_end" text,
	"cooldown_minutes" integer DEFAULT 60 NOT NULL,
	"new_setup_enabled" boolean DEFAULT true NOT NULL,
	"invalidation_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_book_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"best_bid" double precision NOT NULL,
	"best_ask" double precision NOT NULL,
	"spread" double precision NOT NULL,
	"spread_bps" double precision NOT NULL,
	"bid_depth" double precision NOT NULL,
	"ask_depth" double precision NOT NULL,
	"imbalance" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "paper_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"signal_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	"entry_price" double precision NOT NULL,
	"entry_timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"position_size_usd" double precision NOT NULL,
	"target_price" double precision NOT NULL,
	"invalidation_price" double precision NOT NULL,
	"fees_bps" double precision NOT NULL,
	"slippage_bps" double precision NOT NULL,
	"exit_price" double precision,
	"exit_timestamp" timestamp with time zone,
	"realized_pnl_usd" double precision,
	"realized_pnl_pct" double precision,
	"max_favorable_excursion_pct" double precision DEFAULT 0 NOT NULL,
	"max_adverse_excursion_pct" double precision DEFAULT 0 NOT NULL,
	"outcome" "paper_trade_outcome" DEFAULT 'OPEN' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scan_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"quote_currency" text DEFAULT 'USD' NOT NULL,
	"target_pct" double precision DEFAULT 0.07 NOT NULL,
	"invalidation_pct" double precision DEFAULT -0.03 NOT NULL,
	"observation_window_hours" double precision DEFAULT 24 NOT NULL,
	"decision_interval_minutes" integer DEFAULT 15 NOT NULL,
	"weights" jsonb DEFAULT '{"volumeAcceleration":35,"breakoutStructure":25,"liquidityOrderBook":20,"marketRegime":10,"social":10}'::jsonb NOT NULL,
	"score_thresholds" jsonb DEFAULT '{"watchScore":40,"qualifyScore":60,"highPriorityScore":75}'::jsonb NOT NULL,
	"liquidity_thresholds" jsonb DEFAULT '{"minQuoteVolume24h":250000,"maxSpreadBps":50,"minDepthNotional":15000,"minTradeCount1h":20}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "signal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_id" uuid NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"from_state" "signal_state",
	"to_state" "signal_state" NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "signal_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_id" uuid NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"max_favorable_move_pct" double precision DEFAULT 0 NOT NULL,
	"max_adverse_move_pct" double precision DEFAULT 0 NOT NULL,
	"outcome" "paper_trade_outcome" DEFAULT 'OPEN' NOT NULL,
	"hours_to_outcome" double precision
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"state" "signal_state" DEFAULT 'WATCH' NOT NULL,
	"score" double precision NOT NULL,
	"snapshot" jsonb NOT NULL,
	"entry_price_ref" double precision NOT NULL,
	"target_price" double precision NOT NULL,
	"invalidation_price" double precision NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_notified_state" "signal_state",
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"price" double precision NOT NULL,
	"volume" double precision NOT NULL,
	"aggressor" "trade_aggressor" DEFAULT 'UNKNOWN' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candles" ADD CONSTRAINT "candles_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "features" ADD CONSTRAINT "features_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_history" ADD CONSTRAINT "notification_history_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_history" ADD CONSTRAINT "notification_history_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_book_snapshots" ADD CONSTRAINT "order_book_snapshots_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "paper_trades" ADD CONSTRAINT "paper_trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "paper_trades" ADD CONSTRAINT "paper_trades_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "paper_trades" ADD CONSTRAINT "paper_trades_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signal_events" ADD CONSTRAINT "signal_events_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signal_outcomes" ADD CONSTRAINT "signal_outcomes_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signals" ADD CONSTRAINT "signals_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trades" ADD CONSTRAINT "trades_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "candles_market_timeframe_timestamp_idx" ON "candles" USING btree ("market_id","timeframe","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candles_market_timeframe_idx" ON "candles" USING btree ("market_id","timeframe");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "features_market_timestamp_idx" ON "features" USING btree ("market_id","timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "markets_kraken_pair_name_idx" ON "markets" USING btree ("kraken_pair_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_history_market_id_idx" ON "notification_history" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_history_signal_id_idx" ON "notification_history" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_book_snapshots_market_timestamp_idx" ON "order_book_snapshots" USING btree ("market_id","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "paper_trades_user_id_idx" ON "paper_trades" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "paper_trades_signal_id_idx" ON "paper_trades" USING btree ("signal_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signal_events_signal_id_idx" ON "signal_events" USING btree ("signal_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "signal_outcomes_signal_id_idx" ON "signal_outcomes" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signals_market_id_idx" ON "signals" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signals_state_idx" ON "signals" USING btree ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signals_timestamp_idx" ON "signals" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_market_timestamp_idx" ON "trades" USING btree ("market_id","timestamp");