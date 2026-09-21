-- SUPERADO — ver research.md Decisión 3 (actualización 2026-09-19).
-- Este DDL manual fue el primer bypass del spike T007, escrito cuando
-- @better-auth/cli parecía la única vía oficial y fallaba (native build de
-- better-sqlite3 sin `make` instalado en este entorno). Investigación
-- posterior encontró que better-auth expone su motor de migración real como
-- subpath público del paquete PRINCIPAL —`better-auth/db/migration`
-- (getMigrations/runMigrations)— que no depende de @better-auth/cli ni de
-- ninguna dependencia nativa, y que sí corrió correctamente (ver
-- backend/scripts/investigar-migracion-oficial.ts). Ese SQL generado por la
-- librería difiere del de este archivo en detalles reales (índices en
-- `session.userId`/`account.userId`/`verification.identifier` que este DDL
-- manual no tenía; defaults `CURRENT_TIMESTAMP`). Se conserva este archivo
-- solo como registro histórico del primer intento — NO usarlo como fuente
-- de la migración real.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth."user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS auth.session (
  id text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth.account (
  id text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS auth.verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz,
  "updatedAt" timestamptz
);
