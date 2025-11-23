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
  const [aiMode, setAiMode] = useState(null);

  const canvasRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Initialize canvases
  useEffect(() => {
    if (image && canvasRef.current && maskCanvasRef.current) {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const w = img.width;
        const h = img.height;
        // On init, set canvas size to match image resolution
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
        setAiAnalysis(null);
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

    // Support Touch & Mouse
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e) => {
    // Prevent scrolling on touch
    if (e.type === "touchstart") document.body.style.overflow = "hidden";
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    // Re-enable scrolling
    document.body.style.overflow = "";
    setIsDrawing(false);
    const ctx = maskCanvasRef.current?.getContext("2d");
    if (ctx) ctx.beginPath();
  };

  const draw = (e) => {
    if (!isDrawing) return;
    // For mouse, we check buttons. For touch, we assume drawing if isDrawing is true
    if (e.type === "mousemove" && e.buttons !== 1) return;

    if (!maskCanvasRef.current) return;
    const { x, y } = getCoordinates(e);
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
    const delays = [1000, 2000, 4000];
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
      setAiAnalysis(result.candidates?.[0]?.content?.parts?.[0]?.text);
    } catch (err) {
      alert("AI Analysis failed: " + err.message);
    } finally {
      setIsAiWorking(false);
    }
  };

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
                text: "Remove the watermark or text from the bottom right corner. Keep the rest exact. seamless.",
              },
              { inlineData: { mimeType: "image/png", data: base64Data } },
            ],
          },
        ],
        generationConfig: { responseModalities: ["IMAGE"] },
      };
      const result = await callGeminiWithBackoff(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`,
        payload
      );
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
        throw new Error("No image");
      }
    } catch (err) {
      alert("AI Erase failed: " + err.message);
    } finally {
      setIsAiWorking(false);
    }
  };

  const handleSpeak = async () => {
    if (!apiKey || !aiAnalysis) return;
    try {
      const payload = {
        contents: [
          {
            parts: [
              { text: "Read this nicely: " + aiAnalysis.substring(0, 300) },
            ],
          },
        ],
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
        const pcmData = Uint8Array.from(atob(audioData), (c) =>
          c.charCodeAt(0)
        );
        const wavHeader = new ArrayBuffer(44);
        const view = new DataView(wavHeader);
        const writeString = (view, offset, string) => {
          for (let i = 0; i < string.length; i++)
            view.setUint8(offset + i, string.charCodeAt(i));
        };
        writeString(view, 0, "RIFF");
        view.setUint32(4, 36 + pcmData.length, true);
        writeString(view, 8, "WAVE");
        writeString(view, 12, "fmt ");
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 24000, true);
        view.setUint32(28, 24000 * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(view, 36, "data");
        view.setUint32(40, pcmData.length, true);
        const audio = new Audio(
          URL.createObjectURL(new Blob([view, pcmData], { type: "audio/wav" }))
        );
        audio.play();
      }
    } catch (err) {
      alert("TTS failed: " + err.message);
    }
  };

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
              const neighborColors = [];
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
                  for (const c of neighborColors)
                    varSum +=
                      Math.abs(c.r - r) + Math.abs(c.g - g) + Math.abs(c.b - b);
                  variance = varSum / neighborColors.length;
                }
                const noiseScale = 0.6;
                changes.push({
                  i,
                  r: r + (Math.random() - 0.5) * variance * noiseScale,
                  g: g + (Math.random() - 0.5) * variance * noiseScale,
                  b: b + (Math.random() - 0.5) * variance * noiseScale,
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

      const originalMask = maskCtx.getImageData(0, 0, w, h).data;
      const smoothed = new Uint8ClampedArray(pixels);
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const i = y * w + x;
          if (originalMask[i * 4] > 50) {
            let rS = 0,
              gS = 0,
              bS = 0,
              c = 0;
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const nx = x + kx;
                const ny = y + ky;
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                  const ni = ny * w + nx;
                  const off = ni * 4;
                  rS += pixels[off];
                  gS += pixels[off + 1];
                  bS += pixels[off + 2];
                  c++;
                }
              }
            }
            const off = i * 4;
            const blend = 0.2;
            smoothed[off] = pixels[off] * (1 - blend) + (rS / c) * blend;
            smoothed[off + 1] =
              pixels[off + 1] * (1 - blend) + (gS / c) * blend;
            smoothed[off + 2] =
              pixels[off + 2] * (1 - blend) + (bS / c) * blend;
          }
        }
      }
      for (let i = 0; i < pixels.length; i++) pixels[i] = smoothed[i];
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
    <div className="h-[100dvh] bg-zinc-950 text-zinc-100 font-sans flex flex-col overflow-hidden">
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Settings size={20} className="text-indigo-500" /> Settings
            </h2>
            <p className="text-sm text-zinc-400 mb-4">
              Enter Gemini API Key to enable AI features.
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 p-3 rounded-xl text-white mb-4"
            />
            <button
              onClick={() => setShowSettings(false)}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm w-full"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Header - Compact on mobile */}
      <header className="border-b border-zinc-800 bg-zinc-900 px-3 py-2 md:p-4 flex items-center justify-between shadow-md z-20 shrink-0 h-14 md:h-16">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-1.5 md:p-2 rounded-lg">
            <Wand2 size={18} className="text-white" />
          </div>
          <h1 className="text-lg md:text-xl font-bold tracking-tight text-zinc-100">
            Clean<span className="text-indigo-500">Slate</span> AI
          </h1>
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-zinc-400 hover:text-white"
          >
            <Settings size={18} />
          </button>
          {image && (
            <>
              <button
                onClick={() => setImage(null)}
                className="p-2 md:px-3 md:py-1.5 text-zinc-400 hover:bg-zinc-800 rounded-md"
              >
                <X size={18} />
              </button>
              <button
                onClick={handleDownload}
                className="bg-indigo-600 text-white p-2 md:px-4 md:py-1.5 rounded-md text-sm font-medium flex gap-2 items-center"
              >
                <Download size={16} />
                <span className="hidden md:inline">Download</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Content - Flex Column Reverse on Mobile (Canvas Top, Tools Bottom) */}
      <main className="flex-1 flex flex-col-reverse md:flex-row overflow-hidden relative">
        {!image ? (
          <div className="w-full h-full flex items-center justify-center p-6">
            <label className="w-full max-w-md h-64 md:h-96 border-2 border-dashed border-zinc-700 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-zinc-900/50 transition-all">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <div className="bg-zinc-800 p-4 rounded-full mb-4">
                <ImageIcon size={32} className="text-indigo-400" />
              </div>
              <h2 className="text-xl font-semibold text-zinc-200 mb-2">
                Upload Image
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
            {/* Toolbar - Bottom on Mobile (Height limited), Left on Desktop */}
            <aside
              className="
                w-full md:w-80 
                bg-zinc-900 border-t md:border-t-0 md:border-r border-zinc-800 
                flex flex-col z-10 shadow-xl 
                overflow-y-auto 
                h-[45vh] md:h-auto md:flex-none
            "
            >
              {/* AI Section */}
              <div className="p-3 md:p-4 border-b border-zinc-800 bg-indigo-900/10">
                <h3 className="text-[10px] md:text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Sparkles size={12} /> Gemini AI
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
                  <button
                    onClick={handleAiErase}
                    disabled={isAiWorking}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 md:px-4 md:py-3 rounded-lg flex flex-col md:flex-row items-center gap-2 text-center md:text-left shadow-lg disabled:opacity-50"
                  >
                    <Zap size={16} />
                    <div>
                      <div className="font-bold text-xs md:text-sm">
                        Magic Erase
                      </div>
                      <div className="hidden md:block text-[10px] text-indigo-200">
                        Generative Fill
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={handleAiAnalyze}
                    disabled={isAiWorking}
                    className="bg-zinc-800 border border-zinc-700 text-white p-2 md:px-4 md:py-3 rounded-lg flex flex-col md:flex-row items-center gap-2 text-center md:text-left disabled:opacity-50"
                  >
                    <Brain size={16} />
                    <div>
                      <div className="font-bold text-xs md:text-sm">
                        Analyze
                      </div>
                      <div className="hidden md:block text-[10px] text-zinc-400">
                        Caption & Tags
                      </div>
                    </div>
                  </button>
                </div>
                {isAiWorking && (
                  <div className="mt-2 text-xs text-center text-indigo-300 animate-pulse">
                    Running AI...
                  </div>
                )}
              </div>

              {/* Analysis Result */}
              {aiAnalysis && (
                <div className="p-3 md:p-4 border-b border-zinc-800 bg-zinc-800/50">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="text-xs font-bold text-zinc-400">Result</h3>
                    <button onClick={handleSpeak}>
                      <Volume2 size={14} className="text-zinc-400" />
                    </button>
                  </div>
                  <div className="bg-zinc-950 p-2 rounded border border-zinc-800 text-[10px] md:text-xs text-zinc-300 max-h-20 overflow-y-auto">
                    {aiAnalysis}
                  </div>
                </div>
              )}

              {/* Manual Tools */}
              <div className="p-3 md:p-4 flex-1">
                <h3 className="text-[10px] md:text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
                  Manual
                </h3>
                <div className="flex flex-row md:flex-col gap-2 mb-3">
                  <button
                    onClick={selectBottomRight}
                    className="flex-1 bg-zinc-800 p-2 rounded-lg flex items-center justify-center md:justify-start gap-2 border border-zinc-700"
                  >
                    <div className="w-3 h-3 border-r-2 border-b-2 border-white"></div>
                    <span className="text-xs">Bottom-Right</span>
                  </button>
                  <div className="flex-1 bg-zinc-800 p-2 rounded-lg border border-zinc-700 flex items-center gap-2 px-3">
                    <div
                      className="w-2 h-2 bg-red-500 rounded-full shrink-0"
                      style={{ transform: `scale(${brushSize / 20})` }}
                    ></div>
                    <input
                      type="range"
                      min="5"
                      max="50"
                      value={brushSize}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="w-full accent-indigo-500 h-1 bg-zinc-600 rounded-lg appearance-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    onClick={handleUndo}
                    disabled={history.length <= 1}
                    className="bg-zinc-800 p-2 rounded-lg text-xs flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    <RefreshCcw size={12} className="-scale-x-100" /> Undo
                  </button>
                  <button
                    onClick={clearMask}
                    className="bg-zinc-800 p-2 rounded-lg text-xs flex items-center justify-center gap-1"
                  >
                    <Eraser size={12} /> Clear
                  </button>
                </div>

                <button
                  onClick={removeWatermarkLocal}
                  disabled={isProcessing}
                  className={`w-full py-3 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2 ${
                    isProcessing
                      ? "bg-zinc-700"
                      : "bg-zinc-700 hover:bg-zinc-600"
                  }`}
                >
                  {isProcessing ? (
                    "Processing..."
                  ) : (
                    <>
                      <Wand2 size={16} /> Clean (Local)
                    </>
                  )}
                </button>
              </div>
            </aside>

            {/* Canvas Area - Top on Mobile, Right on Desktop */}
            <div
              className="flex-1 bg-zinc-950 overflow-hidden flex items-center justify-center relative p-2 md:p-8"
              ref={containerRef}
            >
              <div className="relative shadow-2xl shadow-black/50 max-w-full max-h-full">
                <canvas
                  ref={canvasRef}
                  className="block max-w-full max-h-full object-contain"
                  style={{ maxHeight: "calc(100vh - 250px)" }}
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
                  className="absolute top-0 left-0 cursor-crosshair touch-none w-full h-full"
                />
              </div>
              <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-zinc-800/80 backdrop-blur text-zinc-300 px-3 py-1 rounded-full text-[10px] md:text-sm border border-white/10 pointer-events-none whitespace-nowrap">
                Draw to remove
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
