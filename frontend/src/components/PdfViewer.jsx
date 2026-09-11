// React is required by the test JSX transform.
 
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, Minus, Plus, RotateCw, Search, X } from "lucide-react";
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

// WASM image decoders (JPEG2000/JBIG2) and the standard font set are copied
// into public/pdfjs/ by vite.config.js; pdf.js appends fixed filenames here.
const PDFJS_ASSET_BASE = `${import.meta.env.BASE_URL || "/"}pdfjs/`;

const ZOOM_STEPS = [0.5, 0.65, 0.8, 1, 1.25, 1.5, 2, 2.5, 3];
const MIN_SCALE = 0.35;
const MAX_SCALE = 4;
// Pre-render well beyond the viewport so pages are painted before the
// reader scrolls to them (avoids placeholder flashing mid-scroll).
const PAGE_RENDER_MARGIN = "1500px 0px";
const RENDER_MARGIN_PX = 1500;
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

// Reading position survives reopening the same document (and app restarts).
const scrollStorageKey = (fileId) => `canvenient-pdf-scroll:${fileId}`;

function loadSavedScroll(fileId) {
  try {
    const raw = window.localStorage.getItem(scrollStorageKey(fileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const ratio = Number(parsed.r);
    return {
      ratio: Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : null,
      page: Math.max(1, Math.round(Number(parsed.p) || 1)),
    };
  } catch {
    return null;
  }
}

function saveScrollPosition(fileId, page, ratio) {
  try {
    window.localStorage.setItem(scrollStorageKey(fileId), JSON.stringify({ p: page, r: ratio }));
  } catch {
    // Storage may be unavailable; position memory is best-effort.
  }
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState("idle");
  const [searchMatches, setSearchMatches] = useState([]);
  const [activeMatch, setActiveMatch] = useState(-1);

  const scrollRef = useRef(null);
  const docRef = useRef(null);
  const pageDivsRef = useRef(new Map());
  const renderStateRef = useRef(new Map());
  const renderTasksRef = useRef(new Map());
  const observerRef = useRef(null);
  const scrollRatioRef = useRef(null);
  const scrollFrameRef = useRef(0);
  const pageInfosRef = useRef(new Map());
  const textCacheRef = useRef(new Map());
  const searchInputRef = useRef(null);
  const scrollSaveAtRef = useRef(0);

  const gotoPage = useCallback((page) => {
    const clamped = Math.min(Math.max(1, page), numPages || 1);
    const div = pageDivsRef.current.get(clamped);
    if (div && typeof div.scrollIntoView === "function") div.scrollIntoView({ block: "start" });
    setCurrentPage(clamped);
    setPageInput(String(clamped));
  }, [numPages]);

  // The pages are painted onto canvases with no text layer, so searching means
  // extracting the text items pdf.js exposes per page. Item rectangles come
  // back in unrotated scale-1 coordinates and are scaled again for overlays.
  const extractPageText = useCallback(async (doc, pageNumber) => {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    let text = "";
    const items = [];
    for (const item of content.items) {
      if (typeof item.str !== "string" || !item.str) continue;
      const [vx, vy] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
      const fontHeight = Math.hypot(item.transform[2], item.transform[3]) || item.height || 10;
      items.push({
        str: item.str,
        start: text.length + (text ? 1 : 0),
        rect: { x: vx, y: vy - fontHeight, w: item.width || 0, h: fontHeight },
      });
      text += (text ? " " : "") + item.str;
    }
    return { text, items };
  }, []);

  const runSearch = useCallback(async (rawQuery) => {
    const doc = docRef.current;
    const query = rawQuery.trim().toLowerCase();
    if (!doc || !query) {
      setSearchStatus("idle");
      setSearchMatches([]);
      setActiveMatch(-1);
      return;
    }
    setSearchStatus("extracting");
    try {
      const cache = textCacheRef.current;
      for (let n = 1; n <= doc.numPages; n += 1) {
        if (!cache.has(n)) cache.set(n, await extractPageText(doc, n));
      }
      const matches = [];
      for (let n = 1; n <= doc.numPages; n += 1) {
        const { text, items } = cache.get(n);
        const lower = text.toLowerCase();
        let from = 0;
        for (;;) {
          const start = lower.indexOf(query, from);
          if (start === -1) break;
          const end = start + query.length;
          matches.push({
            page: n,
            segments: items
              .filter((item) => item.start < end && item.start + item.str.length > start)
              .map((item) => item.rect),
          });
          from = start + query.length;
        }
      }
      setSearchStatus("done");
      setSearchMatches(matches);
      setActiveMatch(matches.length ? 0 : -1);
      if (matches.length) gotoPage(matches[0].page);
    } catch {
      // Extraction can fail on damaged documents; search degrades to no-op.
      setSearchStatus("idle");
      setSearchMatches([]);
      setActiveMatch(-1);
    }
  }, [extractPageText, gotoPage]);

  const stepMatch = useCallback((direction) => {
    if (!searchMatches.length) return;
    const next = (activeMatch + direction + searchMatches.length) % searchMatches.length;
    setActiveMatch(next);
    gotoPage(searchMatches[next].page);
  }, [activeMatch, gotoPage, searchMatches]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchMatches([]);
    setActiveMatch(-1);
  }, []);

  // Debounced auto-search while typing; extraction happens once per document.
  useEffect(() => {
    if (!searchOpen) return undefined;
    const handle = window.setTimeout(() => runSearch(searchQuery), 250);
    return () => window.clearTimeout(handle);
  }, [searchOpen, searchQuery, runSearch]);

  // ⌘F / Ctrl+F opens the in-document find bar while a document is open.
  useEffect(() => {
    if (status !== "ready") return undefined;
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status]);

  // Match rectangles in scale-1 unrotated coordinates, grouped for overlay
  // rendering; user rotation invalidates them, so they hide until reset.
  const highlightsByPage = useMemo(() => {
    const map = new Map();
    if (rotation % 360 !== 0) return map;
    searchMatches.forEach((match, index) => {
      const list = map.get(match.page) ?? [];
      for (const rect of match.segments) list.push({ rect, active: index === activeMatch });
      map.set(match.page, list);
    });
    return map;
  }, [activeMatch, rotation, searchMatches]);

  // Fetch the bytes through the backend proxy and parse the document.
  useEffect(() => {
    if (!token || !fileId) return undefined;
    let cancelled = false;
    const docController = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets viewer state while the new document loads
    setStatus("loading");
    setError("");
    setNumPages(0);
    setBaseDims(null);
    setCurrentPage(1);
    setPageInput("1");
    setZoomMode("fit");
    setRotation(0);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchStatus("idle");
    setSearchMatches([]);
    setActiveMatch(-1);
    renderStateRef.current = new Map();
    renderTasksRef.current = new Map();
    textCacheRef.current = new Map();

    (async () => {
      try {
        const [{ blob }, lib] = await Promise.all([
          fetchCanvasFileContent(token, fileId),
          loadPdfjs(),
        ]);
        if (cancelled) return;
        const data = await blobToArrayBuffer(blob);
        if (cancelled) return;
        const loadingTask = lib.getDocument({
          data: new Uint8Array(data),
          wasmUrl: `${PDFJS_ASSET_BASE}wasm/`,
          standardFontDataUrl: `${PDFJS_ASSET_BASE}standard_fonts/`,
        });
        const doc = await loadingTask.promise;
        if (cancelled) {
          loadingTask.destroy?.();
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
          loadingTask.destroy?.();
          return;
        }
        docController.signal.addEventListener("abort", () => loadingTask.destroy?.());
        setNumPages(total);
        setBaseDims(dims);
        // Reopen at the remembered position; the layout effect consumes the
        // scroll ratio as soon as the page boxes are laid out.
        const saved = loadSavedScroll(fileId);
        if (saved) {
          if (saved.ratio != null) scrollRatioRef.current = saved.ratio;
          setCurrentPage(saved.page);
          setPageInput(String(saved.page));
        }
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
    const info = pageInfosRef.current.get(pageNumber);
    if (!doc || !div || !info) return;
    const state = renderStateRef.current;
    const key = `${info.w}x${info.h}`;
    let entry = state.get(pageNumber);
    if (!entry) {
      entry = { status: "pending", key: null, desired: null };
      state.set(pageNumber, entry);
    }
    if (entry.status === "rendering") {
      // Remember the newest size; the running render re-checks when it finishes.
      entry.desired = key;
      return;
    }
    if (entry.key === key) return;
    entry.status = "rendering";
    entry.desired = key;
    try {
      const page = await doc.getPage(pageNumber);
      if (pageDivsRef.current.get(pageNumber) !== div) {
        entry.status = entry.key ? "done" : "pending";
        return;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(info.w * dpr);
      canvas.height = Math.floor(info.h * dpr);
      canvas.style.width = `${info.w}px`;
      canvas.style.height = `${info.h}px`;
      const viewport = page.getViewport({ scale: info.scale * dpr });
      const renderTask = page.render({ canvasContext: canvas.getContext("2d"), viewport });
      renderTasksRef.current.set(pageNumber, renderTask);
      await renderTask.promise;
      // Swap in place: the previously rendered page stays visible until this
      // canvas is ready, so zooming never blanks the page out.
      div.querySelectorAll("canvas").forEach((existing) => existing.remove());
      div.appendChild(canvas);
      div.classList.add("is-rendered");
      entry.key = key;
      entry.status = "done";
    } catch (err) {
      if (err?.name === "RenderingCancelledException") {
        entry.status = entry.key ? "done" : "pending";
      } else {
        entry.status = "error";
        entry.key = key;
        div.classList.add("is-error");
      }
    } finally {
      renderTasksRef.current.delete(pageNumber);
      if (entry.desired && entry.desired !== entry.key) renderPage(pageNumber);
    }
  }, []);

  const needsRender = useCallback((pageNumber) => {
    const info = pageInfosRef.current.get(pageNumber);
    if (!info) return false;
    const entry = renderStateRef.current.get(pageNumber);
    if (!entry) return true;
    if (entry.status === "rendering") return false;
    return entry.key !== `${info.w}x${info.h}`;
  }, []);

  // IntersectionObserver is the primary lazy-render trigger, but some webviews
  // silently never deliver IO callbacks; renderVisiblePages() keeps rendering
  // working from scroll and resize signals alone.
  const renderVisiblePages = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop - RENDER_MARGIN_PX;
    const bottom = el.scrollTop + el.clientHeight + RENDER_MARGIN_PX;
    pageDivsRef.current.forEach((div, n) => {
      const offset = div.offsetTop;
      if (offset + div.offsetHeight >= top && offset <= bottom && needsRender(n)) renderPage(n);
    });
  }, [needsRender, renderPage]);

  // Stable per-page ref: page elements persist across zoom changes so the old
  // canvas can stay on screen until the re-render swaps in.
  const attachPageDiv = useCallback((div) => {
    if (!div) return undefined;
    const pageNumber = Number(div.dataset.page);
    if (!pageNumber) return undefined;
    pageDivsRef.current.set(pageNumber, div);
    if (!renderStateRef.current.has(pageNumber)) {
      renderStateRef.current.set(pageNumber, { status: "pending", key: null, desired: null });
    }
    if (observerRef.current) observerRef.current.observe(div);
    return () => {
      pageDivsRef.current.delete(pageNumber);
      const task = renderTasksRef.current.get(pageNumber);
      if (task) {
        task.cancel();
        renderTasksRef.current.delete(pageNumber);
      }
      renderStateRef.current.delete(pageNumber);
    };
  }, []);

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

  // Zoom and rotation resize the page boxes; keep the reading position stable
  // and stretch the already-rendered canvases until the re-renders swap in.
  useLayoutEffect(() => {
    pageDivsRef.current.forEach((div, n) => {
      const info = pageInfosRef.current.get(n);
      const canvas = div.querySelector("canvas");
      if (canvas && info) {
        canvas.style.width = `${info.w}px`;
        canvas.style.height = `${info.h}px`;
      }
    });
    if (scrollRatioRef.current == null) {
      renderVisiblePages();
      return;
    }
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
      // Persist the reading position, throttled to one write per 400ms.
      if (el.scrollHeight > 0 && Date.now() - scrollSaveAtRef.current > 400) {
        scrollSaveAtRef.current = Date.now();
        saveScrollPosition(fileId, best, el.scrollTop / el.scrollHeight);
      }
    });
  }, [fileId, renderVisiblePages]);

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
        <span className="cv-pdf-toolbar-sep" />
        <div className="cv-pdf-toolbar-group">
          {searchOpen ? (
            <>
              <div className="cv-pdf-search-box">
                <Search size={12} />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      stepMatch(event.shiftKey ? -1 : 1);
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      closeSearch();
                    }
                  }}
                  placeholder="Find in document"
                  aria-label="Search in document"
                  autoFocus
                />
                <span className="cv-pdf-search-count" aria-live="polite">
                  {searchStatus === "extracting"
                    ? "…"
                    : searchQuery.trim()
                      ? `${activeMatch + 1}/${searchMatches.length}`
                      : ""}
                </span>
              </div>
              <button type="button" className="cv-btn-icon" onClick={() => stepMatch(-1)} disabled={!searchMatches.length} title="Previous match" aria-label="Previous match">
                <ChevronUp size={13} />
              </button>
              <button type="button" className="cv-btn-icon" onClick={() => stepMatch(1)} disabled={!searchMatches.length} title="Next match" aria-label="Next match">
                <ChevronDown size={13} />
              </button>
              <button type="button" className="cv-btn-icon" onClick={closeSearch} title="Close search" aria-label="Close search">
                <X size={13} />
              </button>
            </>
          ) : (
            <button type="button" className="cv-btn-icon" onClick={() => setSearchOpen(true)} title="Search in document (⌘F)" aria-label="Search in document">
              <Search size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="cv-pdf-scroll" ref={scrollRef} onScroll={handleScroll}>
        <div className="cv-pdf-pages">
          {pageInfos.map((info) => (
            <div
              key={info.n}
              ref={attachPageDiv}
              className="cv-pdf-page"
              data-page={info.n}
              style={{ width: `${info.w}px`, height: `${info.h}px` }}
            >
              <span className="cv-pdf-page-placeholder">Page {info.n}</span>
              {(highlightsByPage.get(info.n) || []).map((seg, segIndex) => (
                <span
                  key={segIndex}
                  className={`cv-pdf-highlight${seg.active ? " is-active" : ""}`}
                  style={{
                    left: `${seg.rect.x * scale}px`,
                    top: `${seg.rect.y * scale}px`,
                    width: `${Math.max(seg.rect.w * scale, 3)}px`,
                    height: `${Math.max(seg.rect.h * scale, 3)}px`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
