# Triagex Frontend

Dynamic, hackathon-ready frontend for the multi-agent clinical triage backend.

## Stack
- **Vite + React 18 + TypeScript**
- **Tailwind CSS** (custom design tokens, dark clinical-teal theme)
- **Recharts** for simulation metrics
- **Framer Motion** for transitions
- **Lucide** icons

## Prerequisites
The backend must be running on `http://127.0.0.1:8000`. From the backend folder:
```powershell
cd ..\backend
.\.venv\Scripts\python.exe run_api.py
```

## Install
From this folder (`triage_system/frontend`):
```powershell
npm install
```

## Run
```powershell
npm run dev
```
Open <http://localhost:5173>.

Vite proxies `/api/*` and `/health` to `http://127.0.0.1:8000`, so no CORS configuration is required for development.

## Build for production
```powershell
npm run build
npm run preview
```

## Pages
| Route | What it does |
|---|---|
| Dashboard | Live health, session stats, one-click full smoke test (form → ocr → sim → detail → metrics) |
| Triage | Patient form with sample scenarios (mild/moderate/critical), priority + confidence + full audit log + per-agent breakdown |
| OCR Queue | Submit extraction payloads, list pending documents |
| Simulation | Configure & run hospital sim, view bottlenecks, wait-time chart, utilization chart, event timeline |
| Architecture | Pipeline diagram + endpoint reference + stack badges |
