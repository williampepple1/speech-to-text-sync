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

@app.post("/export")
async def export_audio(req: ExportRequest):
    if not os.path.exists(req.filepath):
        return JSONResponse(status_code=404, content={"error": "File not found"})
        
    file_id = str(uuid.uuid4())
    
    # Adjust words relative to the new start_time
    adjusted_words = []
    for w in req.words:
        if w['start'] >= req.start_time and w['end'] <= req.end_time:
            adjusted_words.append({
                "word": w["word"],
                "start": w["start"] - req.start_time,
                "end": w["end"] - req.start_time
            })
            
    output_audio_path = os.path.join("exports", f"{file_id}.{req.export_format}")
    
    # Cut audio (convert to ms)
    cut_audio(req.filepath, output_audio_path, int(req.start_time * 1000), int(req.end_time * 1000), req.export_format)
    
    files_to_return = []
    
    if req.export_format == "mp3":
        embed_sylt_mp3(output_audio_path, adjusted_words)
        files_to_return.append(output_audio_path)
    
    # Always generate SRT and VTT just in case, but especially for WAV
    srt_path = os.path.join("exports", f"{file_id}.srt")
    vtt_path = os.path.join("exports", f"{file_id}.vtt")
    generate_srt(adjusted_words, srt_path)
    generate_vtt(adjusted_words, vtt_path)
    
    files_to_return.extend([srt_path, vtt_path])
    
    # Create a zip file containing the audio and subtitles
    import zipfile
    zip_path = os.path.join("exports", f"{file_id}.zip")
    with zipfile.ZipFile(zip_path, 'w') as zipf:
        for f in files_to_return:
            zipf.write(f, os.path.basename(f))
            
    return {"download_url": f"/download/{file_id}.zip"}

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
