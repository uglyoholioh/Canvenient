// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Minus, Plus, RotateCw } from "lucide-react";
import { fetchCanvasFileContent } from "../api";

// pdf.js and its worker are heavy, so they load on first open only and stay
// out of the app's startup bundle.
let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ])
      .then(([lib, workerModule]) => {
        lib.GlobalWorkerOptions.workerSrc = workerModule.default;
        return lib;
      })
      .catch((error) => {
        pdfjsPromise = null;
        throw error;
      });
  }
  return pdfjsPromise;
}

const ZOOM_STEPS = [0.5, 0.65, 0.8, 1, 1.25, 1.5, 2, 2.5, 3];
const MIN_SCALE = 0.35;
const MAX_SCALE = 4;
const PAGE_RENDER_MARGIN = "700px 0px";
// Upper bound for eagerly reading page dimensions; beyond this the last known
// size doubles as an estimate so huge documents still open quickly.
const EAGER_PAGE_DIMENSION_LIMIT = 400;

function stepZoom(current, direction) {
  if (direction > 0) {
    return ZOOM_STEPS.find((step) => step > current + 0.01) ?? MAX_SCALE;
  }
  return [...ZOOM_STEPS].reverse().find((step) => step < current - 0.01) ?? MIN_SCALE;
}

// FileReader fallback covers environments whose Blob lacks arrayBuffer().
function blobToArrayBuffer(blob) {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not read the file."));
    reader.readAsArrayBuffer(blob);
  });
}

