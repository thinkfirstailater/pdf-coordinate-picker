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
    const data = points.map((pt) => {
      const display = screenToDisplay(
        pt.screenX,
        pt.screenY,
        pageSize.width,
        pageSize.height,
        origin
      );
      return { x: display.x, y: display.y, page: pt.page };
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
          <label className="px-6 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg cursor-pointer transition-colors font-medium text-sm">
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
    <div className="h-screen flex flex-col bg-[var(--bg-primary)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 h-12 bg-[var(--bg-toolbar)] border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-1">
          <Crosshair size={18} className="text-[var(--accent)] mr-2" />
          <span className="text-sm font-semibold mr-4">
            PDF Coordinate Picker
          </span>

          {/* Origin selector */}
          <div className="relative mr-2" ref={originMenuRef}>
            <button
              onClick={() => setShowOriginMenu((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-all cursor-pointer border border-[var(--border)]"
            >
              <span>Origin: {ORIGIN_LABELS[origin]}</span>
              <ChevronDown size={12} />
            </button>
            {showOriginMenu && (
              <div className="absolute top-full left-0 mt-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-xl z-50 min-w-[200px] overflow-hidden">
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
                    className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                      origin === key
                        ? "bg-[var(--accent)] text-white"
                        : "text-[var(--text-secondary)] hover:bg-[var(--border)]/50 hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ToolbarButton
            onClick={() => setShowGrid((v) => !v)}
            active={showGrid}
            title="Toggle Grid"
          >
            <Grid3X3 size={16} />
            <span>Toggle Grid</span>
          </ToolbarButton>

          <ToolbarButton onClick={zoomIn} title="Zoom In">
            <ZoomIn size={16} />
            <span>Zoom +</span>
          </ToolbarButton>

          <ToolbarButton onClick={zoomOut} title="Zoom Out">
            <ZoomOut size={16} />
            <span>Zoom −</span>
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
            <span>Export JSON</span>
          </ToolbarButton>

          <ToolbarButton
            onClick={() => setShowTooltip((v) => !v)}
            active={showTooltip}
            title="Toggle Tooltip"
          >
            {showTooltip ? <Eye size={16} /> : <EyeOff size={16} />}
            <span>Toggle Tooltip</span>
          </ToolbarButton>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-xs font-mono text-[var(--text-secondary)]">
            <span>x: </span>
            <span className="text-[var(--text-primary)] min-w-[50px] inline-block">
              {cursorDisplay ? cursorDisplay.x.toFixed(2) : "-"}
            </span>
            <span className="ml-3">y: </span>
            <span className="text-[var(--text-primary)] min-w-[50px] inline-block">
              {cursorDisplay ? cursorDisplay.y.toFixed(2) : "-"}
            </span>
          </div>

          <div className="text-xs text-[var(--text-secondary)]">
            {Math.round(scale * 100)}%
          </div>

          <div className="text-[10px] text-[var(--text-secondary)]">
            {Math.round(pageSize.width)} x {Math.round(pageSize.height)} pt
          </div>

          <label className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] cursor-pointer transition-colors">
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
          <div className="px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider border-b border-[var(--border)]">
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
                        stroke="rgba(233,69,96,0.15)"
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
                        stroke="rgba(233,69,96,0.15)"
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
          <div className="flex items-center justify-center gap-4 h-10 bg-[var(--bg-secondary)] border-t border-[var(--border)] shrink-0">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1 rounded hover:bg-[var(--border)] disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-[var(--text-secondary)]">
              Page{" "}
              <span className="text-[var(--text-primary)] font-medium">
                {currentPage}
              </span>{" "}
              of{" "}
              <span className="text-[var(--text-primary)] font-medium">
                {numPages}
              </span>
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
              disabled={currentPage >= numPages}
              className="p-1 rounded hover:bg-[var(--border)] disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={16} />
            </button>

            <div className="text-[10px] text-[var(--text-secondary)] ml-4">
              {currentPagePoints.length} point
              {currentPagePoints.length !== 1 ? "s" : ""} on this page |{" "}
              {points.length} total
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-[260px] bg-[var(--bg-secondary)] border-l border-[var(--border)] flex flex-col shrink-0">
          <div className="px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider border-b border-[var(--border)] flex items-center justify-between">
            <span>Coordinates</span>
            <span className="text-[var(--accent)]">{points.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {points.length === 0 ? (
              <div className="p-4 text-xs text-[var(--text-secondary)] text-center">
                Click on the PDF to add coordinate points
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {points.map((point, index) => {
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
                      className={`px-3 py-2 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                        selectedPoint === point.id
                          ? "bg-[var(--accent)]/10"
                          : "hover:bg-[var(--border)]/30"
                      }`}
                      onClick={() => {
                        setSelectedPoint(point.id);
                        if (point.page !== currentPage) {
                          setCurrentPage(point.page);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                            selectedPoint === point.id
                              ? "bg-[var(--accent)] text-white"
                              : "bg-[var(--border)] text-[var(--text-secondary)]"
                          }`}
                        >
                          {index + 1}
                        </span>
                        <div>
                          <div className="font-mono text-[var(--text-primary)]">
                            x: {display.x} &nbsp; y: {display.y}
                          </div>
                          <div className="text-[var(--text-secondary)] text-[10px]">
                            Page {point.page}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePoint(point.id);
                        }}
                        className="p-1 rounded hover:bg-[var(--accent)]/20 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Usage hint */}
          <div className="px-3 py-2 border-t border-[var(--border)] text-[10px] text-[var(--text-secondary)] leading-relaxed">
            <div className="font-semibold text-[var(--text-primary)] mb-1">
              pdf-lib usage:
            </div>
            <code className="block bg-[var(--bg-primary)] rounded p-1.5 text-[9px] font-mono">
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
      <circle cx={cx} cy={cy} r={6} fill="rgba(233,69,96,0.8)" />
      <circle cx={cx} cy={cy} r={10} fill="none" stroke="rgba(233,69,96,0.4)" strokeWidth={2} />
      <text
        x={cx + (origin.includes("left") ? 14 : -14)}
        y={cy + (origin.includes("bottom") ? -10 : 16)}
        fill="rgba(233,69,96,0.8)"
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
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-all ${
        active
          ? "bg-[var(--accent)] text-white"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5"
      } ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {children}
    </button>
  );
}
