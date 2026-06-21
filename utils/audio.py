import os
from pydub import AudioSegment

def cut_audio(input_path: str, output_path: str, start_ms: int, end_ms: int, format: str = "mp3") -> str:
    """
    Cuts the audio file from start_ms to end_ms and exports to the specified format.
    """
    # Load audio
    audio = AudioSegment.from_file(input_path)
    
    # Cut audio
    cut = audio[start_ms:end_ms]
    
    # Export audio
    cut.export(output_path, format=format)
    
    return output_path
