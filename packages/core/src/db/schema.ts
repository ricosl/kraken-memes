import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// --- Enums -----------------------------------------------------------------

export const memeClassificationEnum = pgEnum("meme_classification", [
  "AUTO_CLASSIFIED",
  "INCLUDED",
  "EXCLUDED",
  "PENDING_REVIEW",
]);

export const timeframeEnum = pgEnum("timeframe", ["5m", "15m", "1h", "4h", "24h"]);

export const tradeAggressorEnum = pgEnum("trade_aggressor", ["BUY", "SELL", "UNKNOWN"]);

export const signalStateEnum = pgEnum("signal_state", [
  "WATCH",
  "QUALIFIED",
  "HIGH_PRIORITY",
  "ACTIVE",
  "STRENGTHENING",
  "WEAKENING",
  "INVALIDATED",
  "TARGET_REACHED",
  "EXPIRED",
  "REJECTED",
]);

export const paperTradeOutcomeEnum = pgEnum("paper_trade_outcome", [
  "OPEN",
  "TARGET_HIT",
  "INVALIDATED",
  "EXPIRED",
  "MANUAL_CLOSE",
]);

export const notificationTypeEnum = pgEnum("notification_type", ["NEW_HIGH_PRIORITY", "INVALIDATED"]);

// --- Users & push ------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
    active: boolean("active").notNull().default(true),
  },
  (table) => [uniqueIndex("push_subscriptions_endpoint_idx").on(table.endpoint), index("push_subscriptions_user_id_idx").on(table.userId)],
);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
  minScore: integer("min_score").notNull().default(75),
  quietStart: text("quiet_start"), // "HH:MM" UTC
  quietEnd: text("quiet_end"),
  cooldownMinutes: integer("cooldown_minutes").notNull().default(60),
  newSetupEnabled: boolean("new_setup_enabled").notNull().default(true),
  invalidationEnabled: boolean("invalidation_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Markets -----------------------------------------------------------------

export const markets = pgTable(
  "markets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Kraken's own REST pair name, e.g. "XDGUSD" — the natural external key. */
    krakenPairName: text("kraken_pair_name").notNull(),
    symbol: text("symbol").notNull(), // e.g. "DOGE/USD"
    baseAsset: text("base_asset").notNull(),
    quoteAsset: text("quote_asset").notNull(),
    active: boolean("active").notNull().default(true),
    memeClassification: memeClassificationEnum("meme_classification").notNull().default("PENDING_REVIEW"),
    /** True once a human has overridden the auto classification; auto-reclassification then leaves it alone. */
    classificationOverridden: boolean("classification_overridden").notNull().default(false),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
    priceDecimals: integer("price_decimals").notNull().default(5),
    quantityDecimals: integer("quantity_decimals").notNull().default(8),
    minOrderSize: doublePrecision("min_order_size").notNull().default(0),
    ineligibleReason: text("ineligible_reason"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("markets_kraken_pair_name_idx").on(table.krakenPairName)],
);

// --- Market data ---------------------------------------------------------------

export const candles = pgTable(
  "candles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    timeframe: timeframeEnum("timeframe").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    open: doublePrecision("open").notNull(),
    high: doublePrecision("high").notNull(),
    low: doublePrecision("low").notNull(),
    close: doublePrecision("close").notNull(),
    volume: doublePrecision("volume").notNull(),
    vwap: doublePrecision("vwap"),
    tradeCount: integer("trade_count"),
  },
  (table) => [
    uniqueIndex("candles_market_timeframe_timestamp_idx").on(table.marketId, table.timeframe, table.timestamp),
    index("candles_market_timeframe_idx").on(table.marketId, table.timeframe),
  ],
);

export const trades = pgTable(
  "trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    price: doublePrecision("price").notNull(),
    volume: doublePrecision("volume").notNull(),
    aggressor: tradeAggressorEnum("aggressor").notNull().default("UNKNOWN"),
  },
  (table) => [index("trades_market_timestamp_idx").on(table.marketId, table.timestamp)],
);

