import type { DlcJobStatus, DlcResult } from './dlcTypes';

const DLC_API_BASE = import.meta.env.VITE_DLC_API_BASE ?? 'http://localhost:8000';

export async function submitDlcJob(file: Blob, fileName: string): Promise<{ jobId: string }> {
  const form = new FormData();
  form.append('file', file, fileName);

  const res = await fetch(`${DLC_API_BASE}/jobs`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to submit DeepLabCut job');
  }
  const payload = await res.json() as { id: string };
  return { jobId: payload.id };
}

export async function getDlcJobStatus(jobId: string): Promise<DlcJobStatus> {
  const res = await fetch(`${DLC_API_BASE}/jobs/${jobId}`);
  if (!res.ok) throw new Error('Failed to fetch job status');
  return res.json() as Promise<DlcJobStatus>;
}

export async function getDlcJobResult(jobId: string): Promise<DlcResult> {
  const res = await fetch(`${DLC_API_BASE}/jobs/${jobId}/result`);
  if (!res.ok) throw new Error('Failed to fetch DeepLabCut result');
  return res.json() as Promise<DlcResult>;
}
