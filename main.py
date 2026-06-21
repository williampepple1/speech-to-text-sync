import os
import json
import shutil
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import uuid


# Utilities
from utils.audio import cut_audio
from utils.captions import generate_srt, generate_vtt, embed_sylt_mp3

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create dirs if they don't exist
os.makedirs("uploads", exist_ok=True)
os.makedirs("exports", exist_ok=True)


# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_root():
    return FileResponse("static/index.html")

@app.post("/upload")
async def upload_audio(file: UploadFile = File(...)):
    ext = file.filename.split(".")[-1]
    file_id = str(uuid.uuid4())
    filename = f"{file_id}.{ext}"
    filepath = os.path.join("uploads", filename)
    
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"file_id": file_id, "filename": filename, "filepath": filepath}


class ExportRequest(BaseModel):
    filepath: str
    words: List[dict]
    start_time: float
    end_time: float
    export_format: str # "mp3" or "wav"

class RegionExportItem(BaseModel):
    name: str
    filepath: str
    words: List[dict]
    start_time: float
    end_time: float
    export_format: str

class ExportAllRequest(BaseModel):
    regions: List[RegionExportItem]


def _process_region(region: RegionExportItem, zipf, subfolder: str):
    """Process a single region and write its files into a zip subfolder."""
    import zipfile as _zf
    file_id = str(uuid.uuid4())

    adjusted_words = []
    for w in region.words:
        if w['start'] >= region.start_time and w['end'] <= region.end_time:
            adjusted_words.append({
                "word": w["word"],
                "start": w["start"] - region.start_time,
                "end": w["end"] - region.start_time
            })

    output_audio_path = os.path.join("exports", f"{file_id}.{region.export_format}")
    cut_audio(region.filepath, output_audio_path, int(region.start_time * 1000), int(region.end_time * 1000), region.export_format)

    files_to_add = []

    if region.export_format == "mp3":
        embed_sylt_mp3(output_audio_path, adjusted_words)
        files_to_add.append((output_audio_path, f"audio.{region.export_format}"))

    srt_path = os.path.join("exports", f"{file_id}.srt")
    vtt_path = os.path.join("exports", f"{file_id}.vtt")
    generate_srt(adjusted_words, srt_path)
    generate_vtt(adjusted_words, vtt_path)
    files_to_add.extend([(srt_path, "captions.srt"), (vtt_path, "captions.vtt")])

    if region.export_format == "wav":
        files_to_add.append((output_audio_path, f"audio.{region.export_format}"))

    for src_path, arc_name in files_to_add:
        zipf.write(src_path, f"{subfolder}/{arc_name}")


@app.post("/export")
async def export_audio(req: ExportRequest):
    if not os.path.exists(req.filepath):
        return JSONResponse(status_code=404, content={"error": "File not found"})

    file_id = str(uuid.uuid4())

    adjusted_words = []
    for w in req.words:
        if w['start'] >= req.start_time and w['end'] <= req.end_time:
            adjusted_words.append({
                "word": w["word"],
                "start": w["start"] - req.start_time,
                "end": w["end"] - req.start_time
            })

    output_audio_path = os.path.join("exports", f"{file_id}.{req.export_format}")
    cut_audio(req.filepath, output_audio_path, int(req.start_time * 1000), int(req.end_time * 1000), req.export_format)

    files_to_return = []

    if req.export_format == "mp3":
        embed_sylt_mp3(output_audio_path, adjusted_words)
        files_to_return.append(output_audio_path)

    srt_path = os.path.join("exports", f"{file_id}.srt")
    vtt_path = os.path.join("exports", f"{file_id}.vtt")
    generate_srt(adjusted_words, srt_path)
    generate_vtt(adjusted_words, vtt_path)
    files_to_return.extend([srt_path, vtt_path])

    import zipfile
    zip_path = os.path.join("exports", f"{file_id}.zip")
    with zipfile.ZipFile(zip_path, 'w') as zipf:
        for f in files_to_return:
            zipf.write(f, os.path.basename(f))

    return {"download_url": f"/download/{file_id}.zip"}


@app.post("/export-all")
async def export_all(req: ExportAllRequest):
    import zipfile
    zip_id = str(uuid.uuid4())
    zip_path = os.path.join("exports", f"{zip_id}.zip")

    with zipfile.ZipFile(zip_path, 'w') as zipf:
        for i, region in enumerate(req.regions):
            if not os.path.exists(region.filepath):
                continue
            safe_name = region.name.replace("/", "_").replace("\\", "_") or f"region_{i+1}"
            _process_region(region, zipf, safe_name)

    return {"download_url": f"/download/{zip_id}.zip"}

@app.get("/download/{filename}")
async def download_file(filename: str):
    filepath = os.path.join("exports", filename)
    if os.path.exists(filepath):
         return FileResponse(filepath, media_type='application/zip', filename=filename)
    return JSONResponse(status_code=404, content={"error": "File not found"})

@app.get("/serve_upload/{filename}")
async def serve_upload(filename: str):
    filepath = os.path.join("uploads", filename)
    if os.path.exists(filepath):
        return FileResponse(filepath)
    return JSONResponse(status_code=404, content={"error": "File not found"})
