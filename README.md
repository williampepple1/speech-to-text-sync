# Speech-to-Text Sync & Audio Editor

A powerful, local-first web application that allows you to transcribe audio, visually align spoken words with the audio waveform, and export the customized audio segment complete with synchronized captions.

## Features

- **Accurate Transcription**: Powered by `faster-whisper` for fast, highly accurate word-level timestamping.
- **Visual Audio Editor**: Utilizes `wavesurfer.js` to display an interactive audio waveform.
- **Word-Level Alignment**: Each transcribed word creates an interactive region on the waveform, allowing you to drag and fine-tune exactly when a word starts and ends.
- **Audio Trimming**: Create a master region to easily cut out a specific segment of the audio.
- **Rich Exports**: 
  - **MP3**: Embeds the synced words natively into the file's ID3 tags as Synchronized Lyrics (SYLT), enabling karaoke-style playback in supported media players.
  - **WAV/MP3**: Automatically generates `.srt` and `.vtt` subtitle files for universal compatibility.

## Prerequisites

- **Python 3.10+**
- **FFmpeg**: Must be installed and available in your system's PATH. This is required by `pydub` to process audio files.

## Installation

1. **Clone the repository:**
   ```cmd
   git clone https://github.com/williampepple1/speech-to-text-sync.git
   cd speech-to-text-sync
   ```

2. **Create a virtual environment:**
   ```cmd
   python -m venv venv
   .\venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```cmd
   pip install -r requirements.txt
   ```

## Usage

1. **Start the application:**
   Run the provided batch script to launch the FastAPI server:
   ```cmd
   .\run.bat
   ```
   *(Alternatively, run: `uvicorn main:app --reload --host 0.0.0.0 --port 8000`)*

2. **Open the App:**
   Navigate to [http://localhost:8000](http://localhost:8000) in your web browser.

3. **Workflow:**
   - **Upload**: Drag and drop an audio file (MP3, WAV, M4A).
   - **Transcribe**: Click "Transcribe & Align" to let Whisper process the audio.
   - **Edit**: Adjust the blue regions on the waveform to fix any slight misalignment of specific words. Drag the purple master region to define the start and end of the audio you want to export.
   - **Export**: Choose your desired format (MP3 or WAV) and click Export. You will download a ZIP file containing the trimmed audio and its accompanying synchronized text files.

## Docker Usage

You can also run the application using Docker to avoid manual dependency setup.

1. **Build the Docker Image:**
   ```cmd
   docker build -t speech-to-text-sync .
   ```

2. **Run the Container:**
   ```cmd
   docker run -p 8000:8000 speech-to-text-sync
   ```

3. **Open the App:**
   Navigate to [http://localhost:8000](http://localhost:8000) in your web browser.

## Technologies Used

- **Backend**: Python, FastAPI, Uvicorn
- **Audio Processing**: Pydub, Mutagen (for ID3 SYLT tags)
- **Machine Learning**: Faster-Whisper (runs locally on CPU)
- **Frontend**: Vanilla HTML/CSS/JS, Wavesurfer.js (v7)
