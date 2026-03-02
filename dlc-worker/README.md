# DeepLabCut Local Worker

This folder contains a local API worker that runs DeepLabCut inference jobs and returns normalized frame-by-frame keypoints for the VeloLens frontend.

## What this does

- Accepts a video upload from the app (`POST /jobs`)
- Runs DeepLabCut analysis in the background
- Converts DLC CSV output to normalized JSON keypoints
- Serves status + result to the app (`GET /jobs/:id`, `GET /jobs/:id/result`)

## Prerequisites

- A trained DeepLabCut project/model
- GPU/CUDA recommended for faster inference

## Setup (recommended: Conda / Miniforge)

DeepLabCut has native dependencies (notably `tables`) that are unreliable with plain `pip` on some macOS setups. Use conda-forge packages to avoid compiler issues.

1. Install Miniforge (if needed):

```bash
/opt/homebrew/bin/brew install miniforge
```

2. Create and activate environment:

```bash
cd dlc-worker
conda env create -f environment.yml
conda activate velolens-dlc
```

3. Start worker:

```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

## Setup (fallback: venv + pip)

Use this only if conda is unavailable.

1. Create a virtualenv:

```bash
cd dlc-worker
python -m venv .venv
source .venv/bin/activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Put your DLC model config at:

`dlc-worker/models/cycling-sideview/config.yaml`

If you use a different location, edit `DLC_CONFIG_PATH` in `app.py`.

4. Start worker:

```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

## API

- `GET /health`
- `POST /jobs` (multipart form with `file`)
- `GET /jobs/{job_id}`
- `GET /jobs/{job_id}/result`

## Notes

- Results are stored in `dlc-worker/data/results/<job-id>/result.json`.
- Uploaded videos are stored in `dlc-worker/data/uploads/`.
- The frontend defaults to `http://localhost:8000`.
