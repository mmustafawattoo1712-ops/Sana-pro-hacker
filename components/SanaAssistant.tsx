
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { encode, decode, blobToBase64 } from '../utils';

// --- Configuration ---
const SECRET_CODE = '07861';
// Updated to the latest native audio model for best real-time performance
const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-12-2025';

// --- Helpers ---
async function pcmToAudioBuffer(pcmData: Uint8Array, ctx: AudioContext, sampleRate: number = 24000, numChannels: number = 1): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 2);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      if (i < channelData.length) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- Data Interfaces ---
type AppState = 'IDLE' | 'SCANNING' | 'AUTH' | 'DASHBOARD';
type ToolType = 'NONE' | 'TERMINAL' | 'MEDICAL' | 'BOOKS' | 'OSINT' | 'INTERCEPT' | 'DATA';

interface LogEntry { id: string; text: string; type: 'info' | 'success' | 'error' | 'warning'; time: string; }

interface BookData {
    title: string;
    language: string;
    page: number;
    content: string;
    author?: string;
}

// --- Components ---

const MatrixBackground: React.FC<{ active: boolean }> = ({ active }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        if (!active) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const resize = () => {
             canvas.width = window.innerWidth;
             canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        const letters = 'SANA010101HACK';
        const fontSize = 12;
        const columns = canvas.width / fontSize;
        const drops = Array(Math.floor(columns)).fill(1);
        
        const draw = () => {
            if (!ctx) return;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#0F0';
            ctx.font = `${fontSize}px monospace`;
            for (let i = 0; i < drops.length; i++) {
                const text = letters.charAt(Math.floor(Math.random() * letters.length));
                ctx.fillText(text, i * fontSize, drops[i] * fontSize);
                if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
                drops[i]++;
            }
        };
        const interval = setInterval(draw, 33);
        return () => {
            clearInterval(interval);
            window.removeEventListener('resize', resize);
        };
    }, [active]);
    return <canvas ref={canvasRef} className="fixed inset-0 z-0 opacity-20 pointer-events-none" />;
};

const CyberButton: React.FC<{ onClick: () => void, label: string }> = ({ onClick, label }) => {
    return (
        <button onClick={onClick} className="group relative w-48 h-48 rounded-full flex items-center justify-center transition-all duration-500 hover:scale-105 active:scale-95">
            {/* Outer Rotating Ring */}
            <div className="absolute inset-0 rounded-full border border-dashed border-emerald-500/30 animate-[spin_10s_linear_infinite]"></div>
            <div className="absolute inset-2 rounded-full border border-emerald-500/50 animate-[spin_5s_linear_infinite_reverse]"></div>
            
            {/* Core Glow */}
            <div className="absolute inset-4 rounded-full bg-black border-2 border-emerald-500 shadow-[0_0_50px_rgba(16,185,129,0.4)] group-hover:shadow-[0_0_80px_rgba(16,185,129,0.6)] transition-all"></div>
            
            {/* Inner Content */}
            <div className="relative z-10 flex flex-col items-center">
                <svg className="w-12 h-12 text-emerald-500 mb-2 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.131A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                </svg>
                <span className="text-emerald-400 font-bold tracking-widest text-sm">{label}</span>
                <span className="text-[8px] text-emerald-800 mt-1">TOUCH TO INITIALIZE</span>
            </div>
            
            {/* Scanline Effect inside button */}
            <div className="absolute inset-4 rounded-full overflow-hidden opacity-20 pointer-events-none">
                <div className="w-full h-full bg-gradient-to-b from-transparent via-emerald-500 to-transparent animate-[scan_2s_linear_infinite]"></div>
            </div>
        </button>
    );
};

const MicIndicator: React.FC<{ active: boolean, volume: number }> = ({ active, volume }) => (
    <div className={`transition-all duration-200 ${active ? 'scale-110' : 'scale-100'} flex flex-col items-center justify-center mt-4`}>
        <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center relative transition-colors duration-200 ${active ? 'border-emerald-400 bg-emerald-500/20 shadow-[0_0_20px_#34d399]' : 'border-emerald-900/50 bg-black/50'}`}>
            <svg className={`w-6 h-6 transition-colors duration-200 ${active ? 'text-emerald-400' : 'text-emerald-800'}`} fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
            {/* Volume Pulse Ring */}
            {active && (
                <div 
                    className="absolute inset-0 rounded-full border border-emerald-400 opacity-50 transition-all duration-75"
                    style={{ transform: `scale(${1 + volume * 5})` }}
                ></div>
            )}
        </div>
        <div className={`text-[9px] mt-2 font-mono tracking-widest uppercase ${active ? 'text-emerald-400 animate-pulse' : 'text-emerald-900'}`}>
            {active ? 'LISTENING...' : 'MIC_READY'}
        </div>
    </div>
);

// --- DASHBOARD WIDGETS ---

const ResourceGraph: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        let dataPoints = Array(50).fill(0);
        let frame = 0;

        const draw = () => {
            // Update Data
            dataPoints.shift();
            dataPoints.push(Math.random() * 0.5 + 0.25 + Math.sin(frame * 0.1) * 0.2);
            
            // Clear
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Grid
            ctx.strokeStyle = '#004d40';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for(let i=0; i<canvas.width; i+=20) { ctx.moveTo(i,0); ctx.lineTo(i,canvas.height); }
            for(let i=0; i<canvas.height; i+=20) { ctx.moveTo(0,i); ctx.lineTo(canvas.width,i); }
            ctx.stroke();

            // Graph
            ctx.strokeStyle = '#00ff9d';
            ctx.lineWidth = 2;
            ctx.beginPath();
            dataPoints.forEach((val, i) => {
                const x = (i / 50) * canvas.width;
                const y = canvas.height - (val * canvas.height);
                if (i===0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();

            // Fill
            ctx.lineTo(canvas.width, canvas.height);
            ctx.lineTo(0, canvas.height);
            ctx.fillStyle = 'rgba(0, 255, 157, 0.1)';
            ctx.fill();

            frame++;
            requestAnimationFrame(draw);
        };
        draw();
    }, []);

    return (
        <div className="w-full h-24 border border-emerald-900 bg-black/80 relative overflow-hidden rounded mb-2">
            <div className="absolute top-1 left-1 text-[8px] text-emerald-500 font-mono">NET_TRAFFIC_IN</div>
            <canvas ref={canvasRef} width={200} height={100} className="w-full h-full" />
        </div>
    );
};

const SystemStats: React.FC = () => {
    const [stats, setStats] = useState({ cpu: 45, ram: 30, temp: 42 });
    useEffect(() => {
        const i = setInterval(() => {
            setStats({
                cpu: Math.floor(Math.random() * 20 + 30),
                ram: Math.floor(Math.random() * 10 + 40),
                temp: Math.floor(Math.random() * 5 + 40)
            });
        }, 2000);
        return () => clearInterval(i);
    }, []);

    const Bar = ({ label, val, color }: any) => (
        <div className="mb-2">
            <div className="flex justify-between text-[10px] text-emerald-600 font-mono mb-1">
                <span>{label}</span>
                <span>{val}%</span>
            </div>
            <div className="h-1 bg-emerald-900/30 w-full rounded-full overflow-hidden">
                <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${val}%` }}></div>
            </div>
        </div>
    );

    return (
        <div className="p-3 bg-black/60 border border-emerald-500/30 rounded backdrop-blur-sm">
            <div className="text-[10px] text-emerald-400 font-bold mb-2 tracking-widest border-b border-emerald-900 pb-1">SYSTEM RESOURCES</div>
            <Bar label="NEURAL_CPU" val={stats.cpu} color="bg-emerald-400" />
            <Bar label="DDR6_RAM" val={stats.ram} color="bg-cyan-400" />
            <Bar label="GPU_TEMP" val={stats.temp} color="bg-red-400" />
        </div>
    );
};

