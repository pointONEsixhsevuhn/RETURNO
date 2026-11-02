import { AsyncLocalStorage } from "node:async_hooks";

const requestState = new AsyncLocalStorage();

export function toPostgresSql(sql) {
  let statement = sql
    .replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, "INSERT INTO")
    .replace(/\s+COLLATE\s+NOCASE\b/gi, "")
    .replace(/\bCURRENT_TIMESTAMP\b/gi, "CURRENT_TIMESTAMP::text")
    .replace(/\bp\.rowid\b/g, "p.id");
  statement = statement.replace(
    /instr\(lower\(([^)]+)\),lower\(\?\)\)>0/gi,
    "POSITION(LOWER(?) IN LOWER($1))>0",
  );
  let parameter = 0;
  statement = statement.replace(/\?/g, () => `$${++parameter}`);
  if (/\bINSERT\s+OR\s+IGNORE\s+INTO\b/i.test(sql)) {
    statement = statement.trim().replace(/;?$/, " ON CONFLICT DO NOTHING");
  }
  return statement;
}

export class PostgresStore {
  constructor(pool) {
    this.pool = pool;
  }

  prepare(sql) {
    const text = toPostgresSql(sql);
    return {
      get: async (...values) => (await this.query(text, values)).rows[0],
      all: async (...values) => (await this.query(text, values)).rows,
      run: async (...values) => {
        const result = await this.query(text, values);
        return { changes: result.rowCount };
      },
    };
  }

  async query(text, values = []) {
    const client = requestState.getStore()?.client;
    return client
      ? client.query(text, values)
      : this.pool.query(text, values);
  }

  async exec(statement) {
    const command = statement.trim().toUpperCase();
    const state = requestState.getStore();
    if (command === "BEGIN" || command === "BEGIN IMMEDIATE") {
      if (!state || state.client)
        throw new Error("Postgres transactions require a fresh request scope.");
      state.client = await this.pool.connect();
      try {
        await state.client.query("BEGIN");
      } catch (error) {
        state.client.release();
        state.client = null;
        throw error;
      }
      return;
    }
    if (command === "COMMIT" || command === "ROLLBACK") {
      if (!state?.client)
        throw new Error("No Postgres transaction is active for this request.");
      const client = state.client;
      state.client = null;
      try {
        await client.query(command);
      } finally {
        client.release();
      }
      return;
    }
    await this.query(statement);
  }

  async withRequest(callback) {
    return requestState.run({ client: null }, async () => {
      const state = requestState.getStore();
      try {
        return await callback();
      } finally {
        if (state.client) {
          try {
            await state.client.query("ROLLBACK");
          } finally {
            state.client.release();
            state.client = null;
          }
        }
      }
    });
  }

  async close() {
    await this.pool.end();
  }
}
