CREATE TABLE "auth_login_rate_limits" (
  "scope_key" varchar(220) PRIMARY KEY,
  "window_started_at" timestamptz NOT NULL,
  "request_count" integer NOT NULL CHECK ("request_count" > 0),
  "updated_at" timestamptz NOT NULL
);
