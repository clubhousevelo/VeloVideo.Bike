from __future__ import annotations

import json
import shutil
import threading
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import cv2
import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
RESULT_DIR = DATA_DIR / "results"
JOBS_FILE = DATA_DIR / "jobs.json"

# Edit this path to your DLC config.yaml, or set DLC_CONFIG_PATH env var before startup.
DLC_CONFIG_PATH = (
    BASE_DIR / "models" / "cycling-sideview-allen-2026-02-28" / "config.yaml"
)

# Maps common cycling labels to indices used by the frontend skeleton overlay.
BODY_PART_TO_INDEX = {
    "left_shoulder": 11,
    "right_shoulder": 12,
    "left_elbow": 13,
    "right_elbow": 14,
    "left_wrist": 15,
    "right_wrist": 16,
    "left_hip": 23,
    "right_hip": 24,
    "left_knee": 25,
    "right_knee": 26,
    "left_ankle": 27,
    "right_ankle": 28,
    "left_heel": 29,
    "right_heel": 30,
    "left_foot_index": 31,
    "right_foot_index": 32,
}


@dataclass
class Job:
    id: str
    file_name: str
    status: Literal["queued", "running", "completed", "failed"] = "queued"
    error: str | None = None
    result_path: str | None = None
    source_path: str | None = None


JOBS: dict[str, Job] = {}
LOCK = threading.Lock()

app = FastAPI(title="DeepLabCut Worker", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _ensure_dirs() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    RESULT_DIR.mkdir(parents=True, exist_ok=True)


def _save_jobs() -> None:
    payload = {k: vars(v) for k, v in JOBS.items()}
    JOBS_FILE.parent.mkdir(parents=True, exist_ok=True)
    JOBS_FILE.write_text(json.dumps(payload, indent=2))


def _to_normalized_result(video_path: Path, csv_path: Path) -> dict:
    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 60.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    cap.release()

    df = pd.read_csv(csv_path, header=[0, 1, 2], index_col=0)
    scorer = df.columns.levels[0][0]
    bodyparts = [bp for bp in df[scorer].columns.levels[0] if bp.lower() in BODY_PART_TO_INDEX]

    frames = []
    for row_idx, (_, row) in enumerate(df.iterrows()):
        points = []
        for bp in bodyparts:
            x = float(row[(scorer, bp, "x")])
            y = float(row[(scorer, bp, "y")])
            conf = float(row[(scorer, bp, "likelihood")])
            if not np.isfinite(x) or not np.isfinite(y):
                continue
            points.append(
                {
                    "name": bp,
                    "index": BODY_PART_TO_INDEX[bp.lower()],
                    "x": max(0.0, min(1.0, x / max(width, 1))),
                    "y": max(0.0, min(1.0, y / max(height, 1))),
                    "confidence": max(0.0, min(1.0, conf)),
                }
            )
        frames.append(
            {
                "frameIndex": row_idx,
                "timeSec": row_idx / fps,
                "points": points,
            }
        )

    return {
        "model": "DeepLabCut",
        "fps": fps,
        "width": width,
        "height": height,
        "totalFrames": total_frames,
        "frames": frames,
    }


def _run_job(job_id: str, source_path: Path) -> None:
    with LOCK:
        job = JOBS[job_id]
        job.status = "running"
        _save_jobs()

    try:
        try:
            import deeplabcut
        except Exception as exc:
            raise RuntimeError(
                "DeepLabCut is not installed in this Python environment. "
                "Use the conda setup in dlc-worker/README.md."
            ) from exc

        if not DLC_CONFIG_PATH.exists():
            raise RuntimeError(
                f"DLC config not found at {DLC_CONFIG_PATH}. Set up your model first."
            )

        job_out_dir = RESULT_DIR / job_id
        job_out_dir.mkdir(parents=True, exist_ok=True)

        deeplabcut.analyze_videos(
            str(DLC_CONFIG_PATH),
            [str(source_path)],
            save_as_csv=True,
            destfolder=str(job_out_dir),
        )

        csv_files = sorted(job_out_dir.glob("*.csv"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not csv_files:
            raise RuntimeError("DeepLabCut did not produce a CSV output file.")

        normalized = _to_normalized_result(source_path, csv_files[0])
        result_path = job_out_dir / "result.json"
        result_path.write_text(json.dumps(normalized))

        with LOCK:
            job.status = "completed"
            job.result_path = str(result_path)
            _save_jobs()
    except Exception as exc:
        with LOCK:
            job.status = "failed"
            job.error = str(exc)
            _save_jobs()


@app.on_event("startup")
def startup() -> None:
    _ensure_dirs()
    if JOBS_FILE.exists():
        payload = json.loads(JOBS_FILE.read_text())
        for job_id, raw in payload.items():
            JOBS[job_id] = Job(**raw)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/jobs")
async def create_job(file: UploadFile = File(...)) -> dict:
    _ensure_dirs()
    job_id = str(uuid.uuid4())
    source_path = UPLOAD_DIR / f"{job_id}-{file.filename}"
    with source_path.open("wb") as fp:
        shutil.copyfileobj(file.file, fp)

    job = Job(id=job_id, file_name=file.filename, source_path=str(source_path))
    with LOCK:
        JOBS[job_id] = job
        _save_jobs()

    thread = threading.Thread(target=_run_job, args=(job_id, source_path), daemon=True)
    thread.start()

    return {"id": job_id, "status": "queued"}


@app.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"id": job.id, "status": job.status, "error": job.error}


@app.get("/jobs/{job_id}/result")
def get_job_result(job_id: str) -> dict:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "completed" or not job.result_path:
        raise HTTPException(status_code=409, detail="Result is not ready yet")
    path = Path(job.result_path)
    if not path.exists():
        raise HTTPException(status_code=500, detail="Result file missing")
    return json.loads(path.read_text())