export const orderBookSnapshots = pgTable(
  "order_book_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    bestBid: doublePrecision("best_bid").notNull(),
    bestAsk: doublePrecision("best_ask").notNull(),
    spread: doublePrecision("spread").notNull(),
    spreadBps: doublePrecision("spread_bps").notNull(),
    bidDepth: doublePrecision("bid_depth").notNull(),
    askDepth: doublePrecision("ask_depth").notNull(),
    imbalance: real("imbalance").notNull(),
  },
  (table) => [index("order_book_snapshots_market_timestamp_idx").on(table.marketId, table.timestamp)],
);

/** Calculated features persisted at each 15m decision timestamp (spec section 30 `features`). */
export const features = pgTable(
  "features",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    momentum: jsonb("momentum").notNull(),
    volume: jsonb("volume").notNull(),
    orderBook: jsonb("order_book").notNull(),
    liquidity: jsonb("liquidity").notNull(),
    regime: jsonb("regime").notNull(),
    social: jsonb("social").notNull(),
  },
  (table) => [uniqueIndex("features_market_timestamp_idx").on(table.marketId, table.timestamp)],
);

// --- Signals ---------------------------------------------------------------

export const signals = pgTable(
  "signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    state: signalStateEnum("state").notNull().default("WATCH"),
    score: doublePrecision("score").notNull(),
    /** Full immutable ComponentScores + weights + snapshot inputs, as captured at creation time. Never mutated later. */
    snapshot: jsonb("snapshot").notNull(),
    entryPriceRef: doublePrecision("entry_price_ref").notNull(),
    targetPrice: doublePrecision("target_price").notNull(),
    invalidationPrice: doublePrecision("invalidation_price").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastNotifiedState: signalStateEnum("last_notified_state"),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("signals_market_id_idx").on(table.marketId),
    index("signals_state_idx").on(table.state),
    index("signals_timestamp_idx").on(table.timestamp),
  ],
);

export const signalEvents = pgTable(
  "signal_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    signalId: uuid("signal_id")
      .notNull()
      .references(() => signals.id, { onDelete: "cascade" }),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    fromState: signalStateEnum("from_state"),
    toState: signalStateEnum("to_state").notNull(),
    reason: text("reason").notNull(),
  },
  (table) => [index("signal_events_signal_id_idx").on(table.signalId)],
);

export const notificationHistory = pgTable(
  "notification_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    signalId: uuid("signal_id")
      .notNull()
      .references(() => signals.id, { onDelete: "cascade" }),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    toState: signalStateEnum("to_state").notNull(),
    score: doublePrecision("score").notNull(),
    subscriptionsTargeted: integer("subscriptions_targeted").notNull().default(0),
    subscriptionsDelivered: integer("subscriptions_delivered").notNull().default(0),
  },
  (table) => [index("notification_history_market_id_idx").on(table.marketId), index("notification_history_signal_id_idx").on(table.signalId)],
);

// --- Paper trading & outcomes ------------------------------------------------

export const paperTrades = pgTable(
  "paper_trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    signalId: uuid("signal_id")
      .notNull()
      .references(() => signals.id, { onDelete: "cascade" }),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    entryPrice: doublePrecision("entry_price").notNull(),
    entryTimestamp: timestamp("entry_timestamp", { withTimezone: true }).notNull().defaultNow(),
    positionSizeUsd: doublePrecision("position_size_usd").notNull(),
    targetPrice: doublePrecision("target_price").notNull(),
    invalidationPrice: doublePrecision("invalidation_price").notNull(),
    feesBps: doublePrecision("fees_bps").notNull(),
    slippageBps: doublePrecision("slippage_bps").notNull(),
    exitPrice: doublePrecision("exit_price"),
    exitTimestamp: timestamp("exit_timestamp", { withTimezone: true }),
    realizedPnlUsd: doublePrecision("realized_pnl_usd"),
    realizedPnlPct: doublePrecision("realized_pnl_pct"),
    maxFavorableExcursionPct: doublePrecision("max_favorable_excursion_pct").notNull().default(0),
    maxAdverseExcursionPct: doublePrecision("max_adverse_excursion_pct").notNull().default(0),
    outcome: paperTradeOutcomeEnum("outcome").notNull().default("OPEN"),
  },
  (table) => [index("paper_trades_user_id_idx").on(table.userId), index("paper_trades_signal_id_idx").on(table.signalId)],
);

