// ── DOM References ──────────────────────────────────────────────────────────
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('audioUpload');
const waveformContainer = document.getElementById('waveform');
const controls = document.getElementById('controls');
const editorLayout = document.getElementById('editorLayout');
const playBtn = document.getElementById('playBtn');
const addTrimRegionBtn = document.getElementById('addTrimRegionBtn');
const exportAllBtn = document.getElementById('exportAllBtn');
const exportAllLoader = document.getElementById('exportAllLoader');
const regionList = document.getElementById('regionList');
const regionDetailPanel = document.getElementById('regionDetailPanel');
const detailPlaceholder = document.getElementById('detailPlaceholder');
const detailContent = document.getElementById('detailContent');
const regionNameInput = document.getElementById('regionNameInput');
const manualTextInput = document.getElementById('manualTextInput');
const generateRegionsBtn = document.getElementById('generateRegionsBtn');
const transcriptionPanel = document.getElementById('transcriptionPanel');
const exportFormat = document.getElementById('exportFormat');
const exportBtn = document.getElementById('exportBtn');
const exportLoader = document.getElementById('exportLoader');

// ── State ───────────────────────────────────────────────────────────────────
let wavesurfer = null;
let wsRegions = null;
let currentFilepath = null;
let currentFilename = null;

// trimRegions: Map<regionId, { name, words, color, wsRegion }>
const trimRegions = new Map();
let selectedRegionId = null;
let regionCounter = 0;

const TRIM_COLORS = [
    'rgba(139, 92, 246, 0.25)',  // purple
    'rgba(59, 130, 246, 0.25)',  // blue
    'rgba(16, 185, 129, 0.25)', // green
    'rgba(245, 158, 11, 0.25)', // amber
    'rgba(239, 68, 68, 0.25)',  // red
    'rgba(236, 72, 153, 0.25)', // pink
];

const TRIM_BORDER_COLORS = [
    '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'
];

// ── Wavesurfer Init ─────────────────────────────────────────────────────────
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

    wsRegions = wavesurfer.registerPlugin(WaveSurfer.Regions.create());

    wavesurfer.on('play', () => {
        playBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg> Pause';
    });
    wavesurfer.on('pause', () => {
        playBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Play';
    });

    wavesurfer.on('timeupdate', (currentTime) => {
        if (!selectedRegionId) return;
        const regionData = trimRegions.get(selectedRegionId);
        if (!regionData) return;
        const spans = document.querySelectorAll('.word-span');
        spans.forEach(span => span.classList.remove('active'));
        const idx = regionData.words.findIndex(w => currentTime >= w.start && currentTime <= w.end);
        if (idx !== -1) {
            const span = document.getElementById(`word-${selectedRegionId}-${idx}`);
            if (span) span.classList.add('active');
        }
    });

    // Update word boundaries when a word region is dragged/resized
    wsRegions.on('region-updated', (region) => {
        if (!region.id.startsWith('word-')) return;
        const parts = region.id.split('-');
        // id format: word-<trimRegionId>-<index>
        const trimId = parts.slice(1, parts.length - 1).join('-');
        const idx = parseInt(parts[parts.length - 1]);
        const regionData = trimRegions.get(trimId);
        if (regionData && regionData.words[idx]) {
            regionData.words[idx].start = region.start;
            regionData.words[idx].end = region.end;
        }
    });

    // Clicking a trim region selects it
    wsRegions.on('region-clicked', (region, e) => {
        e.stopPropagation();
        if (region.id.startsWith('trim-')) {
            selectRegion(region.id);
        }
    });
}

// ── File Upload ──────────────────────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary)'; });
dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'var(--border-color)'; });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--border-color)';
    if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFileUpload(e.target.files[0]); });

async function handleFileUpload(file) {
    const formData = new FormData();
    formData.append('file', file);
    dropZone.querySelector('h2').innerText = 'Uploading...';
    try {
        const res = await fetch('/upload', { method: 'POST', body: formData });
        const data = await res.json();
        currentFilepath = data.filepath;
        currentFilename = data.filename;

        dropZone.style.display = 'none';
        waveformContainer.style.display = 'block';
        controls.style.display = 'flex';
        editorLayout.style.display = 'grid';

        initWavesurfer();
        wavesurfer.load(`/serve_upload/${data.filename}`);
    } catch (err) {
        console.error(err);
        alert('Upload failed');
        dropZone.querySelector('h2').innerText = 'Drop audio file here or click to upload';
    }
}

