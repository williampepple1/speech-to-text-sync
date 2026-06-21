const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('audioUpload');
const waveformContainer = document.getElementById('waveform');
const controls = document.getElementById('controls');
const playBtn = document.getElementById('playBtn');
const generateRegionsBtn = document.getElementById('generateRegionsBtn');
const manualTextInput = document.getElementById('manualTextInput');
const exportBtn = document.getElementById('exportBtn');
const exportLoader = document.getElementById('exportLoader');
const transcriptionPanel = document.getElementById('transcriptionPanel');
const exportFormat = document.getElementById('exportFormat');

let wavesurfer = null;
let wsRegions = null;
let currentFilepath = null;
let wordData = [];

// Initialize Wavesurfer
function initWavesurfer() {
    if (wavesurfer) wavesurfer.destroy();
    
    wavesurfer = WaveSurfer.create({
        container: '#waveform',
        waveColor: 'rgba(59, 130, 246, 0.4)',
        progressColor: '#3b82f6',
        cursorColor: '#8b5cf6',
        barWidth: 2,
        barRadius: 2,
        cursorWidth: 2,
        height: 128,
        barGap: 2,
        normalize: true,
    });

    // Initialize Regions plugin
    wsRegions = wavesurfer.registerPlugin(WaveSurfer.Regions.create());

    wavesurfer.on('play', () => {
        playBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg> Pause';
    });

    wavesurfer.on('pause', () => {
        playBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Play';
    });

    wavesurfer.on('timeupdate', (currentTime) => {
        // Highlight active word
        const spans = document.querySelectorAll('.word-span');
        spans.forEach(span => span.classList.remove('active'));
        
        const activeWordIndex = wordData.findIndex(w => currentTime >= w.start && currentTime <= w.end);
        if (activeWordIndex !== -1) {
            const activeSpan = document.getElementById(`word-${activeWordIndex}`);
            if (activeSpan) {
                activeSpan.classList.add('active');
                // Auto-scroll logic could go here
            }
        }
    });

    wsRegions.on('region-updated', (region) => {
        // Update word boundaries if it's a word region
        if (region.id.startsWith('word-')) {
            const index = parseInt(region.id.split('-')[1]);
            if (wordData[index]) {
                wordData[index].start = region.start;
                wordData[index].end = region.end;
            }
        }
    });
}

// File Upload Logic
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--primary)';
});

dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = 'var(--border-color)';
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--border-color)';
    if (e.dataTransfer.files.length) {
        handleFileUpload(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFileUpload(e.target.files[0]);
    }
});

async function handleFileUpload(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    dropZone.querySelector('h2').innerText = 'Uploading...';
    
    try {
        const res = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        currentFilepath = data.filepath;
        
        // Hide upload, show player
        dropZone.style.display = 'none';
        waveformContainer.style.display = 'block';
        controls.style.display = 'flex';
        
        initWavesurfer();
        wavesurfer.load(`/serve_upload/${data.filename}`);
        
    } catch (err) {
        console.error(err);
        alert('Upload failed');
        dropZone.querySelector('h2').innerText = 'Drop audio file here or click to upload';
    }
}

playBtn.addEventListener('click', () => {
    if (wavesurfer) {
        wavesurfer.playPause();
    }
});

generateRegionsBtn.addEventListener('click', () => {
    if (!currentFilepath) return;
    
    const text = manualTextInput.value.trim();
    if (!text) {
        alert('Please enter some text first.');
        return;
    }
    
    const words = text.split(/\s+/);
    wordData = [];
    
    let currentStart = 0;
    
    words.forEach((w) => {
        wordData.push({
            word: w,
            start: currentStart,
            end: currentStart + 0.5
        });
        currentStart += 0.6; // 0.1s gap between default blocks
    });
    
    renderWords();
    renderRegions();
    
    exportBtn.disabled = false;
});

function renderWords() {
    transcriptionPanel.style.display = 'block';
    transcriptionPanel.innerHTML = '';
    
    wordData.forEach((w, index) => {
        const span = document.createElement('span');
        span.className = 'word-span';
        span.id = `word-${index}`;
        span.innerText = w.word;
        
        span.addEventListener('click', () => {
            wavesurfer.setTime(w.start);
            wavesurfer.play();
        });
        
        transcriptionPanel.appendChild(span);
        // Add space
        transcriptionPanel.appendChild(document.createTextNode(' '));
    });
}

function renderRegions() {
    wsRegions.clearRegions();
    
    // Create a main selection region covering all words, for cutting
    const minStart = Math.min(...wordData.map(w => w.start));
    const maxEnd = Math.max(...wordData.map(w => w.end));
    
    wsRegions.addRegion({
        id: 'cut-region',
        start: minStart,
        end: maxEnd,
        color: 'rgba(139, 92, 246, 0.1)', // Subtle accent color
        drag: false,
        resize: true
    });

    // Create regions for each word
    wordData.forEach((w, index) => {
        wsRegions.addRegion({
            id: `word-${index}`,
            start: w.start,
            end: w.end,
            color: 'rgba(59, 130, 246, 0.2)', // Primary color
            drag: true,
            resize: true
        });
    });
}

exportBtn.addEventListener('click', async () => {
    if (!currentFilepath || !wordData.length) return;
    
    exportBtn.disabled = true;
    exportLoader.style.display = 'block';
    exportBtn.querySelector('span').innerText = 'Processing...';
    
    const cutRegion = wsRegions.getRegions().find(r => r.id === 'cut-region');
    const startTime = cutRegion ? cutRegion.start : 0;
    const endTime = cutRegion ? cutRegion.end : wavesurfer.getDuration();
    
    const payload = {
        filepath: currentFilepath,
        words: wordData,
        start_time: startTime,
        end_time: endTime,
        export_format: exportFormat.value
    };
    
    try {
        const res = await fetch('/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        if (data.download_url) {
            window.location.href = data.download_url;
        } else {
            alert('Export failed: No download URL');
        }
    } catch (err) {
        console.error(err);
        alert('Export failed');
    } finally {
        exportBtn.disabled = false;
        exportLoader.style.display = 'none';
        exportBtn.querySelector('span').innerText = 'Export Audio & Captions';
    }
});
