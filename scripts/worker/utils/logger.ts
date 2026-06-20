import { insertSupabaseRow, updateSupabaseRow } from '../repositories/supabase';

export interface JobResult {
  rowsRead: number;
  rowsWritten: number;
  message?: string;
}

export async function runLoggingJob(
  env: any,
  source: string,
  jobFn: (correlationId: string) => Promise<JobResult>
): Promise<JobResult> {
  const correlationId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  let logRow: any = null;
  try {
    logRow = await insertSupabaseRow(env, '/rest/v1/wc2026_api_sync_log', {
      source,
      status: 'running',
      message: `Job started. Correlation ID: ${correlationId}`,
      rows_read: 0,
      rows_written: 0,
      started_at: startedAt,
    });
  } catch (err: any) {
    console.error(`[${source}] Failed to insert initial sync log:`, err.message);
  }

  try {
    // Run the actual task
    const result = await jobFn(correlationId);
    
    // Update log on success
    if (logRow && logRow.id) {
      try {
        await updateSupabaseRow(env, '/rest/v1/wc2026_api_sync_log', logRow.id, {
          status: 'success',
          message: result.message || 'Job completed successfully.',
          rows_read: result.rowsRead,
          rows_written: result.rowsWritten,
          finished_at: new Date().toISOString(),
        });
      } catch (logErr: any) {
        console.error(`[${source}] Failed to update sync log to success:`, logErr.message);
      }
    }
    return result;
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${source}] Job failed:`, errorMessage);

    // Update log on error
    if (logRow && logRow.id) {
      try {
        await updateSupabaseRow(env, '/rest/v1/wc2026_api_sync_log', logRow.id, {
          status: 'error',
          message: `Error: ${errorMessage}`,
          finished_at: new Date().toISOString(),
        });
      } catch (logErr: any) {
        console.error(`[${source}] Failed to update sync log to error:`, logErr.message);
      }
    }
    throw error;
  }
}
