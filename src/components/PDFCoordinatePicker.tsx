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
} from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type CoordinateOrigin =
  | "bottom-left"
  | "top-left"
  | "bottom-right"
  | "top-right";

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

  const pageRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const originMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

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

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected?.type === "application/pdf") {
        setFile(selected);
        setCurrentPage(1);
        setPoints([]);
        setSelectedPoint(null);
      }
    },
    []
  );

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === "application/pdf") {
      setFile(dropped);
      setCurrentPage(1);
      setPoints([]);
      setSelectedPoint(null);
    }
  }, []);

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

  const autoPick = useCallback(async () => {
    if (!fileUrl || isAutoPicking || pageSize.width === 0) return;
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

      const res = await fetch("/api/auto-pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          page: currentPage,
          pageWidth: pageSize.width,
          pageHeight: pageSize.height,
          origin,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
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
  }, [fileUrl, isAutoPicking, currentPage, pageSize, origin]);

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
      <div className="h-screen flex items-center justify-center bg-[var(--bg-primary)]">
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
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            or click to browse
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
                    className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors ${
                      origin === key
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

          <ToolbarButton
            onClick={autoPick}
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
                    className={`w-full rounded-lg overflow-hidden border-2 transition-all ${
                      currentPage === pageNum
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
                      className={`text-[10px] py-1 text-center ${
                        currentPage === pageNum
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
                    className={`absolute -translate-x-1/2 -translate-y-1/2 z-10 group ${
                      isDragging && selectedPoint === point.id
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
                      className={`w-4 h-4 rounded-full border-2 transition-all ${
                        selectedPoint === point.id
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
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs cursor-pointer transition-all ${
                        isSelected
                          ? "bg-[var(--accent)]/15 border border-[var(--accent)]/30"
                          : "hover:bg-[var(--bg-elevated)] border border-transparent"
                      } ${!isCurrentPage ? "opacity-50" : ""}`}
                      onClick={() => {
                        setSelectedPoint(point.id);
                        if (!isCurrentPage) setCurrentPage(point.page);
                      }}
                    >
                      <span
                        className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${
                          isSelected
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
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
        active
          ? "bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/25"
          : "text-[#9499b0] hover:text-white hover:bg-[#2d323e]"
      } ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {children}
    </button>
  );
}
