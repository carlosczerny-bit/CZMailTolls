import { useState, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const FFMPEG_CORE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
const SEGMENT_SECONDS = 60;

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function parseDuration(logs) {
  for (const line of logs) {
    const m = line.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
    if (m) return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
  }
  return 0;
}

export default function VideoSplitter() {
  const [phase, setPhase] = useState('idle');
  const [segments, setSegments] = useState([]);
  const [statusText, setStatusText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [dragging, setDragging] = useState(false);
  const ffmpegRef = useRef(null);
  const fileInputRef = useRef(null);

  const getFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    const ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }) => {
      if (message.length < 120) setStatusText(message);
    });
    setStatusText('Descargando motor de video (~30MB), aguantá un momento...');
    await ffmpeg.load({
      coreURL: await toBlobURL(`${FFMPEG_CORE_URL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${FFMPEG_CORE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  };

  const processFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|mov|avi|mkv|webm|m4v|3gp)$/i)) {
      alert('Por favor seleccioná un archivo de video (MP4, MOV, AVI, MKV, etc.)');
      return;
    }

    segments.forEach(s => URL.revokeObjectURL(s.url));
    setSegments([]);
    setFileName(file.name);
    setFileSize(file.size);
    setProgress({ current: 0, total: 0 });
    setPhase('loading');

    try {
      const ffmpeg = await getFFmpeg();
      setPhase('processing');
      setStatusText('Cargando video...');

      const ext = file.name.includes('.')
        ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
        : '.mp4';
      const inputName = `input${ext}`;
      await ffmpeg.writeFile(inputName, await fetchFile(file));

      // Probe duration by running ffmpeg without output (fails but logs metadata)
      setStatusText('Analizando duración del video...');
      const probeLogs = [];
      const captureLog = ({ message }) => probeLogs.push(message);
      ffmpeg.on('log', captureLog);
      await ffmpeg.exec(['-i', inputName]).catch(() => {});
      ffmpeg.off('log', captureLog);

      const videoDuration = parseDuration(probeLogs);
      if (videoDuration === 0) {
        throw new Error('No se pudo leer la duración. Verificá que sea un video válido.');
      }

      const numSegments = Math.ceil(videoDuration / SEGMENT_SECONDS);
      setProgress({ current: 0, total: numSegments });

      // Extract each segment individually using seek + duration
      const results = [];
      for (let i = 0; i < numSegments; i++) {
        const segNum = i + 1;
        setStatusText(`Cortando parte ${segNum} de ${numSegments}...`);
        setProgress({ current: segNum, total: numSegments });

        const start = i * SEGMENT_SECONDS;
        const outName = `seg_${String(i).padStart(3, '0')}.mp4`;

        await ffmpeg.exec([
          '-ss', String(start),
          '-i', inputName,
          '-t', String(SEGMENT_SECONDS),
          '-c', 'copy',
          '-avoid_negative_ts', 'make_zero',
          outName,
        ]);

        const data = await ffmpeg.readFile(outName);
        const blob = new Blob([data], { type: 'video/mp4' });
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        results.push({
          index: segNum,
          size: blob.size,
          url: URL.createObjectURL(blob),
          filename: `${baseName}_parte_${String(segNum).padStart(2, '0')}.mp4`,
        });
        await ffmpeg.deleteFile(outName);
      }

      await ffmpeg.deleteFile(inputName);

      if (results.length === 0) {
        throw new Error('No se generaron segmentos. Verificá que el archivo sea un video válido.');
      }

      setSegments(results);
      setPhase('done');
    } catch (err) {
      console.error(err);
      setPhase('error');
      setStatusText(err.message || 'Error desconocido al procesar el video.');
    }
  };

  const handleFileChange = (e) => processFile(e.target.files?.[0]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    processFile(e.dataTransfer.files?.[0]);
  };

  const reset = () => {
    segments.forEach(s => URL.revokeObjectURL(s.url));
    setSegments([]);
    setPhase('idle');
    setFileName('');
    setStatusText('');
    setProgress({ current: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isProcessing = phase === 'loading' || phase === 'processing';
  const progressPct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#020817', fontFamily: "'Segoe UI', system-ui, sans-serif", color: '#e2e8f0' }}>
      {/* Header */}
      <div style={{ background: '#0f172a', borderBottom: '1px solid #1e293b', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '36px', height: '36px', background: 'linear-gradient(135deg, #e1306c, #c13584)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
          ✂️
        </div>
        <div>
          <div style={{ fontWeight: '700', fontSize: '15px', color: '#f1f5f9' }}>CZ Splitter</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Dividí tu video en partes de 60 seg para Instagram</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: '10px', color: '#1e3a5f', fontFamily: 'monospace' }}>
          build {__APP_BUILD__}
        </div>
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px' }}>

        {/* Drop zone */}
        {phase === 'idle' && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? '#e1306c' : '#334155'}`,
              borderRadius: '16px',
              padding: '60px 24px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragging ? 'rgba(225,48,108,0.06)' : '#0f172a',
              transition: 'all 0.2s',
              userSelect: 'none',
            }}
          >
            <div style={{ fontSize: '52px', marginBottom: '16px' }}>🎬</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#f1f5f9', marginBottom: '8px' }}>
              Seleccioná tu video
            </div>
            <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px', lineHeight: '1.6' }}>
              Arrastrá el archivo acá o tocá para seleccionar<br />
              <span style={{ fontSize: '12px', color: '#475569' }}>MP4, MOV, AVI, MKV, WebM...</span>
            </div>
            <button style={{ background: 'linear-gradient(135deg, #e1306c, #c13584)', border: 'none', color: 'white', fontSize: '15px', fontWeight: '600', padding: '12px 28px', borderRadius: '10px', cursor: 'pointer' }}>
              Elegir video
            </button>
            <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileChange} style={{ display: 'none' }} />
          </div>
        )}

        {/* Processing */}
        {isProcessing && (
          <div style={{ textAlign: 'center', padding: '48px 24px', background: '#0f172a', borderRadius: '16px', border: '1px solid #1e293b' }}>
            <div style={{ fontSize: '44px', marginBottom: '16px' }}>
              {phase === 'loading' ? '⏳' : '✂️'}
            </div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', marginBottom: '8px' }}>
              {phase === 'loading' ? 'Cargando motor de video...' : (
                progress.total > 0
                  ? `Cortando parte ${progress.current} de ${progress.total}...`
                  : 'Procesando...'
              )}
            </div>
            <div style={{ fontSize: '12px', color: '#475569', marginBottom: '20px', minHeight: '16px', padding: '0 16px', wordBreak: 'break-all', lineHeight: '1.5' }}>
              {statusText}
            </div>

            {/* Progress bar */}
            <div style={{ background: '#1e293b', borderRadius: '999px', height: '6px', overflow: 'hidden', maxWidth: '300px', margin: '0 auto' }}>
              {progress.total > 0 ? (
                <div style={{
                  height: '100%',
                  width: `${progressPct}%`,
                  background: 'linear-gradient(90deg, #e1306c, #c13584)',
                  borderRadius: '999px',
                  transition: 'width 0.3s ease',
                }} />
              ) : (
                <div style={{
                  height: '100%',
                  width: '35%',
                  background: 'linear-gradient(90deg, #e1306c, #c13584)',
                  borderRadius: '999px',
                  animation: 'slide 1.4s ease-in-out infinite',
                }} />
              )}
            </div>

            {progress.total > 0 && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#334155' }}>
                {progressPct}%
              </div>
            )}

            {fileName && (
              <div style={{ marginTop: '16px', fontSize: '12px', color: '#334155' }}>
                {fileName} · {formatSize(fileSize)}
              </div>
            )}
            <style>{`@keyframes slide { 0%{transform:translateX(-200%)} 100%{transform:translateX(750%)} }`}</style>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div style={{ textAlign: 'center', padding: '48px 24px', background: '#0f172a', borderRadius: '16px', border: '1px solid #450a0a' }}>
            <div style={{ fontSize: '44px', marginBottom: '16px' }}>❌</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#fca5a5', marginBottom: '10px' }}>Error al procesar</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '24px', maxWidth: '380px', margin: '0 auto 24px', lineHeight: '1.6' }}>
              {statusText}
            </div>
            <button onClick={reset} style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', cursor: 'pointer', fontSize: '13px', padding: '8px 20px', borderRadius: '8px' }}>
              Intentar de nuevo
            </button>
          </div>
        )}

        {/* Done */}
        {phase === 'done' && segments.length > 0 && (
          <div>
            <div style={{ marginBottom: '16px', padding: '16px 20px', background: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: '#4ade80' }}>
                  ✅ {segments.length} {segments.length === 1 ? 'parte lista' : 'partes listas'}
                </div>
                <div style={{ fontSize: '12px', color: '#475569', marginTop: '3px' }}>
                  {fileName} · {formatSize(segments.reduce((a, s) => a + s.size, 0))} total
                </div>
              </div>
              <button onClick={reset} style={{ background: 'none', border: '1px solid #334155', color: '#64748b', cursor: 'pointer', fontSize: '12px', padding: '8px 14px', borderRadius: '8px', whiteSpace: 'nowrap' }}>
                ↺ Nuevo video
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {segments.map(seg => (
                <div key={seg.index} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '38px', height: '38px', background: 'rgba(225,48,108,0.1)', border: '1px solid rgba(225,48,108,0.3)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', color: '#e1306c', flexShrink: 0 }}>
                      {seg.index}
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#f1f5f9' }}>Parte {seg.index}</div>
                      <div style={{ fontSize: '11px', color: '#475569' }}>{formatSize(seg.size)} · hasta 60 seg</div>
                    </div>
                  </div>
                  <a href={seg.url} download={seg.filename} style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', textDecoration: 'none', fontSize: '12px', fontWeight: '500', padding: '7px 14px', borderRadius: '6px', whiteSpace: 'nowrap', display: 'inline-block' }}>
                    ↓ Descargar
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