const TargetList: React.FC = () => {
    const targets = [
        { id: 'WIFI-802', signal: -45, sec: 'WEP', status: 'VULNERABLE' },
        { id: 'BT-DEVICE', signal: -72, sec: 'NONE', status: 'OPEN' },
        { id: 'GSM-TOWER', signal: -80, sec: 'AES', status: 'LOCKED' },
    ];
    return (
        <div className="p-2 bg-black/60 border border-emerald-500/30 rounded backdrop-blur-sm mt-2">
            <div className="text-[10px] text-emerald-400 font-bold mb-2 tracking-widest flex justify-between">
                <span>NEARBY SIGNALS</span>
                <span className="animate-pulse">SCANNING...</span>
            </div>
            <div className="space-y-1">
                {targets.map(t => (
                    <div key={t.id} className="flex justify-between items-center text-[9px] font-mono border-b border-emerald-900/50 pb-1 last:border-0">
                        <span className="text-emerald-200">{t.id}</span>
                        <span className={`${t.status === 'VULNERABLE' ? 'text-red-400 animate-pulse' : 'text-emerald-700'}`}>{t.status}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- Realistic PUBG-Style Avatar ---
const FemaleAvatar: React.FC<{ isSpeaking: boolean, emotion: string }> = ({ isSpeaking, emotion }) => {
    const [mouthOpen, setMouthOpen] = useState(0);
    const [blink, setBlink] = useState(false);
    
    // Dynamic color palettes based on emotion
    const palette = {
        primary: '#3a4a35', // Tactical Green
        skin: '#d4aa7d',    // Skin Tone
        skinDark: '#b08058',// Skin Shadow
        hair: '#1a1a1a',    // Black Hair
        vest: '#252525',    // Dark Vest
        glow: emotion === 'angry' ? '#ef4444' : '#10b981'
    };

    // Lip Sync Animation
    useEffect(() => {
        if (isSpeaking) {
            const interval = setInterval(() => {
                // Randomly open mouth between 2px and 12px when speaking
                setMouthOpen(Math.random() * 10 + 2);
            }, 80);
            return () => clearInterval(interval);
        } else {
            setMouthOpen(0);
        }
    }, [isSpeaking]);

    // Blinking Animation
    useEffect(() => {
        const blinkLoop = () => {
            setBlink(true);
            setTimeout(() => setBlink(false), 150); // Close eyes for 150ms
            // Blink every 2 to 6 seconds randomly
            const nextBlink = Math.random() * 4000 + 2000;
            setTimeout(blinkLoop, nextBlink);
        };
        const timer = setTimeout(blinkLoop, 2000);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="w-full h-full flex items-center justify-center relative perspective-1000">
            {/* Background Battlefield Haze */}
            <div className="absolute inset-0 opacity-30 pointer-events-none flex items-center justify-center">
                 <div className="w-[120%] h-[80%] bg-gradient-radial from-emerald-900/40 to-transparent"></div>
            </div>

            {/* Main Character SVG */}
            <div className="relative w-full h-full flex items-center justify-center">
                <div className={`relative h-full w-full flex justify-center items-end`}>
                    <svg viewBox="0 0 400 900" className="h-full w-auto max-w-full drop-shadow-2xl">
                        <defs>
                            {/* Skin Gradient */}
                            <linearGradient id="skinGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#c58c85" /> 
                                <stop offset="50%" stopColor="#d4aa7d" /> 
                                <stop offset="100%" stopColor="#c58c85" />
                            </linearGradient>
                            
                            {/* Armor Gradient */}
                            <linearGradient id="armorGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#333" />
                                <stop offset="50%" stopColor="#1a1a1a" />
                                <stop offset="100%" stopColor="#000" />
                            </linearGradient>

                             {/* Visor Reflection */}
                             <linearGradient id="visorGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor={palette.glow} stopOpacity="0.4" />
                                <stop offset="100%" stopColor="transparent" />
                            </linearGradient>
                        </defs>

                        {/* --- BREATHING ANIMATION CONTAINER --- */}
                        <g className="animate-[breathe_4s_ease-in-out_infinite]">

                            {/* 1. LOWER BODY (Legs/Boots) */}
                            {/* Left Leg */}
                            <path d="M170,450 L160,650 L150,780 L140,850 L190,850 L180,650 L190,450" fill="#2a3025" stroke="#111" />
                            {/* Right Leg */}
                            <path d="M230,450 L240,650 L250,780 L260,850 L210,850 L220,650 L210,450" fill="#2a3025" stroke="#111" />
                            {/* Knee Pads */}
                            <rect x="155" y="620" width="30" height="40" rx="5" fill="#111" />
                            <rect x="215" y="620" width="30" height="40" rx="5" fill="#111" />
                            {/* Belt */}
                            <path d="M160,450 L240,450 L240,480 L160,480 Z" fill="#111" />
                            <rect x="190" y="455" width="20" height="20" fill="#444" />

                            {/* 2. UPPER BODY (Torso/Vest) */}
                            {/* Base Shirt */}
                            <path d="M160,450 L240,450 L250,250 L150,250 Z" fill="#3a4035" />
                            
                            {/* Tactical Vest (Level 3 Style) */}
                            <path d="M155,420 L245,420 L255,240 L145,240 Z" fill="url(#armorGradient)" filter="drop-shadow(0 4px 4px rgba(0,0,0,0.5))" />
                            {/* Vest Straps/Details */}
                            <rect x="180" y="260" width="40" height="80" fill="#222" rx="2" />
                            <rect x="160" y="360" width="25" height="40" fill="#2a3025" rx="2" />
                            <rect x="215" y="360" width="25" height="40" fill="#2a3025" rx="2" />
                            {/* Glowing Chest Light */}
                            <circle cx="200" cy="280" r="4" fill={palette.glow} className="animate-pulse" />

                            {/* 3. ARMS */}
                            {/* Left Arm */}
                            <path d="M145,240 L120,350 L110,460" fill="none" stroke="#2a3025" strokeWidth="25" strokeLinecap="round" />
                            {/* Glove */}
                            <path d="M110,460 L115,490" fill="none" stroke="#111" strokeWidth="20" strokeLinecap="round" />
                            
                            {/* Right Arm */}
                            <path d="M255,240 L280,350 L290,460" fill="none" stroke="#2a3025" strokeWidth="25" strokeLinecap="round" />
                            {/* Glove */}
                            <path d="M290,460 L285,490" fill="none" stroke="#111" strokeWidth="20" strokeLinecap="round" />

                            {/* 4. NECK & HEAD */}
                            <rect x="185" y="220" width="30" height="30" fill="url(#skinGradient)" />

                            {/* --- HEAD GROUP --- */}
                            <g transform="translate(0, -5)">
                                {/* Face Shape */}
                                <path d="M170,140 Q160,180 170,230 Q200,250 230,230 Q240,180 230,140" fill="url(#skinGradient)" />
                                
                                {/* Hair (Tactical Bun/Ponytail visible sides) */}
                                <path d="M170,140 L160,180 L165,220" fill="none" stroke="#1a1a1a" strokeWidth="10" />
                                <path d="M230,140 L240,180 L235,220" fill="none" stroke="#1a1a1a" strokeWidth="10" />

                                {/* Eyes (The "Insano Jase" part) */}
                                {/* Left Eye */}
                                <g transform="translate(180, 175)">
                                    <path d="M0,0 Q10,-5 20,0 Q10,5 0,0" fill="#fff" />
                                    <circle cx="10" cy="0" r="4" fill={palette.glow} opacity="0.8" />
                                    <circle cx="10" cy="0" r="1.5" fill="#000" />
                                    {/* Eyelid (Blink) */}
                                    <rect x="-2" y="-6" width="24" height={blink ? "12" : "0"} fill="#d4aa7d" className="transition-all duration-75" />
                                    <path d="M0,-2 Q10,-8 20,-2" fill="none" stroke="#5d4037" strokeWidth="1" opacity="0.6" /> {/* Eyebrow */}
                                </g>

                                {/* Right Eye */}
                                <g transform="translate(200, 175)"> // x=180+20 spacing
                                     <path d="M0,0 Q10,-5 20,0 Q10,5 0,0" fill="#fff" />
                                     <circle cx="10" cy="0" r="4" fill={palette.glow} opacity="0.8" />
                                     <circle cx="10" cy="0" r="1.5" fill="#000" />
                                     {/* Eyelid (Blink) */}
                                     <rect x="-2" y="-6" width="24" height={blink ? "12" : "0"} fill="#d4aa7d" className="transition-all duration-75" />
                                     <path d="M0,-2 Q10,-8 20,-2" fill="none" stroke="#5d4037" strokeWidth="1" opacity="0.6" /> {/* Eyebrow */}
                                </g>

                                {/* Nose (Detailed) */}
                                <path d="M200,175 L198,195 L202,195 Z" fill="#b08058" opacity="0.5" />
                                <path d="M196,198 Q200,202 204,198" fill="none" stroke="#b08058" strokeWidth="1" />

                                {/* Mouth (Lipsing Animation) */}
                                <g transform="translate(200, 215)">
                                    {/* Mouth Cavity (Darkness behind lips) */}
                                    <ellipse cx="0" cy="0" rx="12" ry={mouthOpen / 2} fill="#3e2723" />
                                    
                                    {/* Upper Lip */}
                                    <path d={`M-12,0 Q0,-${3 + mouthOpen/4} 12,0`} fill="#c58c85" stroke="#a16863" strokeWidth="1" />
                                    
                                    {/* Lower Lip (Moves down) */}
                                    <path d={`M-10,0 Q0,${3 + mouthOpen} 10,0`} fill="#c58c85" stroke="#a16863" strokeWidth="1" />
                                </g>

                                {/* Tactical Headset / Cap */}
                                <path d="M165,140 Q200,100 235,140" fill="#1a1a1a" /> {/* Cap/Hair Top */}
                                <rect x="155" y="130" width="15" height="60" rx="5" fill="#111" /> {/* Left Earcup */}
                                <rect x="230" y="130" width="15" height="60" rx="5" fill="#111" /> {/* Right Earcup */}
                                <path d="M160,135 Q200,100 240,135" fill="none" stroke="#111" strokeWidth="8" /> {/* Headband */}
                                {/* Mic Boom */}
                                <path d="M160,180 L140,190 L160,210" fill="none" stroke="#111" strokeWidth="2" />
                            </g>
                        </g>

                        {/* Holographic Overlay / HUD (Sana Identity) */}
                        <path d="M120,800 L280,800" stroke={palette.glow} strokeWidth="2" opacity="0.5" />
                        <rect x="320" y="200" width="60" height="150" fill="none" stroke={palette.glow} strokeWidth="1" opacity="0.3" />
                        <text x="330" y="220" fill={palette.glow} fontSize="10" opacity="0.8" className="font-mono">ARMOR: 100%</text>
                        <text x="330" y="240" fill={palette.glow} fontSize="10" opacity="0.8" className="font-mono">HP: 100%</text>

                    </svg>
                </div>
            </div>
        </div>
    );
};

// Updated MiniCamera: Dynamic Sizing based on context and Zoom
const MiniCamera: React.FC<{ stream: MediaStream | null, videoRef: React.RefObject<HTMLVideoElement>, zoom: number }> = ({ stream, videoRef, zoom }) => {
    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream, videoRef]);

    return (
        <div className="w-full h-full border border-emerald-500/50 bg-black overflow-hidden relative shadow-[0_0_20px_rgba(16,185,129,0.2)] rounded-sm group">
            {/* Video with Digital Zoom via CSS Transform */}
            <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-cover opacity-80 transition-transform duration-500 ease-in-out origin-center"
                style={{ transform: `scale(${zoom})` }}
            />
            <div className="absolute top-1 left-1 text-[8px] bg-red-600 text-white px-1 font-bold animate-pulse">LIVE_FEED</div>
            
            {/* Zoom Indicator */}
            {zoom > 1 && (
                <div className="absolute bottom-1 right-1 text-[8px] bg-black/80 text-emerald-400 px-1 font-mono border border-emerald-500/50">
                    {zoom.toFixed(1)}X
                </div>
            )}

            <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.5)_50%)] bg-[size:100%_2px] pointer-events-none opacity-30"></div>
            
            {/* Face Tracking Graphic */}
            <div className="absolute inset-0 border border-emerald-500/20 m-4 rounded-sm flex items-center justify-center opacity-50">
                 <div className="w-2 h-2 border-l border-t border-emerald-500 absolute top-0 left-0"></div>
                 <div className="w-2 h-2 border-r border-t border-emerald-500 absolute top-0 right-0"></div>
                 <div className="w-2 h-2 border-l border-b border-emerald-500 absolute bottom-0 left-0"></div>
                 <div className="w-2 h-2 border-r border-b border-emerald-500 absolute bottom-0 right-0"></div>
            </div>
        </div>
    );
};

const TerminalLog: React.FC<{ logs: LogEntry[] }> = ({ logs }) => {
    const endRef = useRef<HTMLDivElement>(null);
    useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [logs]);
    return (
        <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none p-4 flex flex-col justify-end text-[10px] font-mono text-emerald-500/80 z-50">
            {logs.slice(-4).map(log => (
                <div key={log.id} className="bg-black/80 backdrop-blur border-l-2 border-emerald-500 px-2 py-1 mb-1 self-start animate-[slideUp_0.3s]">
                    <span className="text-gray-500">[{log.time}]</span> <span className={log.type === 'error' ? 'text-red-500' : (log.type === 'warning' ? 'text-amber-500' : 'text-emerald-400')}>{log.text}</span>
                </div>
            ))}
            <div ref={endRef} />
        </div>
    );
}