export default function PdfViewer({ token, fileId, name = "", externalUrl = "" }) {
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [numPages, setNumPages] = useState(0);
  const [baseDims, setBaseDims] = useState(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoomMode, setZoomMode] = useState("fit");
  const [rotation, setRotation] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [reloadKey, setReloadKey] = useState(0);

  const scrollRef = useRef(null);
  const docRef = useRef(null);
  const pageDivsRef = useRef(new Map());
  const renderStateRef = useRef(new Map());
  const renderTasksRef = useRef(new Map());
  const observerRef = useRef(null);
  const scrollRatioRef = useRef(null);
  const scrollFrameRef = useRef(0);
  const pageInfosRef = useRef(new Map());

  const gotoPage = useCallback((page) => {
    const clamped = Math.min(Math.max(1, page), numPages || 1);
    const div = pageDivsRef.current.get(clamped);
    if (div && typeof div.scrollIntoView === "function") div.scrollIntoView({ block: "start" });
    setCurrentPage(clamped);
    setPageInput(String(clamped));
  }, [numPages]);

  // Fetch the bytes through the backend proxy and parse the document.
  useEffect(() => {
    if (!token || !fileId) return undefined;
    let cancelled = false;
    const docController = new AbortController();
    setStatus("loading");
    setError("");
    setNumPages(0);
    setBaseDims(null);
    setCurrentPage(1);
    setPageInput("1");
    setZoomMode("fit");
    setRotation(0);
    renderStateRef.current = new Map();
    renderTasksRef.current = new Map();

    (async () => {
      try {
        const [{ blob }, lib] = await Promise.all([
          fetchCanvasFileContent(token, fileId),
          loadPdfjs(),
        ]);
        if (cancelled) return;
        const data = await blobToArrayBuffer(blob);
        if (cancelled) return;
        const doc = await lib.getDocument({ data: new Uint8Array(data) }).promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        docRef.current = doc;
        const total = doc.numPages;
        const dims = [];
        const eagerLimit = Math.min(total, EAGER_PAGE_DIMENSION_LIMIT);
        for (let n = 1; n <= eagerLimit; n += 1) {
          const page = await doc.getPage(n);
          const viewport = page.getViewport({ scale: 1 });
          dims.push({ w: viewport.width, h: viewport.height });
        }
        for (let n = dims.length; n < total; n += 1) dims.push(dims[dims.length - 1]);
        if (cancelled) {
          doc.destroy();
          return;
        }
        docController.signal.addEventListener("abort", () => doc.destroy());
        setNumPages(total);
        setBaseDims(dims);
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "This PDF could not be opened.");
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      docController.abort();
      docRef.current = null;
      renderTasksRef.current.forEach((task) => task.cancel());
      renderTasksRef.current = new Map();
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [token, fileId, reloadKey]);

  const fitScale = useMemo(() => {
    if (!baseDims || !baseDims.length || containerWidth < 60) return null;
    const first = baseDims[0];
    const rotatedWidth = rotation % 180 === 0 ? first.w : first.h;
    return Math.max(MIN_SCALE, (containerWidth - 40) / rotatedWidth);
  }, [baseDims, containerWidth, rotation]);

  const scale = zoomMode === "fit" ? fitScale ?? 1 : zoomMode;

  const pageInfos = useMemo(() => {
    if (!baseDims || !baseDims.length) return [];
    return baseDims.map((dim, index) => {
      const swapped = rotation % 180 !== 0;
      const w = Math.round((swapped ? dim.h : dim.w) * scale);
      const h = Math.round((swapped ? dim.w : dim.h) * scale);
      return { n: index + 1, w, h, scale };
    });
  }, [baseDims, rotation, scale]);

  useEffect(() => {
    pageInfosRef.current = new Map(pageInfos.map((info) => [info.n, info]));
  }, [pageInfos]);

  const renderPage = useCallback(async (pageNumber) => {
    const doc = docRef.current;
    const div = pageDivsRef.current.get(pageNumber);
    const state = renderStateRef.current;
    const info = pageInfosRef.current.get(pageNumber);
    if (!doc || !div || !info || state.get(pageNumber) !== "pending") return;
    state.set(pageNumber, "rendering");
    try {
      const page = await doc.getPage(pageNumber);
      if (pageDivsRef.current.get(pageNumber) !== div) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(info.w * dpr);
      canvas.height = Math.floor(info.h * dpr);
      canvas.style.width = `${info.w}px`;
      canvas.style.height = `${info.h}px`;
      const viewport = page.getViewport({ scale: info.scale * dpr });
      const renderTask = page.render({ canvasContext: canvas.getContext("2d"), viewport });
      renderTasksRef.current.set(pageNumber, renderTask);
      // A cancelled render may have already appended a canvas; keep exactly one.
      div.querySelectorAll("canvas").forEach((existing) => existing.remove());
      div.appendChild(canvas);
      div.classList.add("is-rendered");
      await renderTask.promise;
      state.set(pageNumber, "done");
    } catch (err) {
      const cancelledRender = err?.name === "RenderingCancelledException" || div.classList.contains("is-rendered") === false;
      if (!cancelledRender) {
        state.set(pageNumber, "error");
        div.classList.add("is-error");
      } else {
        state.set(pageNumber, "pending");
      }
    } finally {
      renderTasksRef.current.delete(pageNumber);
    }
  }, []);

  // IntersectionObserver is the primary lazy-render trigger, but some webviews
  // silently never deliver IO callbacks; renderVisiblePages() keeps rendering
  // working from scroll and resize signals alone.
  const renderVisiblePages = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop - 700;
    const bottom = el.scrollTop + el.clientHeight + 700;
    pageDivsRef.current.forEach((div, n) => {
      const offset = div.offsetTop;
      if (offset + div.offsetHeight >= top && offset <= bottom) renderPage(n);
    });
  }, [renderPage]);

  // Track the scroll container so "fit width" keeps filling the pane.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
        renderVisiblePages();
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    renderVisiblePages();
    return () => observer.disconnect();
  }, [status, renderVisiblePages]);

  // One observer drives lazy rendering of every page placeholder.
  useEffect(() => {
    if (status !== "ready" || !pageInfos.length) return undefined;
    renderVisiblePages();
    if (typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const n = Number(entry.target.dataset.page);
          if (n) renderPage(n);
        });
      },
      { root: scrollRef.current, rootMargin: PAGE_RENDER_MARGIN },
    );
    observerRef.current = observer;
    pageDivsRef.current.forEach((div) => observer.observe(div));
    return () => {
      observer.disconnect();
      if (observerRef.current === observer) observerRef.current = null;
    };
  }, [status, pageInfos, renderPage, renderVisiblePages]);

  // Zoom and rotation rebuild every page div; keep the reading position stable.
  useLayoutEffect(() => {
    if (scrollRatioRef.current == null) return;
    const el = scrollRef.current;
    if (el && el.scrollHeight > 0) {
      el.scrollTop = scrollRatioRef.current * el.scrollHeight;
    }
    scrollRatioRef.current = null;
    renderVisiblePages();
  }, [pageInfos, renderVisiblePages]);

  const applyLayoutChange = useCallback((updater) => {
    const el = scrollRef.current;
    if (el && el.scrollHeight > 0) {
      scrollRatioRef.current = el.scrollTop / el.scrollHeight;
    }
    updater();
  }, []);

  const zoomIn = useCallback(() => {
    applyLayoutChange(() => setZoomMode(stepZoom(scale, 1)));
  }, [applyLayoutChange, scale]);

  const zoomOut = useCallback(() => {
    applyLayoutChange(() => setZoomMode(stepZoom(scale, -1)));
  }, [applyLayoutChange, scale]);

  const rotate = useCallback(() => {
    applyLayoutChange(() => setRotation((r) => (r + 90) % 360));
  }, [applyLayoutChange]);

  const registerPageDiv = useCallback((n) => (div) => {
    if (div) {
      pageDivsRef.current.set(n, div);
      renderStateRef.current.set(n, "pending");
      if (observerRef.current) observerRef.current.observe(div);
      else if (typeof IntersectionObserver === "undefined") renderPage(n);
    } else {
      pageDivsRef.current.delete(n);
      const task = renderTasksRef.current.get(n);
      if (task) {
        task.cancel();
        renderTasksRef.current.delete(n);
      }
      renderStateRef.current.delete(n);
    }
  }, [renderPage]);

  const handleScroll = useCallback(() => {
    if (scrollFrameRef.current) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = 0;
      renderVisiblePages();
      const el = scrollRef.current;
      if (!el) return;
      const probe = el.scrollTop + el.clientHeight * 0.35;
      let best = 1;
      pageDivsRef.current.forEach((div, n) => {
        if (div.offsetTop <= probe) best = Math.max(best, n);
      });
      setCurrentPage((prev) => {
        if (prev !== best) setPageInput(String(best));
        return best;
      });
    });
  }, [renderVisiblePages]);

  const commitPageInput = useCallback(() => {
    const parsed = parseInt(pageInput, 10);
    if (Number.isFinite(parsed)) gotoPage(parsed);
    else setPageInput(String(currentPage));
  }, [currentPage, gotoPage, pageInput]);

  const handleKeyDown = useCallback((event) => {
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      gotoPage(currentPage + 1);
    } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      gotoPage(currentPage - 1);
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomIn();
    } else if (event.key === "-") {
      event.preventDefault();
      zoomOut();
    } else if (event.key === "0") {
      event.preventDefault();
      applyLayoutChange(() => setZoomMode("fit"));
    }
  }, [applyLayoutChange, currentPage, gotoPage, zoomIn, zoomOut]);

  if (status === "error") {
    return (
      <div className="cv-pdf-viewer" role="region" aria-label={`PDF viewer: ${name}`}>
        <div className="cv-pdf-status">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <div className="cv-pdf-status-actions">
            <button type="button" className="cv-btn-link" onClick={() => setReloadKey((key) => key + 1)}>Try again</button>
            {externalUrl && (
              <a href={externalUrl} target="_blank" rel="noreferrer" className="cv-link-accent">Open in Canvas ↗</a>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (status !== "ready") {
    return (
      <div className="cv-pdf-viewer" role="region" aria-label={`PDF viewer: ${name}`}>
        <div className="cv-pdf-status">
          <Loader2 className="retro-icon-spin" size={16} />
          <span>Loading PDF…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="cv-pdf-viewer" role="region" aria-label={`PDF viewer: ${name}`} tabIndex={0} onKeyDown={handleKeyDown}>
      <div className="cv-pdf-toolbar">
        <div className="cv-pdf-toolbar-group">
          <button type="button" className="cv-btn-icon" onClick={() => gotoPage(currentPage - 1)} disabled={currentPage <= 1} title="Previous page" aria-label="Previous page">
            <ChevronLeft size={13} />
          </button>
          <span className="cv-pdf-page-indicator">
            <input
              className="cv-pdf-page-input"
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value.replace(/[^0-9]/g, ""))}
              onBlur={commitPageInput}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitPageInput(); event.target.blur(); } }}
              aria-label="Go to page"
            />
            <span>/ {numPages}</span>
          </span>
          <button type="button" className="cv-btn-icon" onClick={() => gotoPage(currentPage + 1)} disabled={currentPage >= numPages} title="Next page" aria-label="Next page">
            <ChevronRight size={13} />
          </button>
        </div>
        <span className="cv-pdf-toolbar-sep" />
        <div className="cv-pdf-toolbar-group">
          <button type="button" className="cv-btn-icon" onClick={zoomOut} disabled={scale <= MIN_SCALE + 0.001} title="Zoom out" aria-label="Zoom out">
            <Minus size={13} />
          </button>
          <button type="button" className="cv-pdf-zoom-label" onClick={() => applyLayoutChange(() => setZoomMode("fit"))} title="Fit to width">
            {Math.round(scale * 100)}%
          </button>
          <button type="button" className="cv-btn-icon" onClick={zoomIn} disabled={scale >= MAX_SCALE - 0.001} title="Zoom in" aria-label="Zoom in">
            <Plus size={13} />
          </button>
          <button type="button" className="cv-btn-icon" onClick={rotate} title="Rotate clockwise" aria-label="Rotate clockwise">
            <RotateCw size={13} />
          </button>
        </div>
      </div>
      <div className="cv-pdf-scroll" ref={scrollRef} onScroll={handleScroll}>
        <div className="cv-pdf-pages">
          {pageInfos.map((info) => (
            <div
              key={`${info.n}-${info.w}x${info.h}`}
              ref={registerPageDiv(info.n)}
              className="cv-pdf-page"
              data-page={info.n}
              style={{ width: `${info.w}px`, height: `${info.h}px` }}
            >
              <span className="cv-pdf-page-placeholder">Page {info.n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
