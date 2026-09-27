CREATE TABLE pet_homes (
  id TEXT PRIMARY KEY NOT NULL,
  state TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  last_request TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