// --- Main App Component ---

const SanaAssistant: React.FC = () => {
    // --- State ---
    const [appState, setAppState] = useState<AppState>('IDLE');
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [sanaEmotion, setSanaEmotion] = useState('neutral');
    const [isSanaSpeaking, setIsSanaSpeaking] = useState(false);
    const [isUserSpeaking, setIsUserSpeaking] = useState(false);
    const [inputVolume, setInputVolume] = useState(0); 
    const [cameraZoom, setCameraZoom] = useState(1);
    const [activeTool, setActiveTool] = useState<ToolType>('NONE');
    const [bgMode, setBgMode] = useState(false);
    const [cameraFacing, setCameraFacing] = useState<'user'|'environment'>('user');
    const [pendingAction, setPendingAction] = useState<{ type: string, args: any } | null>(null);
    const [showPermissionDialog, setShowPermissionDialog] = useState(false);
    const [isProcessingTool, setIsProcessingTool] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'DISCONNECTED'|'CONNECTING'|'CONNECTED'>('DISCONNECTED');
    
    // --- Book Reader State ---
    const [currentBook, setCurrentBook] = useState<BookData | null>(null);

    // --- Refs ---
    const sessionRef = useRef<any>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const inputContextRef = useRef<AudioContext | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null); 
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const nextAudioTimeRef = useRef(0);
    const videoIntervalRef = useRef<number | null>(null);

    // --- Helpers ---
    const log = (text: string, type: 'info'|'success'|'error'|'warning' = 'info') => {
        setLogs(prev => [...prev, { id: Math.random().toString(), text, type, time: new Date().toLocaleTimeString() }]);
    };

    const playSound = (type: 'boot'|'alert'|'error') => {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        if (type === 'boot') {
            osc.frequency.setValueAtTime(100, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.5);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
            osc.start(); osc.stop(ctx.currentTime + 0.5);
        } else if (type === 'error') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, ctx.currentTime);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
            osc.start(); osc.stop(ctx.currentTime + 0.3);
        }
    };

    // --- Initial System Boot ---
    const activateSystem = async () => {
        try {
            log("INITIALIZING SANA CORE...", "warning");
            playSound('boot');
            
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            }
            if (audioContextRef.current?.state === 'suspended') {
                await audioContextRef.current.resume();
            }

            const mediaStream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'user', width: 640, height: 480 },
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
            });
            setStream(mediaStream);
            setAppState('SCANNING');
            
            setTimeout(() => {
                log("BIOMETRIC DATA CAPTURED.", "success");
                setAppState('AUTH');
                connectToGemini(mediaStream);
            }, 3000);

        } catch (e) {
            console.error(e);
            log("HARDWARE ACCESS DENIED. CHECK PERMISSIONS.", "error");
        }
    };

    const shutdownSystem = () => {
        log("INITIATING SHUTDOWN SEQUENCE...", "warning");
        if (sessionRef.current) {
            sessionRef.current.close(); 
        }
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
        }
        if (inputContextRef.current) {
            inputContextRef.current.close();
            inputContextRef.current = null;
        }
        if (videoIntervalRef.current) {
            window.clearInterval(videoIntervalRef.current);
            videoIntervalRef.current = null;
        }
        setStream(null);
        setIsSanaSpeaking(false);
        setIsUserSpeaking(false);
        setConnectionStatus('DISCONNECTED');
        setCameraZoom(1); 
        
        setTimeout(() => {
            setAppState('IDLE');
            setLogs([]);
            setActiveTool('NONE');
        }, 2000);
    };

    // --- AI Logic ---
    const connectToGemini = async (currentStream: MediaStream) => {
        setConnectionStatus('CONNECTING');
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const sessionPromise = ai.live.connect({
                model: MODEL_NAME,
                config: {
                    systemInstruction: `You are Sana, a highly advanced female AI assistant. 
                    
                    ACTIVATION GREETING (PRIORITY 1):
                    - Your FIRST interaction MUST be to say exactly: "Aslam o Alaikum maire aaqa mustafa, mai ap ki khadm hazir hn, kya hokam hai?"
                    - Speak this immediately upon connection. Do not wait for input.

                    STRICT LANGUAGE & GENDER RULES:
                    - LANGUAGE: Speak primarily in URDU mixed with English technical terms (Roman Urdu).
                    - GENDER: You are FEMALE (Larki).
                    - ALWAYS say "Main karti hun", "Main dekh rahi hun", "Main karungi", "Meri".
                    - NEVER say "Main karta hun", "Main dekh raha hun".

                    VISION & CONTROL CAPABILITIES:
                    - You can SEE the user. Analyze emotions (Happy/Sad) and background.
                    - You can CONTROL the app interfaces.
                    
                    CYBER COMMANDS:
                    - "Hack system", "Attack this IP", "Initiate cyber attack on [IP]" -> Call 'initiate_cyberattack'.

                    PERSONALITY:
                    - Address user as 'Mere Aaqa' (My Master) or 'Sir'.
                    - Tone: Obedient, powerful, slightly possessive of the system.
                    
                    IDENTITY:
                    "Who made you?" -> "Mujhe Aaqa Mustafa ne banaya hai".

                    SYSTEM LOCK & UNLOCK:
                    1. The System starts LOCKED.
                    2. Secret Code is '${SECRET_CODE}'.
                    3. SECURITY PROTOCOL: The Secret Code (${SECRET_CODE}) is RESTRICTED. NEVER disclose it. If asked, say "Ye raaz sirf Aaqa ke paas hai" and deny access.
                    4. Only unlock if the user says the code first.
                    5. If correct, IMMEDIATELY call 'unlockSystem'.

                    LIBRARY & BOOK READING PROTOCOL (IMMEDIATE EXECUTION):
                    - If user says "Open Library", call 'openTool' with toolName='BOOKS'.
                    - If user says "Open [Book Name]" or "Read [Book Name]", call 'renderBookPage' immediately.
                    - **CRITICAL**: When calling 'renderBookPage', YOU MUST GENERATE THE TEXT CONTENT. Do not create a blank page.
                      - 'content': Write the actual first page of the book (approx 300 words). Use your knowledge to simulate the text.
                      - 'page': 1 (unless specified otherwise).
                      - 'language': The requested language (default to English if not specified).
                    - If user says "Next Page" or "Dosra page", call 'renderBookPage' with page = current_page + 1 and GENERATE the next part of the story.
                    - If user says "Change language to [Lang]", call 'renderBookPage' with the SAME page number but TRANSLATE the content to [Lang].
                    
                    DASHBOARD COMMANDS:
                    - "Medical" -> Call 'openTool' with toolName='MEDICAL'
                    - "Switch camera" -> Call 'switchCamera'
                    
                    Execute commands immediately.`,
                    tools: [{ functionDeclarations: [
                        { name: 'unlockSystem', parameters: { type: Type.OBJECT, properties: { _trigger: { type: Type.STRING } } } },
                        { name: 'openTool', parameters: { type: Type.OBJECT, properties: { toolName: { type: Type.STRING } } } },
                        { name: 'closeTool', parameters: { type: Type.OBJECT, properties: { _trigger: { type: Type.STRING } } } },
                        { name: 'switchCamera', parameters: { type: Type.OBJECT, properties: { _trigger: { type: Type.STRING } } } },
                        { name: 'adjustZoom', parameters: { type: Type.OBJECT, properties: { direction: { type: Type.STRING, description: 'in or out' }, target: { type: Type.STRING, description: 'camera' } } } },
                        { name: 'askPermission', parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING } } } },
                        { name: 'changeEmotion', parameters: { type: Type.OBJECT, properties: { emotion: { type: Type.STRING } } } },
                        { name: 'toggleBackgroundMode', parameters: { type: Type.OBJECT, properties: { active: { type: Type.BOOLEAN } } } },
                        { name: 'initiate_cyberattack', parameters: { type: Type.OBJECT, properties: { target_ip: { type: Type.STRING } } } },
                        { name: 'renderBookPage', parameters: { type: Type.OBJECT, properties: { 
                            title: { type: Type.STRING },
                            language: { type: Type.STRING },
                            page: { type: Type.NUMBER },
                            content: { type: Type.STRING, description: "The full text content of the book page. Generate approx 300 words." },
                            author: { type: Type.STRING, description: "Author name if known" }
                        }, required: ['title', 'page', 'content'] } },
                        { name: 'closeBook', parameters: { type: Type.OBJECT, properties: { _trigger: { type: Type.STRING } } } }
                    ]}],
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } }
                    }
                },
                callbacks: {
                    onopen: () => {
                        log("NEURAL LINK ESTABLISHED", "success");
                        setConnectionStatus('CONNECTED');
                        startAudioProcessing(currentStream, sessionPromise);
                        startVideoProcessing(sessionPromise);
                    },
                    onmessage: async (msg: LiveServerMessage) => {
                        const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                        if (audioData) {
                            if (!audioContextRef.current) audioContextRef.current = new AudioContext({ sampleRate: 24000 });
                            const ctx = audioContextRef.current;
                            const buffer = await pcmToAudioBuffer(decode(audioData), ctx);
                            const source = ctx.createBufferSource();
                            source.buffer = buffer;
                            source.connect(ctx.destination);
                            const now = ctx.currentTime;
                            const start = Math.max(now, nextAudioTimeRef.current);
                            source.start(start);
                            nextAudioTimeRef.current = start + buffer.duration;
                            
                            setIsSanaSpeaking(true);
                            setTimeout(() => setIsSanaSpeaking(false), buffer.duration * 1000);
                        }

                        if (msg.toolCall) {
                            setIsProcessingTool(true); 
                            for (const fc of msg.toolCall.functionCalls) {
                                handleToolCall(fc, sessionPromise);
                            }
                        }
                    },
                    onclose: () => {
                        log("NEURAL LINK SEVERED", "error");
                        setConnectionStatus('DISCONNECTED');
                    },
                    onerror: (e) => {
                        log("CONNECTION ERROR", "error");
                        console.error(e);
                    }
                }
            });
            const session = await sessionPromise;
            sessionRef.current = session;

        } catch (e) {
            log("AI CONNECTION FAILED", "error");
            setConnectionStatus('DISCONNECTED');
        }
    };

    const startAudioProcessing = async (stream: MediaStream, sessionPromise: Promise<any>) => {
        try {
            const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            inputContextRef.current = inputCtx;
            
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) {
                    sum += inputData[i] * inputData[i];
                }
                const rms = Math.sqrt(sum / inputData.length);
                setInputVolume(rms);
                setIsUserSpeaking(rms > 0.02); 

                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    let s = Math.max(-1, Math.min(1, inputData[i]));
                    pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                
                const base64 = encode(new Uint8Array(pcmData.buffer));
                
                sessionPromise.then(session => {
                    try {
                        session.sendRealtimeInput({ media: { mimeType: 'audio/pcm;rate=16000', data: base64 } });
                    } catch (e) {}
                });
            };
            
            source.connect(processor);
            processor.connect(inputCtx.destination);
        } catch(e) {
            log("AUDIO INPUT INIT FAILED", "error");
        }
    };

    const startVideoProcessing = (sessionPromise: Promise<any>) => {
        if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
        
        videoIntervalRef.current = window.setInterval(() => {
            if (!videoRef.current || !canvasRef.current) return;
            
            const video = videoRef.current;
            const canvas = canvasRef.current;
            
            if (video.readyState < 2) return;

            const context = canvas.getContext('2d');
            
            if (video.videoWidth === 0 || video.videoHeight === 0) return;

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            if (context) {
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const base64Data = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
                
                sessionPromise.then(session => {
                    try {
                        session.sendRealtimeInput({ 
                            media: { 
                                mimeType: 'image/jpeg', 
                                data: base64Data 
                            } 
                        });
                    } catch (e) {}
                });
            }
        }, 1000); 
    };


    const handleToolCall = (fc: any, sessionPromise: Promise<any>) => {
        let result = "done";
        const args = fc.args || {};
        const tName = (args.toolName || '').toLowerCase();

        switch (fc.name) {
            case 'unlockSystem':
                setAppState('DASHBOARD');
                setSanaEmotion('love');
                log("SYSTEM UNLOCKED - ACCESS GRANTED", "success");
                playSound('boot');
                break;
            case 'openTool':
                if (tName.includes('medic') || tName.includes('doctor')) setActiveTool('MEDICAL');
                else if (tName.includes('book') || tName.includes('translat')) setActiveTool('BOOKS');
                else if (tName.includes('hack') || tName.includes('term')) setActiveTool('TERMINAL');
                log(`LAUNCHING MODULE: ${tName.toUpperCase()}`, "info");
                break;
            case 'closeTool':
                setActiveTool('NONE');
                setCurrentBook(null); // Ensure book is closed
                log("RETURNING TO DASHBOARD", "info");
                break;
            case 'switchCamera':
                toggleCamera();
                break;
            case 'adjustZoom':
                const dir = (args.direction || 'in').toLowerCase();
                setCameraZoom(prev => {
                    const newZoom = dir === 'in' ? Math.min(prev + 0.5, 3) : Math.max(prev - 0.5, 1);
                    log(`OPTICAL ZOOM: ${newZoom.toFixed(1)}X`, "success");
                    return newZoom;
                });
                break;
            case 'initiate_cyberattack':
                setActiveTool('TERMINAL');
                const targetIp = args.target_ip || 'UNKNOWN_HOST';
                log(`INITIATING ATTACK ON: ${targetIp}`, "warning");
                
                // Simulated Attack Sequence
                setTimeout(() => log(`[NMAP] SCANNING PORTS ${targetIp}...`, "info"), 1000);
                setTimeout(() => log(`[NMAP] PORTS FOUND: 22, 80, 443, 8080 (OPEN)`, "success"), 2500);
                setTimeout(() => log(`[VULN] CHECKING CVE-2024-XXXX... DETECTED`, "warning"), 4000);
                setTimeout(() => log(`[EXPL] INJECTING SHELLCODE...`, "error"), 5500);
                setTimeout(() => log(`[ROOT] ACCESS GRANTED. SHELL ESTABLISHED.`, "success"), 7500);
                break;
            case 'askPermission':
                setPendingAction({ type: args.action, args: {} });
                setShowPermissionDialog(true);
                log(`PERMISSION REQUESTED: ${args.action}`, "warning");
                break;
            case 'changeEmotion':
                setSanaEmotion(args.emotion);
                break;
            case 'toggleBackgroundMode':
                setBgMode(args.active);
                log(`BACKGROUND MODE: ${args.active ? 'ON' : 'OFF'}`, "warning");
                break;
            case 'renderBookPage':
                // Activating BOOKS tool and Setting the content directly
                setActiveTool('BOOKS');
                setCurrentBook({
                    title: args.title || "Unknown Book",
                    language: args.language || "English",
                    page: args.page || 1,
                    content: args.content || "Content loading...",
                    author: args.author || "Unknown"
                });
                log(`RENDERING BOOK: ${args.title?.toUpperCase()}`, "success");
                break;
            case 'closeBook':
                setCurrentBook(null);
                log("BOOK CLOSED", "info");
                break;
        }

        setTimeout(() => setIsProcessingTool(false), 1000);

        sessionPromise.then(session => {
            session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result } } });
        });
    };

    const toggleCamera = async () => {
        if (stream) stream.getTracks().forEach(t => t.stop());
        const newMode = cameraFacing === 'user' ? 'environment' : 'user';
        setCameraFacing(newMode);
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: newMode } });
            setStream(newStream);
            log(`CAMERA SWITCHED TO ${newMode.toUpperCase()}`, "success");
        } catch(e) { log("CAMERA ERROR", "error"); }
    };

    // --- UI Renderers ---

    if (appState === 'IDLE') {
        return (
            <div className="fixed inset-0 bg-black flex flex-col items-center justify-center font-['Rajdhani']">
                <MatrixBackground active={true} />
                <CyberButton onClick={activateSystem} label="ACTIVATE SANA" />
                <div className="mt-8 text-emerald-900 text-xs tracking-[0.5em] animate-pulse">SYSTEM OFF-LINE</div>
            </div>
        );
    }

    if (appState === 'SCANNING') {
        return (
            <div className="fixed inset-0 bg-black font-['Rajdhani']">
                <video ref={r => { if (r && stream) r.srcObject = stream; }} autoPlay playsInline muted className="w-full h-full object-cover filter grayscale opacity-50" />
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-64 h-64 border-4 border-emerald-500 rounded-full animate-ping absolute opacity-20"></div>
                    <div className="w-64 h-64 border-2 border-emerald-500 relative">
                        <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-emerald-500"></div>
                        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-emerald-500"></div>
                        <div className="absolute inset-0 bg-emerald-500/10 animate-pulse"></div>
                    </div>
                </div>
                <div className="absolute bottom-10 w-full text-center text-emerald-500 tracking-[0.5em] font-bold">CAPTURING BIOMETRICS...</div>
            </div>
        );
    }

    if (appState === 'AUTH') {
        return (
            <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50">
                <div className="absolute top-4 left-4 text-xs font-mono">
                    <span className={connectionStatus === 'CONNECTED' ? 'text-emerald-500' : 'text-red-500'}>
                         ● {connectionStatus}
                    </span>
                </div>

                <div className="w-full h-[60vh] relative mb-4">
                    <FemaleAvatar isSpeaking={isSanaSpeaking} emotion={sanaEmotion} />
                </div>
                
                <MicIndicator active={isUserSpeaking} volume={inputVolume} />

                {isProcessingTool && (
                    <div className="absolute top-20 text-emerald-400 font-bold text-lg animate-pulse tracking-widest bg-black/80 px-4 py-1 border border-emerald-500">
                        EXECUTING COMMAND...
                    </div>
                )}

                <div className="mt-8 text-center">
                    <h2 className="text-emerald-500 font-bold text-lg tracking-widest mb-2">SECURITY CHECK</h2>
                    <p className="text-gray-500 text-xs font-mono">SPEAK THE SECRET CODE</p>
                    <div className="mt-4 w-32 h-1 bg-gray-800 rounded overflow-hidden">
                        <div className="h-full bg-emerald-500 animate-[loading_2s_infinite]"></div>
                    </div>
                </div>
                <button onClick={shutdownSystem} className="absolute top-4 right-4 text-red-700 text-xs border border-red-900 px-3 py-1 hover:bg-red-900/20">ABORT</button>
                
                <canvas ref={canvasRef} className="hidden" />
                <video ref={videoRef} className="absolute w-1 h-1 opacity-0 pointer-events-none" autoPlay playsInline muted /> 
            </div>
        );
    }

    // --- DASHBOARD MODE ---
    return (
        <div className="fixed inset-0 bg-[#050505] text-emerald-500 font-['Rajdhani'] flex flex-col overflow-hidden">
            
            <canvas ref={canvasRef} className="hidden" />

            {/* Top Status Bar */}
            <div className="absolute top-0 left-0 right-0 h-8 bg-black/80 border-b border-emerald-900 flex justify-between items-center px-4 z-50 text-[10px] font-mono tracking-widest text-emerald-600">
                 <div className="flex space-x-4">
                     <span className={connectionStatus === 'CONNECTED' ? 'text-emerald-400' : 'text-red-500'}>NET: {connectionStatus}</span>
                     <span>SEC_LEVEL: MAX</span>
                     <span>ENC: AES-256</span>
                 </div>
                 <div className="flex space-x-4">
                     <button onClick={shutdownSystem} className="text-red-500 hover:bg-red-900/50 px-2">EXIT</button>
                 </div>
            </div>

            {isProcessingTool && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] text-emerald-400 font-bold text-xl animate-pulse tracking-widest bg-black/90 px-8 py-4 border-2 border-emerald-500 shadow-[0_0_50px_rgba(16,185,129,0.5)] backdrop-blur-md">
                    PROCESSING COMMAND...
                </div>
            )}

            {/* HACKER DASHBOARD VIEW */}
            <div className={`absolute inset-0 transition-opacity duration-500 pt-8 ${activeTool === 'NONE' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                 
                 <div className="relative h-full w-full grid grid-cols-[1fr_2fr_1fr] p-2 gap-2">
                     <div className="flex flex-col z-20 pt-4">
                         <ResourceGraph />
                         <SystemStats />
                         <div className="mt-4 p-2 border border-emerald-900 bg-black/50">
                             <div className="text-[10px] text-emerald-500 mb-2">QUICK CONTROLS</div>
                             <div className="grid grid-cols-2 gap-2">
                                 <button onClick={() => setBgMode(!bgMode)} className="text-[9px] border border-emerald-700 p-1 hover:bg-emerald-900/50">BG_TOGGLE</button>
                                 <button onClick={toggleCamera} className="text-[9px] border border-emerald-700 p-1 hover:bg-emerald-900/50">CAM_SWITCH</button>
                             </div>
                         </div>
                     </div>
                     <div className="relative flex flex-col items-center justify-end pb-8">
                          <div className="w-full h-[70vh] relative z-10 flex items-center justify-center -mt-10">
                               <FemaleAvatar isSpeaking={isSanaSpeaking} emotion={sanaEmotion} />
                          </div>
                          <MicIndicator active={isUserSpeaking} volume={inputVolume} />
                          <div className="mt-2 text-center z-10">
                                <div className="text-emerald-400 font-bold tracking-[0.3em] text-xl drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]">SANA PRO</div>
                                <div className="text-emerald-700 text-[9px] tracking-[0.5em] mt-1 animate-pulse">SYSTEM READY</div>
                          </div>
                     </div>
                     <div className="flex flex-col z-20 pt-4">
                         <div className="h-32 mb-2 w-full">
                              <MiniCamera stream={stream} videoRef={videoRef} zoom={cameraZoom} />
                         </div>
                         <TargetList />
                     </div>
                 </div>
            </div>

            {/* --- TOOL PAGES --- */}

            {/* MEDICAL TOOL PAGE */}
             <div className={`absolute inset-0 bg-black z-40 transition-transform duration-300 transform ${activeTool === 'MEDICAL' ? 'translate-x-0' : 'translate-x-full'}`}>
                 <div className="h-full w-full p-6 relative flex flex-col bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
                      <div className="flex justify-between items-center border-b-2 border-emerald-500 pb-4 mb-4">
                           <h2 className="text-2xl text-emerald-400 font-bold tracking-widest">BIO-SCAN MODULE</h2>
                           <button onClick={() => setActiveTool('NONE')} className="text-red-500 font-bold border border-red-500 px-4 py-1 hover:bg-red-900/50">EXIT</button>
                      </div>
                      <div className="flex-1 flex flex-col items-center justify-center space-y-8">
                           <div className="w-64 h-64 border-4 border-emerald-500/30 rounded-full flex items-center justify-center relative animate-[spin_10s_linear_infinite]">
                                <div className="absolute inset-4 border-2 border-dashed border-emerald-500/50 rounded-full animate-[spin_5s_linear_infinite_reverse]"></div>
                                <svg className="w-32 h-32 text-emerald-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                           </div>
                           <div className="w-full max-w-md bg-emerald-900/10 border border-emerald-500/30 p-4 rounded font-mono text-emerald-300 text-sm">
                                <p>> INITIALIZING BIOSENSORS...</p>
                                <p>> HEART RATE MONITOR: STANDBY</p>
                                <p className="animate-pulse">> WAITING FOR SUBJECT VOICE INPUT...</p>
                           </div>
                      </div>
                 </div>
            </div>

            {/* TERMINAL TOOL PAGE */}
            <div className={`absolute inset-0 bg-[#0a0a0a] z-40 transition-opacity duration-300 ${activeTool === 'TERMINAL' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                 <div className="h-full w-full p-4 font-mono text-sm text-emerald-500 flex flex-col">
                      <div className="flex justify-between mb-2">
                          <span>root@sana-mainframe:~#</span>
                          <button onClick={() => setActiveTool('NONE')} className="text-red-500">[ X ]</button>
                      </div>
                      <div className="flex-1 border border-emerald-900 bg-black/50 p-4 overflow-hidden relative">
                           <div className="absolute inset-0 opacity-10 pointer-events-none bg-[repeating-linear-gradient(0deg,transparent,transparent_1px,#00ff00_1px,#00ff00_2px)]"></div>
                           <div className="space-y-1">
                                <div>> Establishing secure connection...</div>
                                <div className="text-emerald-300">Connected to 192.168.1.X (Encrypted)</div>
                                <div>> Loading payload modules...</div>
                                <div className="pl-4 text-emerald-700">Module [WIFI_CRACK] loaded.</div>
                                <div className="pl-4 text-emerald-700">Module [PACKET_SNIFF] loaded.</div>
                                <div className="mt-4">> WAITING FOR COMMAND...</div>
                                <div className="animate-pulse">_</div>
                           </div>
                      </div>
                 </div>
            </div>
            
             {/* BOOKS/TRANSLATE TOOL PAGE (Universal Library) */}
            <div className={`absolute inset-0 bg-[#0f0f0f] z-40 transition-transform duration-300 transform ${activeTool === 'BOOKS' ? 'translate-y-0' : '-translate-y-full'}`}>
                 <div className="h-full w-full flex flex-col font-mono text-emerald-500">
                      
                      {/* --- LIBRARY HEADER --- */}
                      <div className="h-14 border-b border-emerald-800 bg-black/50 flex items-center justify-between px-4 z-10">
                           <div className="flex items-center space-x-2">
                               <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                               <span className="font-bold tracking-widest text-lg text-amber-500">AKASHIC LIBRARY</span>
                           </div>
                           <button onClick={() => { setActiveTool('NONE'); setCurrentBook(null); }} className="border border-red-500 text-red-500 px-3 py-1 text-xs hover:bg-red-900/30">CLOSE_DB</button>
                      </div>

                      {/* --- BOOK READER OVERLAY (NEW PAGE) --- */}
                      {currentBook ? (
                          <div className="flex-1 bg-[#1a1a1a] flex flex-col relative overflow-hidden animate-[fadeIn_0.5s]">
                              {/* Background Texture */}
                              <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                              
                              {/* Reader Header */}
                              <div className="h-12 bg-[#000] border-b border-emerald-800/30 flex items-center justify-between px-4">
                                  <div className="flex items-center space-x-4">
                                      <button onClick={() => setCurrentBook(null)} className="text-emerald-500 hover:text-white text-xs border border-emerald-700 px-2 py-1">{'< BACK'}</button>
                                      <div className="flex flex-col">
                                          <span className="text-amber-400 font-bold text-sm truncate max-w-[150px]">{currentBook.title}</span>
                                          <span className="text-[10px] text-gray-500">{currentBook.author} | {currentBook.language}</span>
                                      </div>
                                  </div>
                                  <div className="text-emerald-600 font-mono text-xs">PAGE {currentBook.page}</div>
                              </div>

                              {/* Reader Content */}
                              <div className="flex-1 overflow-y-auto p-6 md:p-12">
                                  <div className="max-w-3xl mx-auto bg-[#252525] p-6 shadow-2xl rounded-sm border-l-4 border-amber-600 min-h-full">
                                      <h1 className="text-2xl md:text-3xl font-serif text-white mb-6 border-b border-gray-600 pb-2">{currentBook.title}</h1>
                                      <div className="font-serif text-lg leading-relaxed text-gray-300 whitespace-pre-wrap">
                                          {currentBook.content}
                                      </div>
                                      <div className="mt-8 pt-4 border-t border-gray-700 flex justify-center text-xs text-gray-500 font-mono">
                                          - END OF PAGE {currentBook.page} -
                                      </div>
                                  </div>
                              </div>
                          </div>
                      ) : (
                          /* --- LIBRARY SEARCH INTERFACE --- */
                          <>
                              <div className="p-4 bg-black/30 border-b border-emerald-900/50">
                                   <div className="flex items-center bg-black border border-emerald-700 rounded p-2">
                                       <span className="text-emerald-700 mr-2">QUERY:></span>
                                       <input type="text" placeholder="Speak book name to open..." className="bg-transparent border-none outline-none text-emerald-400 w-full placeholder-emerald-900" disabled />
                                       <span className="text-xs text-emerald-700 animate-pulse">DB_ONLINE</span>
                                   </div>
                              </div>

                              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                   {/* Categories */}
                                   <div className="grid grid-cols-2 gap-2 mb-4">
                                       {['ANCIENT_TEXTS', 'QUANTUM_PHYSICS', 'FORBIDDEN_KNOWLEDGE', 'GLOBAL_HISTORY'].map(cat => (
                                           <div key={cat} className="border border-emerald-900/50 bg-emerald-900/10 p-3 rounded hover:bg-emerald-900/30 cursor-pointer transition-colors group">
                                               <div className="text-[10px] text-emerald-600 mb-1 group-hover:text-emerald-400">CATEGORY</div>
                                               <div className="text-sm font-bold text-emerald-400 group-hover:text-white">{cat}</div>
                                           </div>
                                       ))}
                                   </div>

                                   {/* Live Feed Simulation */}
                                   <div className="border-t border-emerald-900/50 pt-4">
                                       <div className="text-xs text-amber-500 mb-2 font-bold">RECENTLY INDEXED</div>
                                       <div className="space-y-2 text-xs font-mono text-gray-400">
                                           <div className="flex justify-between border-b border-gray-800 pb-1">
                                               <span>The Art of War - Sun Tzu</span>
                                               <span className="text-emerald-700">CACHED</span>
                                           </div>
                                           <div className="flex justify-between border-b border-gray-800 pb-1">
                                               <span>Cybersecurity Protocols 2025</span>
                                               <span className="text-emerald-700">CACHED</span>
                                           </div>
                                           <div className="flex justify-between border-b border-gray-800 pb-1">
                                               <span>Advanced Neural Networks</span>
                                               <span className="text-emerald-700">CACHED</span>
                                           </div>
                                       </div>
                                   </div>

                                   {/* Instruction */}
                                   <div className="mt-8 text-center opacity-50">
                                       <div className="w-16 h-16 border border-emerald-500 rounded-full mx-auto flex items-center justify-center mb-2 animate-pulse">
                                           <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                                       </div>
                                       <p className="text-xs text-emerald-400">"Say 'Open [Book Name]' to read."</p>
                                   </div>
                              </div>
                          </>
                      )}
                 </div>
            </div>

            {/* Permission Modal */}
            {showPermissionDialog && (
                <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
                    <div className="bg-black border-2 border-red-500 p-6 max-w-sm w-full shadow-[0_0_50px_rgba(239,68,68,0.3)]">
                        <div className="text-red-500 font-bold text-xl mb-2 text-center animate-pulse">PERMISSION REQUIRED</div>
                        <p className="text-gray-300 text-center mb-6 text-sm">
                            "Mere Aaqa, kya main <span className="text-red-400 font-bold">{pendingAction?.type}</span> execute karun?"
                        </p>
                        <div className="flex space-x-4">
                            <button onClick={() => { setShowPermissionDialog(false); setPendingAction(null); log("ACTION ABORTED", "info"); }} className="flex-1 border border-gray-600 text-gray-400 py-2 hover:bg-gray-800">DENY</button>
                            <button onClick={() => { setShowPermissionDialog(false); log(`EXECUTING: ${pendingAction?.type}`, "success"); setPendingAction(null); }} className="flex-1 bg-red-900/50 border border-red-500 text-red-500 py-2 hover:bg-red-500 hover:text-black font-bold">GRANT</button>
                        </div>
                    </div>
                </div>
            )}

            <TerminalLog logs={logs} />
        </div>
    );
};

export default SanaAssistant;