// ── Playback ─────────────────────────────────────────────────────────────────
playBtn.addEventListener('click', () => { if (wavesurfer) wavesurfer.playPause(); });

// ── Add Trim Region ──────────────────────────────────────────────────────────
addTrimRegionBtn.addEventListener('click', () => {
    if (!wavesurfer) return;
    regionCounter++;
    const id = `trim-${Date.now()}`;
    const colorIdx = (regionCounter - 1) % TRIM_COLORS.length;
    const duration = wavesurfer.getDuration() || 60;
    const segLen = Math.min(10, duration / 4);
    const start = Math.max(0, (duration / 2) - (segLen / 2) + (regionCounter - 1) * 2);
    const end = Math.min(duration, start + segLen);

    const wsRegion = wsRegions.addRegion({
        id,
        start,
        end,
        color: TRIM_COLORS[colorIdx],
        drag: true,
        resize: true,
    });

    trimRegions.set(id, {
        name: `Region ${regionCounter}`,
        words: [],
        color: TRIM_BORDER_COLORS[colorIdx],
        wsRegion,
    });

    renderRegionList();
    selectRegion(id);
    exportAllBtn.disabled = false;
});

// ── Region List ───────────────────────────────────────────────────────────────
function renderRegionList() {
    regionList.innerHTML = '';
    if (trimRegions.size === 0) {
        regionList.innerHTML = '<p class="empty-hint">Click "Add Trim Region" to start.</p>';
        return;
    }
    trimRegions.forEach((data, id) => {
        const item = document.createElement('div');
        item.className = 'region-list-item' + (id === selectedRegionId ? ' selected' : '');
        item.id = `list-item-${id}`;
        item.innerHTML = `
            <span class="region-color-dot" style="background:${data.color}"></span>
            <span class="region-item-name">${data.name}</span>
            <button class="region-delete-btn" data-id="${id}" title="Delete region">✕</button>
        `;
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('region-delete-btn')) return;
            selectRegion(id);
        });
        regionList.appendChild(item);
    });

    // Attach delete listeners
    regionList.querySelectorAll('.region-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteRegion(btn.dataset.id);
        });
    });
}

function deleteRegion(id) {
    const data = trimRegions.get(id);
    if (!data) return;
    // Remove all waveform regions belonging to this trim region
    wsRegions.getRegions().filter(r => r.id === id || r.id.startsWith(`word-${id}-`)).forEach(r => r.remove());
    trimRegions.delete(id);
    if (selectedRegionId === id) {
        selectedRegionId = null;
        showDetailPanel(null);
    }
    renderRegionList();
    if (trimRegions.size === 0) exportAllBtn.disabled = true;
}

// ── Select Region ─────────────────────────────────────────────────────────────
function selectRegion(id) {
    selectedRegionId = id;
    const data = trimRegions.get(id);
    if (!data) return;

    // Highlight in list
    document.querySelectorAll('.region-list-item').forEach(el => el.classList.remove('selected'));
    const listItem = document.getElementById(`list-item-${id}`);
    if (listItem) listItem.classList.add('selected');

    // Populate detail panel
    showDetailPanel(data);
}

function showDetailPanel(data) {
    if (!data) {
        detailPlaceholder.style.display = 'flex';
        detailContent.style.display = 'none';
        return;
    }
    detailPlaceholder.style.display = 'none';
    detailContent.style.display = 'flex';

    regionNameInput.value = data.name;
    manualTextInput.value = data.words.map(w => w.word).join(' ');
    exportBtn.disabled = data.words.length === 0;
    renderWordsForRegion(selectedRegionId);
}

// ── Name Change ───────────────────────────────────────────────────────────────
regionNameInput.addEventListener('input', () => {
    if (!selectedRegionId) return;
    const data = trimRegions.get(selectedRegionId);
    if (data) {
        data.name = regionNameInput.value || `Region`;
        renderRegionList();
    }
});

