"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  Grid3X3,
  ZoomIn,
  ZoomOut,
  Undo2,
  Download,
  Eye,
  EyeOff,
  Upload,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Trash2,
  ChevronDown,
  Sparkles,
  Loader2,
  Key,
  ShieldCheck,
  Lock,
  ExternalLink,
  X,
} from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type CoordinateOrigin =
  | "bottom-left"
  | "top-left"
  | "bottom-right"
  | "top-right";

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const ORIGIN_LABELS: Record<CoordinateOrigin, string> = {
  "bottom-left": "Bottom-Left (pdf-lib)",
  "top-left": "Top-Left (Screen)",
  "bottom-right": "Bottom-Right",
  "top-right": "Top-Right",
};

interface ScreenPoint {
  id: string;
  screenX: number;
  screenY: number;
  page: number;
  label?: string;
}

function screenToDisplay(
  screenX: number,
  screenY: number,
  pageWidth: number,
  pageHeight: number,
  origin: CoordinateOrigin
): { x: number; y: number } {
  switch (origin) {
    case "bottom-left":
      return {
        x: Math.round(screenX * 100) / 100,
        y: Math.round((pageHeight - screenY) * 100) / 100,
      };
    case "top-left":
      return {
        x: Math.round(screenX * 100) / 100,
        y: Math.round(screenY * 100) / 100,
      };
    case "bottom-right":
      return {
        x: Math.round((pageWidth - screenX) * 100) / 100,
        y: Math.round((pageHeight - screenY) * 100) / 100,
      };
    case "top-right":
      return {
        x: Math.round((pageWidth - screenX) * 100) / 100,
        y: Math.round(screenY * 100) / 100,
      };
  }
}

