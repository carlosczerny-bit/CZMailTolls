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

  // Transcription state
  const [txPhase, setTxPhase] = useState('idle'); // idle | loading | extracting | transcribing | done | error
  const [txStatus, setTxStatus] = useState('');
  const [txText, setTxText] = useState('');
  const [copied, setCopied] = useState(false);

  const ffmpegRef = useRef(null);
  const fileInputRef = useRef(null);
  const selectedFileRef = useRef(null);
  const transcriberRef = useRef(null);

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
    setTxPhase('idle');
    setTxText('');
    selectedFileRef.current = file;
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

      const baseName = file.name.replace(/\.[^/.]+$/, '');
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

  const transcribe = async () => {
    const file = selectedFileRef.current;
    const ffmpeg = ffmpegRef.current;
    if (!file || !ffmpeg) return;

    setTxPhase('loading');
    setTxStatus('Preparando modelo Whisper...');

    try {
      if (!transcriberRef.current) {
        const { pipeline, env } = await import('@xenova/transformers');
        env.allowLocalModels = false;
        setTxStatus('Descargando modelo de transcripción (~40MB, solo la primera vez)...');
        transcriberRef.current = await pipeline(
          'automatic-speech-recognition',
          'Xenova/whisper-tiny',
          {
            quantized: true,
            progress_callback: ({ status, progress }) => {
              if (status === 'downloading') {
                setTxStatus(`Descargando modelo... ${Math.round(progress || 0)}%`);
              }
            },
          }
        );
      }

      setTxPhase('extracting');
      setTxStatus('Extrayendo audio del video...');

      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '.mp4';
      const tmpIn = `tx${ext}`;
      await ffmpeg.writeFile(tmpIn, await fetchFile(file));
      await ffmpeg.exec(['-i', tmpIn, '-vn', '-ar', '16000', '-ac', '1', '-f', 'wav', 'tx_audio.wav']);
      const wavData = await ffmpeg.readFile('tx_audio.wav');
      await ffmpeg.deleteFile('tx_audio.wav');
      await ffmpeg.deleteFile(tmpIn);

      const audioUrl = URL.createObjectURL(new Blob([wavData], { type: 'audio/wav' }));

      setTxPhase('transcribing');
      setTxStatus('Transcribiendo... puede tardar unos minutos según el largo del video');

      const result = await transcriberRef.current(audioUrl, {
        language: 'spanish',
        task: 'transcribe',
        chunk_length_s: 30,
        stride_length_s: 5,
      });

      URL.revokeObjectURL(audioUrl);

      const text = result.text?.trim() || result.chunks?.map(c => c.text).join(' ').trim() || '';
      setTxText(text);
      setTxPhase('done');
    } catch (err) {
      console.error(err);
      setTxPhase('error');
      setTxStatus(err.message || 'Error al transcribir');
    }
  };

  const copyText = () => {
    navigator.clipboard.writeText(txText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    setTxPhase('idle');
    setTxText('');
    selectedFileRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isProcessing = phase === 'loading' || phase === 'processing';
  const progressPct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const txIsRunning = txPhase === 'loading' || txPhase === 'extracting' || txPhase === 'transcribing';

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
          {__APP_VERSION__}
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
                progress.total > 0 ? `Cortando parte ${progress.current} de ${progress.total}...` : 'Procesando...'
              )}
            </div>
            <div style={{ fontSize: '12px', color: '#475569', marginBottom: '20px', minHeight: '16px', padding: '0 16px', wordBreak: 'break-all', lineHeight: '1.5' }}>
              {statusText}
            </div>
            <div style={{ background: '#1e293b', borderRadius: '999px', height: '6px', overflow: 'hidden', maxWidth: '300px', margin: '0 auto' }}>
              {progress.total > 0 ? (
                <div style={{ height: '100%', width: `${progressPct}%`, background: 'linear-gradient(90deg, #e1306c, #c13584)', borderRadius: '999px', transition: 'width 0.3s ease' }} />
              ) : (
                <div style={{ height: '100%', width: '35%', background: 'linear-gradient(90deg, #e1306c, #c13584)', borderRadius: '999px', animation: 'slide 1.4s ease-in-out infinite' }} />
              )}
            </div>
            {progress.total > 0 && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#334155' }}>{progressPct}%</div>
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

        {/* Done — segments */}
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
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

            {/* Transcription panel */}
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: txPhase !== 'idle' ? '1px solid #1e293b' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#f1f5f9' }}>Transcripción de audio</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Whisper · corre en tu dispositivo · gratis</div>
                </div>
                {txPhase === 'idle' && (
                  <button
                    onClick={transcribe}
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', border: 'none', color: 'white', fontSize: '13px', fontWeight: '600', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Transcribir
                  </button>
                )}
                {txPhase === 'done' && (
                  <button
                    onClick={copyText}
                    style={{ background: copied ? '#166534' : '#1e293b', border: '1px solid #334155', color: copied ? '#4ade80' : '#e2e8f0', fontSize: '12px', padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s' }}
                  >
                    {copied ? '✓ Copiado' : 'Copiar texto'}
                  </button>
                )}
                {txPhase === 'error' && (
                  <button onClick={() => setTxPhase('idle')} style={{ background: 'none', border: '1px solid #334155', color: '#64748b', fontSize: '12px', padding: '7px 14px', borderRadius: '6px', cursor: 'pointer' }}>
                    Reintentar
                  </button>
                )}
              </div>

              {/* Running */}
              {txIsRunning && (
                <div style={{ padding: '28px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px', lineHeight: '1.6' }}>
                    {txPhase === 'loading' && '🔄 '}
                    {txPhase === 'extracting' && '🎵 '}
                    {txPhase === 'transcribing' && '📝 '}
                    {txStatus}
                  </div>
                  <div style={{ background: '#1e293b', borderRadius: '999px', height: '4px', overflow: 'hidden', maxWidth: '240px', margin: '0 auto' }}>
                    <div style={{ height: '100%', width: '40%', background: 'linear-gradient(90deg, #7c3aed, #4f46e5)', borderRadius: '999px', animation: 'slide 1.4s ease-in-out infinite' }} />
                  </div>
                </div>
              )}

              {/* Result */}
              {txPhase === 'done' && (
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: '14px', lineHeight: '1.8', color: '#cbd5e1', whiteSpace: 'pre-wrap', maxHeight: '320px', overflowY: 'auto' }}>
                    {txText || '(Sin texto detectado)'}
                  </div>
                </div>
              )}

              {/* Error */}
              {txPhase === 'error' && (
                <div style={{ padding: '16px 20px', fontSize: '13px', color: '#fca5a5', lineHeight: '1.6' }}>
                  {txStatus}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