// ── Generate Word Regions ────────────────────────────────────────────────────
generateRegionsBtn.addEventListener('click', () => {
    if (!selectedRegionId) return;
    const text = manualTextInput.value.trim();
    if (!text) { alert('Please enter some text first.'); return; }

    const data = trimRegions.get(selectedRegionId);
    if (!data) return;

    const wsRegion = data.wsRegion;
    const regionStart = wsRegion.start;
    const regionEnd = wsRegion.end;
    const duration = regionEnd - regionStart;

    const words = text.split(/\s+/);
    const slotDuration = duration / words.length;

    data.words = words.map((w, i) => ({
        word: w,
        start: regionStart + i * slotDuration,
        end: regionStart + (i + 1) * slotDuration - 0.05,
    }));

    // Remove old word regions for this trim region
    wsRegions.getRegions().filter(r => r.id.startsWith(`word-${selectedRegionId}-`)).forEach(r => r.remove());

    // Add new word regions
    data.words.forEach((w, i) => {
        wsRegions.addRegion({
            id: `word-${selectedRegionId}-${i}`,
            start: w.start,
            end: w.end,
            color: 'rgba(255, 255, 255, 0.12)',
            drag: true,
            resize: true,
        });
    });

    renderWordsForRegion(selectedRegionId);
    exportBtn.disabled = false;
});

function renderWordsForRegion(id) {
    const data = trimRegions.get(id);
    transcriptionPanel.innerHTML = '';
    if (!data || data.words.length === 0) {
        transcriptionPanel.style.display = 'none';
        return;
    }
    transcriptionPanel.style.display = 'block';
    data.words.forEach((w, index) => {
        const span = document.createElement('span');
        span.className = 'word-span';
        span.id = `word-${id}-${index}`;
        span.innerText = w.word;
        span.addEventListener('click', () => { wavesurfer.setTime(w.start); wavesurfer.play(); });
        transcriptionPanel.appendChild(span);
        transcriptionPanel.appendChild(document.createTextNode(' '));
    });
}

// ── Export Single Region ──────────────────────────────────────────────────────
exportBtn.addEventListener('click', async () => {
    if (!selectedRegionId) return;
    const data = trimRegions.get(selectedRegionId);
    if (!data || !currentFilepath) return;

    exportBtn.disabled = true;
    exportLoader.style.display = 'block';
    exportBtn.querySelector('span').innerText = 'Processing...';

    const wsRegion = data.wsRegion;
    const payload = {
        filepath: currentFilepath,
        words: data.words,
        start_time: wsRegion.start,
        end_time: wsRegion.end,
        export_format: exportFormat.value,
    };

    try {
        const res = await fetch('/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (result.download_url) {
            const a = document.createElement('a');
            a.href = result.download_url;
            a.download = '';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } else {
            alert('Export failed: No download URL');
        }
    } catch (err) {
        console.error(err);
        alert('Export failed');
    } finally {
        exportBtn.disabled = false;
        exportLoader.style.display = 'none';
        exportBtn.querySelector('span').innerText = 'Export This Region';
    }
});

// ── Export All Regions ────────────────────────────────────────────────────────
exportAllBtn.addEventListener('click', async () => {
    if (trimRegions.size === 0 || !currentFilepath) return;

    exportAllBtn.disabled = true;
    exportAllLoader.style.display = 'block';
    exportAllBtn.querySelector('span').innerText = 'Processing...';

    const regions = [];
    trimRegions.forEach((data, id) => {
        regions.push({
            name: data.name,
            filepath: currentFilepath,
            words: data.words,
            start_time: data.wsRegion.start,
            end_time: data.wsRegion.end,
            export_format: exportFormat.value,
        });
    });

    try {
        const res = await fetch('/export-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ regions }),
        });
        const result = await res.json();
        if (result.download_url) {
            const a = document.createElement('a');
            a.href = result.download_url;
            a.download = '';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } else {
            alert('Export failed: No download URL');
        }
    } catch (err) {
        console.error(err);
        alert('Export all failed');
    } finally {
        exportAllBtn.disabled = false;
        exportAllLoader.style.display = 'none';
        exportAllBtn.querySelector('span').innerText = 'Export All Regions';
    }
});