export default function PDFCoordinatePicker() {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [points, setPoints] = useState<ScreenPoint[]>([]);
  const [scale, setScale] = useState(1.0);
  const [showGrid, setShowGrid] = useState(false);
  const [showTooltip, setShowTooltip] = useState(true);
  const [cursorScreen, setCursorScreen] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [origin, setOrigin] = useState<CoordinateOrigin>("bottom-left");
  const [showOriginMenu, setShowOriginMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    pointId: string;
  } | null>(null);
  const [isAutoPicking, setIsAutoPicking] = useState(false);
  const [userApiKey, setUserApiKey] = useState("");
  const [userModel, setUserModel] = useState("gemini-3.5-flash-lite");
  const [hasServerKey, setHasServerKey] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const originMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Check server key configuration and load client key from localStorage
  useEffect(() => {
    try {
      const savedKey = localStorage.getItem("google_ai_api_key") || "";
      if (savedKey) setUserApiKey(savedKey);
      const savedModel = localStorage.getItem("google_ai_model") || "";
      if (savedModel) setUserModel(savedModel);
    } catch {
      // localStorage may be unavailable
    }

    fetch("/api/auto-pick")
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.hasServerKey === "boolean") {
          setHasServerKey(data.hasServerKey);
        }
      })
      .catch(() => { });
  }, []);

  const cursorDisplay = useMemo(() => {
    if (!cursorScreen || pageSize.width === 0) return null;
    return screenToDisplay(
      cursorScreen.x,
      cursorScreen.y,
      pageSize.width,
      pageSize.height,
      origin
    );
  }, [cursorScreen, pageSize, origin]);

  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        originMenuRef.current &&
        !originMenuRef.current.contains(e.target as Node)
      ) {
        setShowOriginMenu(false);
      }
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadPdfFile = useCallback((selected: File) => {
    if (selected.type !== "application/pdf" && !selected.name.toLowerCase().endsWith(".pdf")) {
      alert("Please upload a valid PDF file (.pdf)");
      return false;
    }
    if (selected.size > MAX_FILE_SIZE_BYTES) {
      const actualSizeMB = (selected.size / (1024 * 1024)).toFixed(1);
      alert(
        `File size exceeds the ${MAX_FILE_SIZE_MB}MB limit (${actualSizeMB}MB). Please upload a smaller PDF file.`
      );
      return false;
    }
    setFile(selected);
    setCurrentPage(1);
    setPoints([]);
    setSelectedPoint(null);
    return true;
  }, []);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) {
        loadPdfFile(selected);
      }
      // Reset input value so re-uploading the same file works if needed
      e.target.value = "";
    },
    [loadPdfFile]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const dropped = e.dataTransfer.files?.[0];
      if (dropped) {
        loadPdfFile(dropped);
      }
    },
    [loadPdfFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages: n }: { numPages: number }) => {
      setNumPages(n);
    },
    []
  );

  const onPageLoadSuccess = useCallback(
    (page: { width: number; height: number; originalWidth?: number; originalHeight?: number }) => {
      setPageSize({
        width: page.originalWidth ?? page.width,
        height: page.originalHeight ?? page.height,
      });
    },
    []
  );

  const getScreenCoords = useCallback(
    (e: React.MouseEvent) => {
      if (!pageRef.current) return null;
      const rect = pageRef.current.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / scale,
        y: (e.clientY - rect.top) / scale,
      };
    },
    [scale]
  );

  const handlePageClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-point]") || target.closest("[data-context-menu]")) return;

      const screen = getScreenCoords(e);
      if (!screen) return;

      const newPoint: ScreenPoint = {
        id: crypto.randomUUID(),
        screenX: screen.x,
        screenY: screen.y,
        page: currentPage,
      };
      setPoints((prev) => [...prev, newPoint]);
      setSelectedPoint(newPoint.id);
    },
    [currentPage, getScreenCoords, isDragging]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const screen = getScreenCoords(e);
      if (screen) setCursorScreen(screen);

      if (isDragging && selectedPoint && screen) {
        setPoints((prev) =>
          prev.map((p) =>
            p.id === selectedPoint
              ? { ...p, screenX: screen.x, screenY: screen.y }
              : p
          )
        );
      }
    },
    [getScreenCoords, isDragging, selectedPoint]
  );

  const handleMouseLeave = useCallback(() => {
    setCursorScreen(null);
    if (isDragging) setIsDragging(false);
    setContextMenu(null);
  }, [isDragging]);

  const handlePointMouseDown = useCallback(
    (e: React.MouseEvent, pointId: string) => {
      e.stopPropagation();
      setSelectedPoint(pointId);
      setIsDragging(true);
    },
    []
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) setIsDragging(false);
  }, [isDragging]);

  const undo = useCallback(() => {
    setPoints((prev) => {
      const newPoints = prev.slice(0, -1);
      if (selectedPoint && !newPoints.find((p) => p.id === selectedPoint)) {
        setSelectedPoint(null);
      }
      return newPoints;
    });
  }, [selectedPoint]);

  const deletePoint = useCallback(
    (id: string) => {
      setPoints((prev) => prev.filter((p) => p.id !== id));
      if (selectedPoint === id) setSelectedPoint(null);
    },
    [selectedPoint]
  );

  const exportJSON = useCallback(() => {
    const sorted = [...points].sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      return a.screenY - b.screenY;
    });
    const data = sorted.map((pt, i) => {
      const display = screenToDisplay(
        pt.screenX,
        pt.screenY,
        pageSize.width,
        pageSize.height,
        origin
      );
      return {
        index: i + 1,
        label: pt.label || "",
        x: display.x,
        y: display.y,
        page: pt.page,
      };
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "coordinates.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [points, pageSize, origin]);

  const zoomIn = useCallback(
    () => setScale((s) => Math.min(s + 0.25, 4)),
    []
  );
  const zoomOut = useCallback(
    () => setScale((s) => Math.max(s - 0.25, 0.25)),
    []
  );

  const autoPick = useCallback(
    async (overrideKey?: string) => {
      if (!fileUrl || isAutoPicking || pageSize.width === 0) return;

      const activeKey = (overrideKey !== undefined ? overrideKey : userApiKey).trim();
      if (!hasServerKey && !activeKey) {
        setShowApiKeyModal(true);
        return;
      }

      setIsAutoPicking(true);
      try {
        const pdf = await pdfjs.getDocument(fileUrl).promise;
        const page = await pdf.getPage(currentPage);
        const textContent = await page.getTextContent();

        const items = textContent.items
          .filter(
            (item): item is typeof item & { str: string; transform: number[]; width: number; height: number } =>
              "str" in item && !!(item as { str: string }).str.trim()
          )
          .map((item) => ({
            text: item.str,
            x: item.transform[4],
            y: item.transform[5],
            width: item.width,
            height: item.height,
          }));

        if (!items.length) {
          alert("No text found on this page");
          return;
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (activeKey) {
          headers["X-API-Key"] = activeKey;
        }

        const res = await fetch("/api/auto-pick", {
          method: "POST",
          headers,
          body: JSON.stringify({
            items,
            page: currentPage,
            pageWidth: pageSize.width,
            pageHeight: pageSize.height,
            origin,
            ...(activeKey && !hasServerKey ? { model: userModel } : {}),
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          if (data.code === "API_KEY_REQUIRED") {
            setShowApiKeyModal(true);
            return;
          }
          alert(data.error || "Auto pick failed");
          return;
        }

        const newPoints: ScreenPoint[] = data.fields.map(
          (f: { label: string; x: number; y: number; page: number }) => {
            let screenX: number, screenY: number;
            switch (origin) {
              case "bottom-left":
                screenX = f.x;
                screenY = pageSize.height - f.y;
                break;
              case "top-left":
                screenX = f.x;
                screenY = f.y;
                break;
              case "bottom-right":
                screenX = pageSize.width - f.x;
                screenY = pageSize.height - f.y;
                break;
              case "top-right":
                screenX = pageSize.width - f.x;
                screenY = f.y;
                break;
            }
            return {
              id: crypto.randomUUID(),
              screenX,
              screenY,
              page: f.page,
              label: f.label,
            };
          }
        );
        setPoints((prev) => [...prev, ...newPoints]);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Auto pick failed");
      } finally {
        setIsAutoPicking(false);
      }
    },
    [fileUrl, isAutoPicking, pageSize, userApiKey, userModel, hasServerKey, currentPage, origin]
  );

  const currentPagePoints = useMemo(
    () => points.filter((p) => p.page === currentPage),
    [points, currentPage]
  );

  const GRID_STEP = 50;

  const gridData = useMemo(() => {
    if (!showGrid || pageSize.width === 0) return null;
    const vLines: number[] = [];
    const hLines: number[] = [];
    for (let x = GRID_STEP; x < pageSize.width; x += GRID_STEP) {
      vLines.push(x);
    }
    for (let y = GRID_STEP; y < pageSize.height; y += GRID_STEP) {
      hLines.push(y);
    }
    return { vLines, hLines };
  }, [showGrid, pageSize]);

  const getGridLabel = useCallback(
    (screenVal: number, axis: "x" | "y") => {
      if (axis === "x") {
        switch (origin) {
          case "bottom-left":
          case "top-left":
            return Math.round(screenVal);
          case "bottom-right":
          case "top-right":
            return Math.round(pageSize.width - screenVal);
        }
      } else {
        switch (origin) {
          case "top-left":
          case "top-right":
            return Math.round(screenVal);
          case "bottom-left":
          case "bottom-right":
            return Math.round(pageSize.height - screenVal);
        }
      }
    },
    [origin, pageSize]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedPoint && document.activeElement === document.body) {
          deletePoint(selectedPoint);
        }
      }
      if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPoint, deletePoint, undo]);

  if (!file || !fileUrl) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[var(--bg-primary)] relative">
        <div className="absolute top-4 right-5">
          <button
            onClick={() => setShowApiKeyModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1c202e] hover:bg-[#282d3e] text-[#9ca3af] hover:text-white border border-[#2f3450] transition-colors cursor-pointer"
          >
            <Key size={14} className={userApiKey ? "text-[var(--accent)]" : hasServerKey ? "text-[var(--success)]" : "text-[#9ca3af]"} />
            <span>
              {userApiKey
                ? "Custom AI Key"
                : hasServerKey
                  ? "Server Key Active"
                  : "Configure AI Key"}
            </span>
          </button>
        </div>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          className="flex flex-col items-center justify-center w-[560px] h-[360px] border-2 border-dashed border-[var(--border)] rounded-2xl bg-[var(--bg-secondary)] hover:border-[var(--accent)] hover:bg-[var(--bg-secondary)]/80 transition-all cursor-pointer group"
        >
          <Upload
            size={56}
            className="text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition-colors mb-6"
          />
          <p className="text-lg font-medium text-[var(--text-primary)] mb-2">
            Drop your PDF here
          </p>
          <p className="text-sm text-[var(--text-secondary)] mb-1">
            or click to browse
          </p>
          <p className="text-[11px] text-[#6e748b] mb-6 font-mono">
            Supported format: PDF (up to {MAX_FILE_SIZE_MB}MB)
          </p>
          <label className="px-6 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg cursor-pointer transition-all font-medium text-sm shadow-lg shadow-[var(--accent)]/20 hover:shadow-[var(--accent)]/30">
            Choose File
            <input
              type="file"
              accept=".pdf"
              onChange={onFileChange}
              className="hidden"
            />
          </label>
        </div>

        {showApiKeyModal && (
          <ApiKeyModal
            isOpen={showApiKeyModal}
            onClose={() => setShowApiKeyModal(false)}
            currentKey={userApiKey}
            currentModel={userModel}
            hasServerKey={hasServerKey}
            onSave={(key, model, remember) => {
              setUserApiKey(key);
              setUserModel(model);
              try {
                if (remember && key) {
                  localStorage.setItem("google_ai_api_key", key);
                  localStorage.setItem("google_ai_model", model);
                } else {
                  localStorage.removeItem("google_ai_api_key");
                  localStorage.removeItem("google_ai_model");
                }
              } catch {
                // ignore storage error
              }
              setShowApiKeyModal(false);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)] relative">
      {isAutoPicking && (
        <div className="absolute inset-0 z-[100] bg-black/60 flex items-center justify-center backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <Loader2 size={40} className="animate-spin text-[var(--accent)]" />
            <span className="text-sm font-medium text-white">
              AI is analyzing page {currentPage}...
            </span>
          </div>
        </div>
      )}
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 h-14 bg-[#21252e] border-b border-[#3a3f52] shrink-0">
        <div className="flex items-center gap-3">
          <Crosshair size={20} className="text-[var(--accent)] mr-1" />
          <span className="text-[15px] font-bold tracking-tight text-white mr-3">
            PDF Picker
          </span>

          <div className="w-px h-6 bg-[#3a3f52]" />

          {/* Origin selector */}
          <div className="relative" ref={originMenuRef}>
            <button
              onClick={() => setShowOriginMenu((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium text-[#c9cdd6] hover:text-white hover:bg-[#2d323e] transition-all cursor-pointer"
            >
              <span>Origin: {ORIGIN_LABELS[origin]}</span>
              <ChevronDown size={14} />
            </button>
            {showOriginMenu && (
              <div className="absolute top-full left-0 mt-1 bg-[#2a2f3d] border border-[#3a3f52] rounded-lg shadow-2xl z-50 min-w-[220px] overflow-hidden py-1">
                {(
                  Object.entries(ORIGIN_LABELS) as [
                    CoordinateOrigin,
                    string,
                  ][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setOrigin(key);
                      setShowOriginMenu(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors ${origin === key
                        ? "bg-[var(--accent)] text-white font-semibold"
                        : "text-[#c9cdd6] hover:bg-[#353a4a] hover:text-white"
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-6 bg-[#3a3f52]" />

          <ToolbarButton
            onClick={() => setShowGrid((v) => !v)}
            active={showGrid}
            title="Toggle Grid"
          >
            <Grid3X3 size={16} />
            <span>Grid</span>
          </ToolbarButton>

          <ToolbarButton onClick={zoomIn} title="Zoom In">
            <ZoomIn size={16} />
          </ToolbarButton>

          <ToolbarButton onClick={zoomOut} title="Zoom Out">
            <ZoomOut size={16} />
          </ToolbarButton>

          <ToolbarButton
            onClick={undo}
            disabled={points.length === 0}
            title="Undo"
          >
            <Undo2 size={16} />
            <span>Undo</span>
          </ToolbarButton>

          <ToolbarButton
            onClick={exportJSON}
            disabled={points.length === 0}
            title="Export JSON"
          >
            <Download size={16} />
            <span>Export</span>
          </ToolbarButton>

          <ToolbarButton
            onClick={() => setShowTooltip((v) => !v)}
            active={showTooltip}
            title="Toggle Tooltip"
          >
            {showTooltip ? <Eye size={16} /> : <EyeOff size={16} />}
          </ToolbarButton>

          <div className="w-px h-6 bg-[#3a3f52]" />

          <div className="flex items-center gap-1.5">
            <ToolbarButton
              onClick={() => autoPick()}
              disabled={isAutoPicking}
              title="Auto Pick (AI)"
            >
              {isAutoPicking ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Sparkles size={16} />
              )}
              <span>{isAutoPicking ? "Picking..." : "Auto Pick"}</span>
            </ToolbarButton>

            <button
              onClick={() => setShowApiKeyModal(true)}
              title={
                userApiKey
                  ? "Using custom Google AI API key. Click to change."
                  : hasServerKey
                    ? "Using server Google AI API key. Click to override."
                    : "Google AI API key not set. Click to configure."
              }
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-colors cursor-pointer border ${userApiKey
                  ? "bg-[#1e2540] border-[#3e4a78] text-[#93c5fd] hover:bg-[#273258]"
                  : hasServerKey
                    ? "bg-[#14261c] border-[#22543d] text-[#86efac] hover:bg-[#1a3828]"
                    : "bg-[#28221b] border-[#5a4325] text-[#fcd34d] hover:bg-[#382e20]"
                }`}
            >
              <Key size={12} />
              <span className="text-[11px] font-medium hidden sm:inline">
                {userApiKey
                  ? "Custom Key"
                  : hasServerKey
                    ? "Server Key"
                    : "Set Key"}
              </span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 px-3 py-1.5 bg-[#181b24] rounded-lg">
            <span className="text-[13px] font-mono text-[#8b8fa3]">
              x <span className="text-white font-semibold">{cursorDisplay ? cursorDisplay.x.toFixed(1) : "—"}</span>
            </span>
            <span className="text-[#3a3f52]">|</span>
            <span className="text-[13px] font-mono text-[#8b8fa3]">
              y <span className="text-white font-semibold">{cursorDisplay ? cursorDisplay.y.toFixed(1) : "—"}</span>
            </span>
          </div>

          <span className="text-[12px] font-mono text-[#8b8fa3]">
            {Math.round(scale * 100)}%
          </span>

          <span className="text-[11px] text-[#666b80]">
            {Math.round(pageSize.width)}x{Math.round(pageSize.height)}
          </span>

          <label className="px-3 py-1.5 text-[13px] font-medium text-[var(--danger)] hover:text-white hover:bg-[var(--danger)] rounded-lg cursor-pointer transition-all border border-[var(--danger)]/40 hover:border-[var(--danger)]">
            Change PDF
            <input
              type="file"
              accept=".pdf"
              onChange={onFileChange}
              className="hidden"
            />
          </label>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Page sidebar */}
        <div className="w-[160px] bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col shrink-0">
          <div className="px-3 py-2.5 text-[11px] font-bold text-[var(--text-primary)] uppercase tracking-wider border-b border-[var(--border-light)] bg-[var(--bg-toolbar)]">
            Pages
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {fileUrl &&
              Array.from({ length: numPages }, (_, i) => i + 1).map(
                (pageNum) => (
                  <button
                    key={pageNum}
                    onClick={() => {
                      setCurrentPage(pageNum);
                      setSelectedPoint(null);
                    }}
                    className={`w-full rounded-lg overflow-hidden border-2 transition-all ${currentPage === pageNum
                        ? "border-[var(--accent)] shadow-lg shadow-[var(--accent)]/20"
                        : "border-transparent hover:border-[var(--border)]"
                      }`}
                  >
                    <div className="bg-white">
                      <Document file={fileUrl}>
                        <Page
                          pageNumber={pageNum}
                          width={136}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                        />
                      </Document>
                    </div>
                    <div
                      className={`text-[10px] py-1 text-center ${currentPage === pageNum
                          ? "text-[var(--accent)]"
                          : "text-[var(--text-secondary)]"
                        }`}
                    >
                      {pageNum}
                    </div>
                  </button>
                )
              )}
          </div>
        </div>

        {/* Main PDF area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-auto flex items-start justify-center p-8 bg-[var(--bg-primary)]"
          >
            <div
              ref={pageRef}
              className="relative cursor-crosshair shadow-2xl"
              onClick={handlePageClick}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onMouseUp={handleMouseUp}
              style={{
                width: pageSize.width * scale,
                height: pageSize.height * scale,
              }}
            >
              <Document file={fileUrl} onLoadSuccess={onDocumentLoadSuccess}>
                <Page
                  pageNumber={currentPage}
                  scale={scale}
                  onLoadSuccess={onPageLoadSuccess}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </Document>

              {/* Grid overlay with labels */}
              {showGrid && gridData && (
                <svg
                  className="absolute inset-0 pointer-events-none"
                  width={pageSize.width * scale}
                  height={pageSize.height * scale}
                  style={{ overflow: "visible" }}
                >
                  {gridData.vLines.map((x) => (
                    <g key={`v-${x}`}>
                      <line
                        x1={x * scale}
                        y1={0}
                        x2={x * scale}
                        y2={pageSize.height * scale}
                        stroke="rgba(108,99,255,0.15)"
                        strokeWidth={1}
                      />
                      <text
                        x={x * scale}
                        y={-4}
                        textAnchor="middle"
                        fill="white"
                        fontSize={9 * Math.min(scale, 1.5)}
                        fontFamily="monospace"
                      >
                        {getGridLabel(x, "x")}
                      </text>
                      <text
                        x={x * scale}
                        y={pageSize.height * scale + 12}
                        textAnchor="middle"
                        fill="white"
                        fontSize={9 * Math.min(scale, 1.5)}
                        fontFamily="monospace"
                      >
                        {getGridLabel(x, "x")}
                      </text>
                    </g>
                  ))}
                  {gridData.hLines.map((y) => (
                    <g key={`h-${y}`}>
                      <line
                        x1={0}
                        y1={y * scale}
                        x2={pageSize.width * scale}
                        y2={y * scale}
                        stroke="rgba(108,99,255,0.15)"
                        strokeWidth={1}
                      />
                      <text
                        x={-4}
                        y={y * scale + 3}
                        textAnchor="end"
                        fill="white"
                        fontSize={9 * Math.min(scale, 1.5)}
                        fontFamily="monospace"
                      >
                        {getGridLabel(y, "y")}
                      </text>
                      <text
                        x={pageSize.width * scale + 4}
                        y={y * scale + 3}
                        textAnchor="start"
                        fill="white"
                        fontSize={9 * Math.min(scale, 1.5)}
                        fontFamily="monospace"
                      >
                        {getGridLabel(y, "y")}
                      </text>
                    </g>
                  ))}

                  {/* Origin indicator */}
                  <OriginIndicator
                    origin={origin}
                    width={pageSize.width * scale}
                    height={pageSize.height * scale}
                  />
                </svg>
              )}

              {/* Coordinate points */}
              {currentPagePoints.map((point, index) => {
                const display = screenToDisplay(
                  point.screenX,
                  point.screenY,
                  pageSize.width,
                  pageSize.height,
                  origin
                );
                return (
                  <div
                    key={point.id}
                    data-point="true"
                    className={`absolute -translate-x-1/2 -translate-y-1/2 z-10 group ${isDragging && selectedPoint === point.id
                        ? "cursor-grabbing"
                        : "cursor-grab"
                      }`}
                    style={{
                      left: point.screenX * scale,
                      top: point.screenY * scale,
                    }}
                    onMouseDown={(e) => handlePointMouseDown(e, point.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPoint(point.id);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        pointId: point.id,
                      });
                    }}
                  >
                    <div
                      className={`w-4 h-4 rounded-full border-2 transition-all ${selectedPoint === point.id
                          ? "bg-[var(--accent)] border-white scale-125"
                          : "bg-[var(--accent)]/80 border-white/80 hover:scale-110"
                        }`}
                    >
                      <div className="absolute inset-0 rounded-full animate-ping bg-[var(--accent)]/30" />
                    </div>
                    <div className="absolute -top-1 -left-1 w-6 h-6 flex items-center justify-center text-[8px] font-bold text-white">
                      {index + 1}
                    </div>

                    {showTooltip && (
                      <div className="absolute left-6 top-1/2 -translate-y-1/2 bg-[var(--bg-toolbar)] text-[10px] text-white px-2 py-1 rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                        ({display.x}, {display.y})
                      </div>
                    )}
                  </div>
                );
              })}

              {contextMenu && (
                <div
                  ref={contextMenuRef}
                  data-context-menu
                  className="fixed z-50 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden min-w-[120px]"
                  style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                  <button
                    className="w-full text-left px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--accent)]/20 hover:text-[var(--accent)] transition-colors flex items-center gap-2 cursor-pointer"
                    onClick={() => {
                      deletePoint(contextMenu.pointId);
                      setContextMenu(null);
                    }}
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-center gap-4 h-12 bg-[#21252e] border-t border-[#3a3f52] shrink-0">
            <div className="flex items-center gap-0.5 bg-[#181b24] rounded-lg px-1 py-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-md hover:bg-[#2d323e] disabled:opacity-20 transition-colors cursor-pointer text-[#9499b0] hover:text-white"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-[13px] text-[#9499b0] px-3 min-w-[80px] text-center font-medium">
                <span className="text-white font-semibold">
                  {currentPage}
                </span>
                <span className="mx-1.5 text-[#3a3f52]">/</span>
                <span>{numPages}</span>
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                disabled={currentPage >= numPages}
                className="p-1.5 rounded-md hover:bg-[#2d323e] disabled:opacity-20 transition-colors cursor-pointer text-[#9499b0] hover:text-white"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="w-px h-5 bg-[#3a3f52]" />

            <div className="flex items-center gap-3 text-[13px] font-medium">
              <span className="text-[#9499b0]">
                <span className="text-[var(--accent)] font-semibold">{currentPagePoints.length}</span> on page
              </span>
              <span className="text-[#3a3f52]">|</span>
              <span className="text-[#9499b0]">
                <span className="text-white font-semibold">{points.length}</span> total
              </span>
            </div>

            {currentPagePoints.length > 0 && (
              <>
                <div className="w-px h-5 bg-[#3a3f52]" />
                <button
                  onClick={() => {
                    setPoints((prev) => prev.filter((p) => p.page !== currentPage));
                    setSelectedPoint(null);
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-all cursor-pointer"
                >
                  <Trash2 size={14} />
                  Clear Page
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-[280px] bg-[var(--bg-secondary)] border-l border-[var(--border-light)] flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-[var(--border-light)] flex items-center justify-between bg-[var(--bg-toolbar)]">
            <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Points</span>
            <span className="text-[11px] font-semibold text-[var(--accent)] bg-[var(--accent-glow)] px-2 py-0.5 rounded-full">
              {points.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {points.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <Crosshair size={28} className="text-[var(--border-light)] mb-3" />
                <p className="text-xs text-[var(--text-secondary)]">
                  Click on the PDF to pick points
                </p>
                <p className="text-[10px] text-[var(--text-secondary)] opacity-50 mt-1">
                  or use Auto Pick
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {points.map((point, index) => {
                  const display = screenToDisplay(
                    point.screenX,
                    point.screenY,
                    pageSize.width,
                    pageSize.height,
                    origin
                  );
                  const isSelected = selectedPoint === point.id;
                  const isCurrentPage = point.page === currentPage;
                  return (
                    <div
                      key={point.id}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs cursor-pointer transition-all ${isSelected
                          ? "bg-[var(--accent)]/15 border border-[var(--accent)]/30"
                          : "hover:bg-[var(--bg-elevated)] border border-transparent"
                        } ${!isCurrentPage ? "opacity-50" : ""}`}
                      onClick={() => {
                        setSelectedPoint(point.id);
                        if (!isCurrentPage) setCurrentPage(point.page);
                      }}
                    >
                      <span
                        className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${isSelected
                            ? "bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/30"
                            : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
                          }`}
                      >
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        {point.label && (
                          <div className="text-[10px] text-[var(--accent)] font-medium truncate mb-0.5">
                            {point.label}
                          </div>
                        )}
                        <div className="font-mono text-[11px] text-[var(--text-primary)]">
                          {display.x}, {display.y}
                        </div>
                        <div className="text-[var(--text-secondary)] text-[9px] mt-0.5">
                          Page {point.page}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePoint(point.id);
                        }}
                        className="p-1.5 rounded-md hover:bg-[var(--danger)]/10 text-[var(--text-secondary)] hover:text-[var(--danger)] transition-all opacity-0 group-hover:opacity-100 shrink-0"
                        style={{ opacity: isSelected ? 1 : undefined }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-toolbar)]">
            <div className="text-[10px] font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
              pdf-lib usage
            </div>
            <code className="block bg-[var(--bg-primary)] rounded-md p-2 text-[10px] font-mono text-[var(--accent)]/80 leading-relaxed">
              page.drawText(&apos;Hi&apos;, {"{"} x: 50, y: 100 {"}"})
            </code>
          </div>
        </div>
      </div>

      {showApiKeyModal && (
        <ApiKeyModal
          isOpen={showApiKeyModal}
          onClose={() => setShowApiKeyModal(false)}
          currentKey={userApiKey}
          currentModel={userModel}
          hasServerKey={hasServerKey}
          onSave={(key, model, remember, shouldAutoPick) => {
            setUserApiKey(key);
            setUserModel(model);
            try {
              if (remember && key) {
                localStorage.setItem("google_ai_api_key", key);
                localStorage.setItem("google_ai_model", model);
              } else {
                localStorage.removeItem("google_ai_api_key");
                localStorage.removeItem("google_ai_model");
              }
            } catch {
              // ignore storage error
            }
            setShowApiKeyModal(false);
            if (shouldAutoPick) {
              autoPick(key);
            }
          }}
        />
      )}
    </div>
  );
}

function ApiKeyModal({
  isOpen,
  onClose,
  currentKey,
  currentModel,
  hasServerKey,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentKey: string;
  currentModel: string;
  hasServerKey: boolean;
  onSave: (key: string, model: string, remember: boolean, andAutoPick?: boolean) => void;
}) {
  const [keyInput, setKeyInput] = useState(currentKey);
  const [modelInput, setModelInput] = useState(currentModel || "gemini-3.5-flash-lite");
  const [showPlain, setShowPlain] = useState(false);
  const [remember, setRemember] = useState(true);
  const [modelList, setModelList] = useState<{ name: string; displayName: string }[]>([]);
  const [modelListOpen, setModelListOpen] = useState(false);
  const [modelListLoading, setModelListLoading] = useState(false);
  const [modelListError, setModelListError] = useState<string | null>(null);

  useEffect(() => {
    if (!modelListOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-model-dropdown]")) {
        setModelListOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [modelListOpen]);

  async function fetchModels(key: string) {
    if (!key.trim()) return;
    setModelListLoading(true);
    setModelListError(null);
    try {
      const res = await fetch("/api/models", {
        headers: { "X-API-Key": key.trim() },
      });
      const data = await res.json();
      if (!res.ok) {
        setModelListError(data.error ?? "Failed to fetch models");
        setModelList([]);
      } else {
        setModelList(data.models ?? []);
      }
    } catch {
      setModelListError("Network error — check your API key and connection");
      setModelList([]);
    } finally {
      setModelListLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        backgroundColor: "rgba(5, 7, 13, 0.82)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "490px",
          backgroundColor: "#121622",
          border: "1px solid #293249",
          borderRadius: "20px",
          boxShadow: "0 30px 90px -12px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.06)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Top glowing ambient highlight */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "15%",
            right: "15%",
            height: "2px",
            background: "linear-gradient(90deg, transparent, #7c6cff, #a78bfa, transparent)",
          }}
        />

        {/* Header */}
        <div
          style={{
            padding: "20px 24px 18px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #1e2538",
            backgroundColor: "#161b29",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, rgba(124, 108, 255, 0.28), rgba(99, 102, 241, 0.12))",
                border: "1px solid rgba(124, 108, 255, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#a599ff",
                flexShrink: 0,
                boxShadow: "0 0 20px rgba(124, 108, 255, 0.2)",
              }}
            >
              <Key size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#ffffff", letterSpacing: "-0.01em" }}>
                Google AI API Key
              </h3>
              <p style={{ margin: "3px 0 0 0", fontSize: "12px", color: "#8d96ae" }}>
                Configure Gemini API for Auto-Pick
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "8px",
              borderRadius: "10px",
              color: "#8d96ae",
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s ease",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div
          style={{
            padding: "22px 24px",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
            backgroundColor: "#121622",
          }}
        >
          {/* Status Alert Banner */}
          {hasServerKey ? (
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "12px",
                backgroundColor: "rgba(16, 42, 28, 0.75)",
                border: "1px solid #1f5235",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <ShieldCheck size={16} color="#4ade80" />
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#86efac" }}>
                    Server Key Active
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "9999px",
                    backgroundColor: "#153d26",
                    border: "1px solid #23613c",
                    color: "#86efac",
                  }}
                >
                  Ready to Use
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "12px", color: "rgba(187, 247, 208, 0.85)", lineHeight: 1.45 }}>
                A server default key is active. Leave the field below blank to use it, or enter your personal key to override.
              </p>
            </div>
          ) : (
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "12px",
                backgroundColor: "rgba(42, 30, 14, 0.8)",
                border: "1px solid #573f1a",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Lock size={16} color="#fcd34d" />
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#fde68a" }}>
                  API Key Required for AI Features
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "12px", color: "rgba(253, 230, 138, 0.85)", lineHeight: 1.45 }}>
                No default key configured on server. Please enter your Google Gemini API key to enable AI Auto-Pick.
              </p>
            </div>
          )}

          {/* Key Input Section */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#d2d8eb", letterSpacing: "0.01em" }}>
                Google Gemini API Key
              </label>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: "12px",
                  color: "#9d92ff",
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontWeight: 500,
                }}
              >
                <span>Get free API key</span>
                <ExternalLink size={12} />
              </a>
            </div>

            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                backgroundColor: "#090c14",
                border: "1px solid #273047",
                borderRadius: "12px",
                padding: "0 14px",
                boxShadow: "inset 0 2px 4px rgba(0,0,0,0.4)",
              }}
            >
              <input
                type={showPlain ? "text" : "password"}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={hasServerKey ? "Leave empty to use server default key" : "AIzaSy..."}
                style={{
                  width: "100%",
                  backgroundColor: "transparent",
                  border: "none",
                  outline: "none",
                  color: "#ffffff",
                  padding: "12px 34px 12px 0",
                  fontSize: "13px",
                  fontFamily: "ui-monospace, monospace",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPlain(!showPlain)}
                style={{
                  position: "absolute",
                  right: "10px",
                  padding: "6px",
                  borderRadius: "6px",
                  color: "#8d96ae",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title={showPlain ? "Hide Key" : "Show Key"}
              >
                {showPlain ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Model Selector — only shown when user has a key (BYOK) */}
          {keyInput.trim() && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#d2d8eb", letterSpacing: "0.01em" }}>
                Gemini Model
              </label>

              {/* Custom dropdown trigger */}
              <div style={{ position: "relative" }} data-model-dropdown="">
                <button
                  type="button"
                  onClick={() => {
                    const opening = !modelListOpen;
                    setModelListOpen(opening);
                    if (opening && modelList.length === 0 && !modelListLoading) {
                      fetchModels(keyInput);
                    }
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: "#090c14",
                    border: "1px solid #273047",
                    borderRadius: "12px",
                    padding: "11px 14px",
                    color: "#ffffff",
                    fontSize: "13px",
                    fontFamily: "ui-monospace, monospace",
                    cursor: "pointer",
                    boxShadow: "inset 0 2px 4px rgba(0,0,0,0.4)",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {modelInput || "gemini-3.5-flash-lite"}
                  </span>
                  <span style={{ color: "#8d96ae", fontSize: "12px", marginLeft: "8px", flexShrink: 0 }}>
                    {modelListLoading ? "⏳" : "▾"}
                  </span>
                </button>

                {/* Dropdown list */}
                {modelListOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      left: 0,
                      right: 0,
                      backgroundColor: "#0d1120",
                      border: "1px solid #273047",
                      borderRadius: "12px",
                      zIndex: 10,
                      maxHeight: "220px",
                      overflowY: "auto",
                      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                    }}
                  >
                    {modelListLoading && (
                      <div style={{ padding: "12px 14px", color: "#8d96ae", fontSize: "12px" }}>
                        Fetching models...
                      </div>
                    )}
                    {modelListError && (
                      <div style={{ padding: "12px 14px", color: "#f87171", fontSize: "12px" }}>
                        {modelListError}
                      </div>
                    )}
                    {!modelListLoading && !modelListError && modelList.length === 0 && (
                      <div style={{ padding: "12px 14px", color: "#8d96ae", fontSize: "12px" }}>
                        No models found
                      </div>
                    )}
                    {modelList.map((m) => (
                      <button
                        key={m.name}
                        type="button"
                        onClick={() => {
                          setModelInput(m.name);
                          setModelListOpen(false);
                        }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "10px 14px",
                          background: modelInput === m.name ? "rgba(124, 108, 255, 0.15)" : "transparent",
                          border: "none",
                          color: modelInput === m.name ? "#a599ff" : "#c8d0e5",
                          fontSize: "13px",
                          fontFamily: "ui-monospace, monospace",
                          cursor: "pointer",
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <span style={{ fontWeight: modelInput === m.name ? 600 : 400 }}>{m.name}</span>
                        {m.displayName && m.displayName !== m.name && (
                          <span style={{ marginLeft: "8px", fontSize: "11px", color: "#5d6880" }}>
                            {m.displayName}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <p style={{ margin: 0, fontSize: "11px", color: "#5d6880" }}>
                Click to load available models. Default: gemini-3.5-flash-lite
              </p>
            </div>
          )}

          {/* Remember Option */}
          <div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                style={{
                  marginTop: "2px",
                  width: "16px",
                  height: "16px",
                  borderRadius: "4px",
                  accentColor: "#7c6cff",
                  cursor: "pointer",
                }}
              />
              <div style={{ fontSize: "12px", lineHeight: 1.4 }}>
                <span style={{ color: "#d2d8eb", fontWeight: 500 }}>
                  Remember in this browser (localStorage)
                </span>
                <p style={{ margin: "2px 0 0 0", fontSize: "11px", color: "#798299" }}>
                  Saved on this device only. Uncheck to use for current session only.
                </p>
              </div>
            </label>
          </div>

          {/* Privacy Notice Card */}
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "12px",
              backgroundColor: "#090c14",
              border: "1px solid #1c2336",
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background: "rgba(124, 108, 255, 0.15)",
                color: "#a599ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: "1px",
              }}
            >
              <Lock size={14} />
            </div>
            <div style={{ fontSize: "11px", lineHeight: 1.5, color: "#818ba0" }}>
              <span style={{ fontWeight: 600, color: "#c8d0e5", display: "block", marginBottom: "2px" }}>
                🔒 Privacy & Zero-Log Promise
              </span>
              Your API key stays exclusively in your local browser storage and is transmitted via request headers only when running Auto-Pick. <span style={{ color: "#a5b0cb", fontWeight: 500 }}>This server never logs, records, or stores your API key.</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #1e2538",
            backgroundColor: "#161b29",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            {currentKey ? (
              <button
                onClick={() => {
                  setKeyInput("");
                  setModelInput("gemini-3.5-flash-lite");
                  onSave("", "gemini-3.5-flash-lite", false, false);
                }}
                style={{
                  fontSize: "12px",
                  color: "#f87171",
                  background: "transparent",
                  border: "none",
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Clear Saved Key
              </button>
            ) : <span />}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={onClose}
              style={{
                padding: "9px 18px",
                borderRadius: "10px",
                fontSize: "13px",
                fontWeight: 500,
                color: "#949cb2",
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(keyInput.trim(), modelInput || "gemini-3.5-flash-lite", remember, true)}
              style={{
                padding: "9px 22px",
                borderRadius: "10px",
                fontSize: "13px",
                fontWeight: 600,
                color: "#ffffff",
                background: "linear-gradient(135deg, #7c6cff, #5b4bff)",
                border: "none",
                cursor: "pointer",
                boxShadow: "0 4px 18px rgba(124, 108, 255, 0.4)",
              }}
            >
              Save & Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OriginIndicator({
  origin,
  width,
  height,
}: {
  origin: CoordinateOrigin;
  width: number;
  height: number;
}) {
  let cx: number, cy: number;
  switch (origin) {
    case "bottom-left":
      cx = 0;
      cy = height;
      break;
    case "top-left":
      cx = 0;
      cy = 0;
      break;
    case "bottom-right":
      cx = width;
      cy = height;
      break;
    case "top-right":
      cx = width;
      cy = 0;
      break;
  }

  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill="rgba(108,99,255,0.8)" />
      <circle cx={cx} cy={cy} r={10} fill="none" stroke="rgba(108,99,255,0.4)" strokeWidth={2} />
      <text
        x={cx + (origin.includes("left") ? 14 : -14)}
        y={cy + (origin.includes("bottom") ? -10 : 16)}
        fill="rgba(108,99,255,0.8)"
        fontSize={11}
        fontWeight="bold"
        fontFamily="monospace"
        textAnchor={origin.includes("left") ? "start" : "end"}
      >
        (0, 0)
      </text>
    </g>
  );
}

function ToolbarButton({
  children,
  onClick,
  active,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${active
          ? "bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/25"
          : "text-[#9499b0] hover:text-white hover:bg-[#2d323e]"
        } ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {children}
    </button>
  );
}
