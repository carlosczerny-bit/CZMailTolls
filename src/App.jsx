import { useState } from 'react';
import EmailBuilder from './EmailBuilder';
import VideoSplitter from './VideoSplitter';

const TOOLS = [
  { id: 'video', label: 'Video Splitter', icon: '✂️', sub: 'Instagram · 60 seg' },
  { id: 'email', label: 'Email Builder', icon: '✉️', sub: 'Sendy + SES' },
];

export default function App() {
  const [active, setActive] = useState('video');

  return (
    <div style={{ minHeight: '100vh', background: '#020817', display: 'flex', flexDirection: 'column' }}>
      {/* Top nav */}
      <div style={{
        background: '#0f172a',
        borderBottom: '1px solid #1e293b',
        padding: '10px 16px',
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
      }}>
        {TOOLS.map(tool => (
          <button
            key={tool.id}
            onClick={() => setActive(tool.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'Segoe UI', system-ui, sans-serif",
              fontSize: '13px',
              fontWeight: '600',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
              background: active === tool.id
                ? (tool.id === 'video' ? 'linear-gradient(135deg,#e1306c,#c13584)' : 'linear-gradient(135deg,#1d4ed8,#7c3aed)')
                : '#1e293b',
              color: active === tool.id ? 'white' : '#94a3b8',
            }}
          >
            <span style={{ fontSize: '16px' }}>{tool.icon}</span>
            <span>{tool.label}</span>
          </button>
        ))}
      </div>

      {/* Tool content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {active === 'video' && <VideoSplitter />}
        {active === 'email' && <EmailBuilder />}
      </div>
    </div>
  );
}
