import type { RunnableConfig } from "@langchain/core/runnables";
import { type Checkpoint, type CheckpointMetadata, type ChannelVersions, type PendingWrite, WRITES_IDX_MAP } from "@langchain/langgraph-checkpoint";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import pg from "pg";

/** "($1, $2, $3), ($4, $5, $6), …" for a multi-row INSERT. */
function placeholders(rows: number, cols: number): string {
  return Array.from({ length: rows }, (_, r) => `(${Array.from({ length: cols }, (_, c) => `$${r * cols + c + 1}`).join(", ")})`).join(", ");
}

/**
 * PostgresSaver with the same tables and data, but fewer round trips. The stock `put` upserts each
 * channel blob as a separate query inside a transaction (~12 sequential round trips per checkpoint,
 * ~1.2 s against a remote Neon). Here all blobs go in one multi-row statement, then the checkpoint
 * row: 2 round trips. Blob rows are keyed by version, so a crash between the two statements can
 * only leave unreferenced blobs. Writes go in one multi-row statement, which is atomic on its own.
 */
export class FastPostgresSaver extends PostgresSaver {
  private readonly db: pg.Pool;
  private readonly schemaName: string;

  constructor(connectionString: string, schema: string) {
    const pool = new pg.Pool({ connectionString });
    super(pool, undefined, { schema });
    this.db = pool;
    this.schemaName = schema;
  }

  private table(name: string): string {
    return `"${this.schemaName}".${name}`;
  }

  override async put(config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata, newVersions: ChannelVersions): Promise<RunnableConfig> {
    if (config.configurable === undefined) throw new Error(`Missing "configurable" field in "config" param`);
    const { thread_id, checkpoint_ns = "", checkpoint_id } = config.configurable as Record<string, string | undefined>;
    const [blobs, meta] = await Promise.all([
      this._dumpBlobs(thread_id ?? "", checkpoint_ns, checkpoint.channel_values, newVersions),
      this._dumpMetadata(metadata),
    ]);
    if (blobs.length > 0) {
      await this.db.query(
        `INSERT INTO ${this.table("checkpoint_blobs")} (thread_id, checkpoint_ns, channel, version, type, blob)
         VALUES ${placeholders(blobs.length, 6)}
         ON CONFLICT (thread_id, checkpoint_ns, channel, version) DO NOTHING`,
        blobs.flat(),
      );
    }
    await this.db.query(
      `INSERT INTO ${this.table("checkpoints")} (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, checkpoint, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (thread_id, checkpoint_ns, checkpoint_id) DO UPDATE SET checkpoint = EXCLUDED.checkpoint, metadata = EXCLUDED.metadata`,
      [thread_id, checkpoint_ns, checkpoint.id, checkpoint_id, this._dumpCheckpoint(checkpoint), meta],
    );
    return { configurable: { thread_id, checkpoint_ns, checkpoint_id: checkpoint.id } };
  }

  override async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string, taskPath?: string): Promise<void> {
    const c = (config.configurable ?? {}) as Record<string, string | undefined>;
    const rows = await this._dumpWrites(c.thread_id ?? "", c.checkpoint_ns ?? "", c.checkpoint_id ?? "", taskId, writes, taskPath ?? "");
    if (rows.length === 0) return;
    // Same rule as the stock saver: special channels (errors, interrupts…) overwrite, others don't.
    const onConflict = writes.every((w) => w[0] in WRITES_IDX_MAP)
      ? "DO UPDATE SET channel = EXCLUDED.channel, type = EXCLUDED.type, blob = EXCLUDED.blob"
      : "DO NOTHING";
    await this.db.query(
      `INSERT INTO ${this.table("checkpoint_writes")} (thread_id, checkpoint_ns, checkpoint_id, task_id, task_path, idx, channel, type, blob)
       VALUES ${placeholders(rows.length, 9)}
       ON CONFLICT (thread_id, checkpoint_ns, checkpoint_id, task_id, idx) ${onConflict}`,
      rows.flat(),
    );
  }
}
