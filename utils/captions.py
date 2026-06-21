import os
from mutagen.id3 import ID3, SYLT, Encoding, ID3NoHeaderError

def format_time_srt(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds - int(seconds)) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

def format_time_vtt(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds - int(seconds)) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"

def generate_srt(words: list, output_path: str):
    """
    words is a list of dicts: [{'word': 'hello', 'start': 0.0, 'end': 0.5}]
    """
    with open(output_path, 'w', encoding='utf-8') as f:
        for i, w in enumerate(words):
            start_str = format_time_srt(w['start'])
            end_str = format_time_srt(w['end'])
            f.write(f"{i+1}\n")
            f.write(f"{start_str} --> {end_str}\n")
            f.write(f"{w['word'].strip()}\n\n")
    return output_path

def generate_vtt(words: list, output_path: str):
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write("WEBVTT\n\n")
        for i, w in enumerate(words):
            start_str = format_time_vtt(w['start'])
            end_str = format_time_vtt(w['end'])
            f.write(f"{i+1}\n")
            f.write(f"{start_str} --> {end_str}\n")
            f.write(f"{w['word'].strip()}\n\n")
    return output_path

def embed_sylt_mp3(mp3_path: str, words: list):
    """
    Embeds Synchronized Lyrics/Text (SYLT) into an MP3 file.
    """
    try:
        tags = ID3(mp3_path)
    except ID3NoHeaderError:
        tags = ID3()

    # Create the SYLT tag
    # SYLT format expects a list of tuples: (text, time_in_milliseconds)
    # Type 1 is usually for lyrics
    sylt_text = []
    for w in words:
        start_ms = int(w['start'] * 1000)
        sylt_text.append((w['word'].strip(), start_ms))
    
    # Add a final tuple for the end of the last word if needed, but standard is just start times
    
    sylt_tag = SYLT(
        encoding=Encoding.UTF8,
        lang='eng',
        format=2, # 2 means milliseconds
        type=1, # 1 means lyrics
        desc='karaoke',
        text=sylt_text
    )
    
    # Remove existing SYLT tags to avoid duplicates
    tags.delall('SYLT')
    tags.add(sylt_tag)
    tags.save(mp3_path, v2_version=4)
