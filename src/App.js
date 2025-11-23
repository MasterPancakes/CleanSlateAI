import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Upload,
  Download,
  Eraser,
  RefreshCcw,
  Wand2,
  X,
  Image as ImageIcon,
  Zap,
  Sparkles,
  Brain,
  Bot,
  MessageSquare,
  Volume2,
  Settings,
} from "lucide-react";

// You can hardcode your key here or use the UI to input it.
const DEFAULT_API_KEY = "";

export default function App() {
  const [image, setImage] = useState(null);
  const [brushSize, setBrushSize] = useState(20);
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState([]);

  // AI State
  const [apiKey, setApiKey] = useState(DEFAULT_API_KEY);
  const [showSettings, setShowSettings] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [isAiWorking, setIsAiWorking] = useState(false);
  const [aiMode, setAiMode] = useState(null); // 'remove' | 'analyze'

  const canvasRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Initialize canvases
  useEffect(() => {
    if (image && canvasRef.current && maskCanvasRef.current) {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const w = img.width;
        const h = img.height;
        canvasRef.current.width = w;
        canvasRef.current.height = h;
        maskCanvasRef.current.width = w;
        maskCanvasRef.current.height = h;
        const ctx = canvasRef.current.getContext("2d");
        ctx.drawImage(img, 0, 0);
        setHistory([ctx.getImageData(0, 0, w, h)]);
      };
      img.src = image;
    }
  }, [image]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        setImage(evt.target.result);
        setAiAnalysis(null); // Reset analysis on new image
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Interaction Logic ---
  const getCoordinates = (e) => {
    if (!canvasRef.current || !containerRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const ctx = maskCanvasRef.current?.getContext("2d");
    if (ctx) ctx.beginPath();
  };

  const draw = (e) => {
    if (!isDrawing && e.type !== "mousedown" && e.type !== "touchstart") return;
    if (!maskCanvasRef.current) return;
    const { x, y } = getCoordinates(e);
    setMousePos({ x, y });
    const ctx = maskCanvasRef.current.getContext("2d");
    ctx.globalCompositeOperation = "source-over";
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255, 50, 50, 0.5)";
    ctx.fillStyle = "rgba(255, 50, 50, 0.5)";
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const selectBottomRight = () => {
    if (!maskCanvasRef.current || !canvasRef.current) return;
    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    const ctx = maskCanvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    const size = Math.max(60, Math.min(w, h) * 0.15);
    const padding = 10;
    ctx.fillStyle = "rgba(255, 50, 50, 0.5)";
    ctx.fillRect(w - size - padding, h - size - padding, size, size);
  };

  const clearMask = () => {
    if (!maskCanvasRef.current) return;
    const ctx = maskCanvasRef.current.getContext("2d");
    ctx.clearRect(
      0,
      0,
      maskCanvasRef.current.width,
      maskCanvasRef.current.height
    );
  };

  // --- GEMINI API HELPERS ---

  const getBase64Image = () => {
    if (!canvasRef.current) return null;
    return canvasRef.current.toDataURL("image/png").split(",")[1];
  };

  const callGeminiWithBackoff = async (url, payload) => {
    const delays = [1000, 2000, 4000, 8000, 16000];
    for (let i = 0; i <= delays.length; i++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
      } catch (e) {
        if (i === delays.length) throw e;
        await new Promise((r) => setTimeout(r, delays[i]));
      }
    }
  };

  // 1. AI Analysis (Vision + Text)
  const handleAiAnalyze = async () => {
    if (!apiKey) {
      setShowSettings(true);
      return;
    }
    setIsAiWorking(true);
    setAiMode("analyze");

    try {
      const base64Data = getBase64Image();
      const payload = {
        contents: [
          {
            parts: [
              {
                text: "Analyze this image. 1. Describe what is happening. 2. Write a catchy Instagram caption. 3. Suggest 5 relevant hashtags.",
              },
              { inlineData: { mimeType: "image/png", data: base64Data } },
            ],
          },
        ],
      };

      const result = await callGeminiWithBackoff(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        payload
      );

      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      setAiAnalysis(text);
    } catch (err) {
      alert("AI Analysis failed: " + err.message);
    } finally {
      setIsAiWorking(false);
    }
  };

  // 2. AI Magic Erase (Image-to-Image)
  const handleAiErase = async () => {
    if (!apiKey) {
      setShowSettings(true);
      return;
    }
    setIsAiWorking(true);
    setAiMode("remove");

    try {
      const base64Data = getBase64Image();
      const payload = {
        contents: [
          {
            parts: [
              {
                text: "Remove the watermark or text from the bottom right corner of this image. Keep the rest of the image exactly identical. High quality, seamless blend.",
              },
              { inlineData: { mimeType: "image/png", data: base64Data } },
            ],
          },
        ],
        generationConfig: { responseModalities: ["IMAGE"] },
      };

      // Note: Using image-preview model for editing tasks
      const result = await callGeminiWithBackoff(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`,
        payload
      );

      // Extract image
      const inlineData = result.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData
      );
      if (inlineData) {
        const newImg = new Image();
        newImg.onload = () => {
          const ctx = canvasRef.current.getContext("2d");
          ctx.drawImage(newImg, 0, 0);
          setHistory((prev) => [
            ...prev.slice(-4),
            ctx.getImageData(
              0,
              0,
              canvasRef.current.width,
              canvasRef.current.height
            ),
          ]);
        };
        newImg.src = `data:image/png;base64,${inlineData.inlineData.data}`;
      } else {
        throw new Error("No image generated");
      }
    } catch (err) {
      alert(
        "AI Erase failed. Try checking your API key or trying again. " +
          err.message
      );
    } finally {
      setIsAiWorking(false);
    }
  };

  // 3. AI Text-to-Speech
  const handleSpeak = async () => {
    if (!apiKey || !aiAnalysis) return;
    try {
      const payload = {
        contents: [
          {
            parts: [
              {
                text:
                  "Read this in a friendly tone: " +
                  aiAnalysis.substring(0, 300),
              },
            ],
          },
        ], // limit length
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Fenrir" } },
          },
        },
        model: "gemini-2.5-flash-preview-tts",
      };

      const result = await callGeminiWithBackoff(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
        payload
      );

      const audioData =
        result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioData) {
        // Simple WAV header construction for PCM16 (assuming 24kHz from API default usually, but we need to check docs.
        // For simplicity in this demo, we assume the browser can decode the containerless PCM if we wrap it,
        // OR we rely on the fact that sometimes the API returns a playable container.
        // *Correction*: The API returns raw PCM.
        // We will do a quick trick: Use a valid WAV header.

        const pcmData = Uint8Array.from(atob(audioData), (c) =>
          c.charCodeAt(0)
        );
        const wavHeader = new ArrayBuffer(44);
        const view = new DataView(wavHeader);
        // RIFF chunk descriptor
        writeString(view, 0, "RIFF");
        view.setUint32(4, 36 + pcmData.length, true);
        writeString(view, 8, "WAVE");
        // fmt sub-chunk
        writeString(view, 12, "fmt ");
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, 1, true); // Mono
        view.setUint32(24, 24000, true); // Sample rate
        view.setUint32(28, 24000 * 2, true); // Byte rate
        view.setUint16(32, 2, true); // Block align
        view.setUint16(34, 16, true); // Bits per sample
        // data sub-chunk
        writeString(view, 36, "data");
        view.setUint32(40, pcmData.length, true);

        const blob = new Blob([view, pcmData], { type: "audio/wav" });
        const audio = new Audio(URL.createObjectURL(blob));
        audio.play();
      }
    } catch (err) {
      console.error(err);
      alert("TTS failed: " + err.message);
    }
  };

  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // --- Local Algorithmic Removal (The "CleanSlate Ultra") ---
  const removeWatermarkLocal = async () => {
    if (!canvasRef.current || !maskCanvasRef.current) return;
    setIsProcessing(true);

    setTimeout(() => {
      const canvas = canvasRef.current;
      const maskCanvas = maskCanvasRef.current;
      const w = canvas.width;
      const h = canvas.height;
      const ctx = canvas.getContext("2d");
      const maskCtx = maskCanvas.getContext("2d");

      const imgData = ctx.getImageData(0, 0, w, h);
      const maskData = maskCtx.getImageData(0, 0, w, h);
      const pixels = imgData.data;
      const maskPixels = maskData.data;

      const isMask = new Uint8Array(w * h);
      let minX = w,
        maxX = 0,
        minY = h,
        maxY = 0;
      let pixelsToFill = 0;

      for (let i = 0; i < w * h; i++) {
        if (maskPixels[i * 4] > 50) {
          isMask[i] = 1;
          pixelsToFill++;
          const x = i % w;
          const y = Math.floor(i / w);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }

      if (pixelsToFill === 0) {
        setIsProcessing(false);
        return;
      }

      minX = Math.max(0, minX - 2);
      maxX = Math.min(w - 1, maxX + 2);
      minY = Math.max(0, minY - 2);
      maxY = Math.min(h - 1, maxY + 2);

      let loopCount = 0;
      const maxLoops = 1000;

      while (pixelsToFill > 0 && loopCount < maxLoops) {
        loopCount++;
        const changes = [];
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const i = y * w + x;
            if (isMask[i] === 1) {
              let rSum = 0,
                gSum = 0,
                bSum = 0,
                count = 0;
              const neighborColors = [];
              const neighbors = [
                [x - 1, y],
                [x + 1, y],
                [x, y - 1],
                [x, y + 1],
                [x - 1, y - 1],
                [x + 1, y - 1],
                [x - 1, y + 1],
                [x + 1, y + 1],
              ];
              for (const [nx, ny] of neighbors) {
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                  const ni = ny * w + nx;
                  if (isMask[ni] === 0) {
                    const offset = ni * 4;
                    const r = pixels[offset];
                    const g = pixels[offset + 1];
                    const b = pixels[offset + 2];
                    rSum += r;
                    gSum += g;
                    bSum += b;
                    count++;
                    neighborColors.push({ r, g, b });
                  }
                }
              }

              if (count > 0) {
                let r = rSum / count;
                let g = gSum / count;
                let b = bSum / count;
                let variance = 0;
                if (neighborColors.length > 1) {
                  let varSum = 0;
                  for (const c of neighborColors) {
                    varSum +=
                      Math.abs(c.r - r) + Math.abs(c.g - g) + Math.abs(c.b - b);
                  }
                  variance = varSum / neighborColors.length;
                }
                const noiseScale = 0.6;
                const noiseR = (Math.random() - 0.5) * variance * noiseScale;
                const noiseG = (Math.random() - 0.5) * variance * noiseScale;
                const noiseB = (Math.random() - 0.5) * variance * noiseScale;
                changes.push({
                  i: i,
                  r: r + noiseR,
                  g: g + noiseG,
                  b: b + noiseB,
                });
              }
            }
          }
        }
        if (changes.length === 0) break;
        for (const change of changes) {
          const offset = change.i * 4;
          pixels[offset] = Math.min(255, Math.max(0, change.r));
          pixels[offset + 1] = Math.min(255, Math.max(0, change.g));
          pixels[offset + 2] = Math.min(255, Math.max(0, change.b));
          isMask[change.i] = 0;
          pixelsToFill--;
        }
      }

      // Blur Seam
      const originalMaskData = maskCtx.getImageData(0, 0, w, h).data;
      const smoothedPixels = new Uint8ClampedArray(pixels);
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const i = y * w + x;
          if (originalMaskData[i * 4] > 50) {
            let rSum = 0,
              gSum = 0,
              bSum = 0,
              count = 0;
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const nx = x + kx;
                const ny = y + ky;
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                  const ni = ny * w + nx;
                  const off = ni * 4;
                  rSum += pixels[off];
                  gSum += pixels[off + 1];
                  bSum += pixels[off + 2];
                  count++;
                }
              }
            }
            const off = i * 4;
            const blend = 0.2;
            smoothedPixels[off] =
              pixels[off] * (1 - blend) + (rSum / count) * blend;
            smoothedPixels[off + 1] =
              pixels[off + 1] * (1 - blend) + (gSum / count) * blend;
            smoothedPixels[off + 2] =
              pixels[off + 2] * (1 - blend) + (bSum / count) * blend;
          }
        }
      }
      for (let i = 0; i < pixels.length; i++) pixels[i] = smoothedPixels[i];

      ctx.putImageData(imgData, 0, 0);
      setHistory((prev) => [...prev.slice(-4), ctx.getImageData(0, 0, w, h)]);
      clearMask();
      setIsProcessing(false);
    }, 50);
  };

  const handleUndo = () => {
    if (history.length > 1) {
      const newHistory = [...history];
      newHistory.pop();
      const prevState = newHistory[newHistory.length - 1];
      setHistory(newHistory);
      const ctx = canvasRef.current.getContext("2d");
      ctx.putImageData(prevState, 0, 0);
      clearMask();
    }
  };

  const handleDownload = () => {
    if (canvasRef.current) {
      const link = document.createElement("a");
      link.download = "cleaned-image.png";
      link.href = canvasRef.current.toDataURL();
      link.click();
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col">
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Settings size={20} className="text-indigo-500" /> Settings
            </h2>
            <p className="text-sm text-zinc-400 mb-4">
              Enter your Gemini API Key to enable AI features.
            </p>
            <input
              type="password"
              placeholder="Enter Gemini API Key..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 p-3 rounded-xl text-white mb-4 focus:border-indigo-500 outline-none transition-colors"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900 p-4 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Wand2 size={20} className="text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            Clean<span className="text-indigo-500">Slate</span> AI
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            title="Settings"
          >
            <Settings size={18} />
          </button>
          {image && (
            <div className="flex gap-2">
              <button
                onClick={() => setImage(null)}
                className="text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-zinc-800"
              >
                <X size={16} /> Close
              </button>
              <button
                onClick={handleDownload}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Download size={16} /> Download
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden relative">
        {!image ? (
          <div className="w-full flex items-center justify-center p-6">
            <label className="w-full max-w-2xl h-96 border-2 border-dashed border-zinc-700 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-zinc-900/50 transition-all group">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <div className="bg-zinc-800 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform shadow-lg">
                <ImageIcon size={48} className="text-indigo-400" />
              </div>
              <h2 className="text-2xl font-semibold text-zinc-200 mb-2">
                Upload an Image
              </h2>
              <p className="text-zinc-500 text-center max-w-md">
                Click to browse or drag and drop your image here. <br />
                <span className="text-xs mt-2 block opacity-60">
                  Supports PNG, JPG, WEBP
                </span>
              </p>
            </label>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <aside className="w-80 bg-zinc-900 border-r border-zinc-800 flex flex-col z-10 shadow-xl overflow-y-auto">
              {/* AI Features Section */}
              <div className="p-4 border-b border-zinc-800 bg-indigo-900/10">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Sparkles size={12} /> Gemini AI Power Tools
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={handleAiErase}
                    disabled={isAiWorking}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 rounded-lg flex items-center gap-3 transition-all shadow-lg shadow-indigo-900/20 group disabled:opacity-50 disabled:cursor-wait"
                  >
                    <div className="bg-white/20 p-1.5 rounded">
                      <Zap size={16} className="text-white" />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-sm">Magic Erase</div>
                      <div className="text-[10px] text-indigo-200">
                        Generative Fill (Bottom Right)
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={handleAiAnalyze}
                    disabled={isAiWorking}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white px-4 py-3 rounded-lg flex items-center gap-3 transition-all group disabled:opacity-50 disabled:cursor-wait"
                  >
                    <div className="bg-zinc-700 group-hover:bg-zinc-600 p-1.5 rounded">
                      <Brain size={16} className="text-zinc-300" />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-sm">Analyze & Caption</div>
                      <div className="text-[10px] text-zinc-400">
                        Generate tags & description
                      </div>
                    </div>
                  </button>
                </div>

                {isAiWorking && (
                  <div className="mt-3 text-xs text-center text-indigo-300 animate-pulse">
                    {aiMode === "remove"
                      ? "✨ Gemini is painting..."
                      : "🧠 Gemini is thinking..."}
                  </div>
                )}
              </div>

              {/* Analysis Result Box */}
              {aiAnalysis && (
                <div className="p-4 border-b border-zinc-800 bg-zinc-800/50">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase">
                      Analysis Result
                    </h3>
                    <button
                      onClick={handleSpeak}
                      className="text-zinc-400 hover:text-indigo-400 transition-colors"
                      title="Read Aloud"
                    >
                      <Volume2 size={14} />
                    </button>
                  </div>
                  <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 text-xs text-zinc-300 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {aiAnalysis}
                  </div>
                </div>
              )}

              {/* Local Tools */}
              <div className="p-4 border-b border-zinc-800">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">
                  Manual Tools
                </h3>
                <div className="space-y-3">
                  <button
                    onClick={selectBottomRight}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all border border-zinc-700 group"
                  >
                    <div className="bg-zinc-700 group-hover:bg-zinc-600 p-1.5 rounded transition-colors">
                      <div className="w-4 h-4 border-r-2 border-b-2 border-current"></div>
                    </div>
                    <div>
                      <div className="font-medium text-sm">
                        Select Bottom-Right
                      </div>
                      <div className="text-xs text-zinc-500">
                        Auto-target watermark
                      </div>
                    </div>
                  </button>
                  <div className="bg-zinc-800/50 p-4 rounded-lg border border-zinc-800">
                    <label className="text-xs text-zinc-400 font-medium mb-2 block flex justify-between">
                      <span>Brush Size</span>
                      <span>{brushSize}px</span>
                    </label>
                    <input
                      type="range"
                      min="5"
                      max="100"
                      value={brushSize}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="w-full accent-indigo-500 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="mt-2 flex justify-center">
                      <div
                        className="bg-red-500/50 rounded-full"
                        style={{ width: brushSize, height: brushSize }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 mt-auto">
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={handleUndo}
                    disabled={history.length <= 1}
                    className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-xs font-medium flex items-center justify-center gap-2"
                  >
                    <RefreshCcw size={14} className="-scale-x-100" /> Undo
                  </button>
                  <button
                    onClick={clearMask}
                    className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-medium flex items-center justify-center gap-2"
                  >
                    <Eraser size={14} /> Clear
                  </button>
                </div>
                <button
                  onClick={removeWatermarkLocal}
                  disabled={isProcessing}
                  className={`w-full py-3 px-4 rounded-xl font-bold text-white shadow-lg shadow-zinc-900/20 flex items-center justify-center gap-2 relative overflow-hidden ${
                    isProcessing
                      ? "bg-zinc-700 cursor-wait"
                      : "bg-zinc-700 hover:bg-zinc-600"
                  } transition-all`}
                >
                  {isProcessing ? (
                    <span className="relative z-10">Processing...</span>
                  ) : (
                    <>
                      <Wand2 size={18} /> Algorithmic Remove
                    </>
                  )}
                </button>
              </div>
            </aside>

            {/* Canvas Area */}
            <div
              className="flex-1 bg-zinc-950 overflow-auto flex items-center justify-center p-8 relative"
              ref={containerRef}
            >
              <div className="relative shadow-2xl shadow-black/50">
                <canvas
                  ref={canvasRef}
                  className="block max-w-none"
                  style={{ maxHeight: "85vh", maxWidth: "100%" }}
                />
                <canvas
                  ref={maskCanvasRef}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="absolute top-0 left-0 cursor-crosshair touch-none"
                  style={{
                    maxHeight: "85vh",
                    maxWidth: "100%",
                    width: "100%",
                    height: "100%",
                  }}
                />
              </div>
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-zinc-800/90 backdrop-blur text-zinc-200 px-4 py-2 rounded-full text-sm shadow-lg pointer-events-none border border-white/10">
                Draw over the watermark to remove it
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