export const signalOutcomes = pgTable(
  "signal_outcomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    signalId: uuid("signal_id")
      .notNull()
      .references(() => signals.id, { onDelete: "cascade" }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    maxFavorableMovePct: doublePrecision("max_favorable_move_pct").notNull().default(0),
    maxAdverseMovePct: doublePrecision("max_adverse_move_pct").notNull().default(0),
    outcome: paperTradeOutcomeEnum("outcome").notNull().default("OPEN"),
    hoursToOutcome: doublePrecision("hours_to_outcome"),
  },
  (table) => [uniqueIndex("signal_outcomes_signal_id_idx").on(table.signalId)],
);

// --- Configuration -----------------------------------------------------------

/** Singleton row (id always 1) holding the globally-configurable scan/scoring parameters (spec section 46). */
export const scanConfig = pgTable("scan_config", {
  id: integer("id").primaryKey().default(1),
  quoteCurrency: text("quote_currency").notNull().default("USD"),
  targetPct: doublePrecision("target_pct").notNull().default(0.07),
  invalidationPct: doublePrecision("invalidation_pct").notNull().default(-0.03),
  observationWindowHours: doublePrecision("observation_window_hours").notNull().default(24),
  decisionIntervalMinutes: integer("decision_interval_minutes").notNull().default(15),
  weights: jsonb("weights")
    .notNull()
    .default(sql`'{"volumeAcceleration":35,"breakoutStructure":25,"liquidityOrderBook":20,"marketRegime":10,"social":10}'::jsonb`),
  scoreThresholds: jsonb("score_thresholds")
    .notNull()
    .default(sql`'{"watchScore":40,"qualifyScore":60,"highPriorityScore":75}'::jsonb`),
  liquidityThresholds: jsonb("liquidity_thresholds")
    .notNull()
    .default(sql`'{"minQuoteVolume24h":250000,"maxSpreadBps":50,"minDepthNotional":15000,"minTradeCount1h":20}'::jsonb`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Health/observability facts the worker writes and the API/PWA read (spec sections 33-34, 42). */
export const monitorHealth = pgTable("monitor_health", {
  id: integer("id").primaryKey().default(1),
  status: text("status").notNull().default("OFFLINE"),
  lastKrakenConnection: timestamp("last_kraken_connection", { withTimezone: true }),
  lastMarketDataUpdate: timestamp("last_market_data_update", { withTimezone: true }),
  lastCompletedScan: timestamp("last_completed_scan", { withTimezone: true }),
  eligibleMarketCount: integer("eligible_market_count").notNull().default(0),
  activeSetupCount: integer("active_setup_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Relations (for query ergonomics) ----------------------------------------

export const marketsRelations = relations(markets, ({ many }) => ({
  candles: many(candles),
  trades: many(trades),
  signals: many(signals),
}));

export const signalsRelations = relations(signals, ({ one, many }) => ({
  market: one(markets, { fields: [signals.marketId], references: [markets.id] }),
  events: many(signalEvents),
  paperTrades: many(paperTrades),
  outcome: one(signalOutcomes, { fields: [signals.id], references: [signalOutcomes.signalId] }),
}));

export const signalEventsRelations = relations(signalEvents, ({ one }) => ({
  signal: one(signals, { fields: [signalEvents.signalId], references: [signals.id] }),
}));

export const paperTradesRelations = relations(paperTrades, ({ one }) => ({
  signal: one(signals, { fields: [paperTrades.signalId], references: [signals.id] }),
  market: one(markets, { fields: [paperTrades.marketId], references: [markets.id] }),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, { fields: [pushSubscriptions.userId], references: [users.id] }),
}));

export const signalOutcomesRelations = relations(signalOutcomes, ({ one }) => ({
  signal: one(signals, { fields: [signalOutcomes.signalId], references: [signals.id] }),
}));
