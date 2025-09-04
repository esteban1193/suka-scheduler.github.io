import React, { useEffect, useMemo, useRef, useState } from "react";

/* =====================
   Constants & Helpers
   ===================== */
const SLOT_MIN = 30;
const SLOT_PX = 40; // each 30-min slot height (px)

const generateTimeSlots = () => {
  const slots = [];
  let start = 9 * 60 + 30; // 09:30
  const end = 23 * 60; // 23:00
  while (start < end) {
    const h = Math.floor(start / 60).toString().padStart(2, "0");
    const m = (start % 60).toString().padStart(2, "0");
    slots.push(`${h}:${m}`);
    start += SLOT_MIN;
  }
  return slots;
};
const timeSlots = generateTimeSlots();

const DURATIONS = [30, 60, 90, 120, 150, 180, 210, 240];

const DEFAULT_CATEGORIES = [
  { key: "general", name: "כללי", color: "#60a5fa" },
  { key: "music", name: "מוזיקה", color: "#34d399" },
  { key: "teaching", name: "הוראה", color: "#fbbf24" },
  { key: "logistics", name: "לוגיסטיקה", color: "#f87171" },
  { key: "other", name: "אחר", color: "#a78bfa" },
];

const STORAGE_KEY = "interactiveScheduler_v2";

const HOLIDAYS_IL = {
  // 2024 (examples)
  "2024-10-02": "ראש השנה (א׳)",
  "2024-10-03": "ראש השנה (ב׳)",
  "2024-10-11": "ערב יום כיפור",
  "2024-10-12": "יום כיפור",
  "2024-10-16": "ערב סוכות",
  "2024-10-17": "חג סוכות (א׳)",
  "2024-10-24": "הושענא רבה",
  "2024-10-25": "שמיני עצרת / שמחת תורה",
  // 2025 (כולל הדוגמאות שביקשת)
  "2025-04-12": "ערב פסח",
  "2025-04-13": "פסח (א׳)",
  "2025-04-20": "שביעי של פסח",
  "2025-06-02": "ערב שבועות",
  "2025-06-03": "שבועות",
  "2025-10-06": "ערב סוכות",
  "2025-10-07": "חג סוכות (א׳)",
  "2025-10-08": "חוה״מ סוכות",
  "2025-10-09": "חוה״מ סוכות",
  "2025-10-10": "חוה״מ סוכות",
  "2025-10-11": "חוה״מ סוכות",
  "2025-10-12": "חוה״מ סוכות",
  "2025-10-13": "הושענא רבה (ערב שמיני עצרת)",
  "2025-10-14": "שמיני עצרת / שמחת תורה",};
const getHolidayLabel = (dateKey) => HOLIDAYS_IL[dateKey] || null;


const safeNumber = (v) => (v === "" || v == null || isNaN(Number(v)) ? "" : Number(v));
const slotIndex = (time) => timeSlots.indexOf(time);
const normalizeOrg = (s) => (s && s.trim()) ? s.trim() : "ללא ארגון";
const durationLabel = (m) => {
  if (m % 60 === 0) {
    const h = m / 60;
    return `${h} ${h === 1 ? "שעה" : "שעות"}`;
  }
  return `${Math.floor(m / 60)}:${(m % 60).toString().padStart(2, "0")} ש"`;
};

/** Calculate time from Y position inside day column */
const timeFromClientY = (container, clientY) => {
  const rect = container.getBoundingClientRect();
  const y = Math.max(0, Math.min(clientY - rect.top, timeSlots.length * SLOT_PX - 1));
  const idx = Math.floor(y / SLOT_PX);
  return timeSlots[idx];
};

/* =====================
   Component
   ===================== */
export default function InteractiveSchedule() {
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [newEvent, setNewEvent] = useState({
    confirmed: false,
    title: "",
    duration: 30,
    price: "",
    categoryKey: "general",
    description: "",
    contact: "",
    organization: "",
  ,
    phone: "",
    imageDataUrl: ""
  });
  const [draggedEventId, setDraggedEventId] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [conflictMsg, setConflictMsg] = useState("");
  
  const [showThumbs, setShowThumbs] = useState(true);
  const [showPricesOnExport, setShowPricesOnExport] = useState(true);
const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = (today.getMonth() + 1).toString().padStart(2, "0");
    const d = today.getDate().toString().padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [importText, setImportText] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterOrg, setFilterOrg] = useState("all");
  const [filterConfirmed, setFilterConfirmed] = useState("all"); // all | yes | no
  const [zoomDay, setZoomDay] = useState(null); // number | null
  const [sumPlacedOnly, setSumPlacedOnly] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [dayColWidthPx, setDayColWidthPx] = useState(176); // adjustable day column width
  const [sidebarWidthPx, setSidebarWidthPx] = useState(320); // resizable sidebar
  const [sidebarPos, setSidebarPos] = useState("left"); // "left" | "right"

  // resizer refs (sidebar)
  const isResizingSidebar = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  // ===== Resize event (change duration by dragging bottom edge) =====
  const [resizingInfo, setResizingInfo] = useState(null); // { id, startY, originalBlocks, startIdx, dayIndex }

  const computeMaxBlocks = (info) => {
    // Can't extend beyond next event on same day, nor beyond end-of-day.
    let maxEndIdx = timeSlots.length;
    events.forEach((ev) => {
      if (!ev.placed || ev.dayIndex !== info.dayIndex || ev.id === info.id) return;
      const s2 = slotIndex(ev.time);
      if (s2 >= info.startIdx) {
        maxEndIdx = Math.min(maxEndIdx, s2);
      }
    });
    const maxBlocks = Math.max(1, maxEndIdx - info.startIdx);
    return maxBlocks;
  };

  const startResize = (eventObj, clientY) => {
    const startIdx = slotIndex(eventObj.time);
    const originalBlocks = Math.ceil((eventObj.duration || 30) / SLOT_MIN);
    setResizingInfo({
      id: eventObj.id,
      startY: clientY,
      originalBlocks,
      startIdx,
      dayIndex: eventObj.dayIndex,
    });
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ns-resize";
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!resizingInfo) return;
      const dy = e.clientY - resizingInfo.startY;
      let deltaBlocks = Math.round(dy / SLOT_PX);
      let newBlocks = Math.max(1, resizingInfo.originalBlocks + deltaBlocks);
      const maxBlocks = computeMaxBlocks(resizingInfo);
      if (newBlocks > maxBlocks) newBlocks = maxBlocks;
      const newDuration = newBlocks * SLOT_MIN;
      setEvents((prev) => prev.map((ev) => (ev.id === resizingInfo.id ? { ...ev, duration: newDuration } : ev)));
    };
    const onUp = () => {
      if (!resizingInfo) return;
      setResizingInfo(null);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizingInfo, events]);

  
  // ===== Load persisted state (once) =====
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && typeof data === "object") {
        if (typeof data.startDate === "string") setStartDate(data.startDate);
        if (Array.isArray(data.events)) setEvents(data.events);
        if (Array.isArray(data.categories)) setCategories(data.categories);
        if (typeof data.sidebarWidthPx === "number") setSidebarWidthPx(data.sidebarWidthPx);
        if (data.sidebarPos === "left" || data.sidebarPos === "right") setSidebarPos(data.sidebarPos);
        if (typeof data.dayColWidthPx === "number") setDayColWidthPx(data.dayColWidthPx);
        if (typeof data.sumPlacedOnly === "boolean") setSumPlacedOnly(data.sumPlacedOnly);
        if (typeof data.filterCategory === "string") setFilterCategory(data.filterCategory);
        if (typeof data.filterOrg === "string") setFilterOrg(data.filterOrg);
        if (typeof data.filterConfirmed === "string") setFilterConfirmed(data.filterConfirmed);
        if (typeof data.searchText === "string") setSearchText(data.searchText);
      }
    } catch (e) {
      console.warn("Failed to load saved schedule:", e);
    }
    if (typeof data.showThumbs === "boolean") setShowThumbs(data.showThumbs);
  if (typeof data.showPricesOnExport === "boolean") setShowPricesOnExport(data.showPricesOnExport);
};

  }, []);

  const catByKey = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.key, c])),
    [categories]
  );

  const orgOptions = useMemo(() => {
    const set = new Set();
    events.forEach((e) => set.add(normalizeOrg(e.organization)));
    return Array.from(set).sort((a,b)=>a.localeCompare(b,'he'));
  }, [events]);

  const days = useMemo(() => {
    const base = new Date(startDate);
    if (isNaN(base.getTime())) return [];
    return Array.from({ length: 9 }, (_, i) => {
      const dt = new Date(base);
      dt.setDate(base.getDate() + i);
      const weekdayLong = dt.toLocaleDateString("he-IL", { weekday: "long" }); // e.g., "יום שני"
      const dateShort = dt.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }); // e.g., "27/06"
      const dateKey = dt.toISOString().slice(0, 10);
      return { labelTop: weekdayLong, labelBottom: dateShort, dateKey };
    });
  }, [startDate]);

  const hasConflict = (candidate) => {
    if (candidate.dayIndex == null || !candidate.time) return false;
    const startIdx = slotIndex(candidate.time);
    const blocks = Math.ceil(candidate.duration / SLOT_MIN);
    const endIdx = startIdx + blocks; // exclusive
    return events.some((e) => {
      if (e.id === candidate.id) return false;
      if (!e.placed || e.dayIndex !== candidate.dayIndex) return false;
      const s2 = slotIndex(e.time);
      const e2 = s2 + Math.ceil(e.duration / SLOT_MIN);
      return startIdx < e2 && s2 < endIdx;
    });
  };

  const addEvent = () => {
    if (!newEvent.title.trim()) return;
    const id = Date.now() + Math.random();
    setEvents((prev) => [
      ...prev,
      { ...newEvent, id, placed: false, price: safeNumber(newEvent.price), confirmed: !!newEvent.confirmed },
    ]);
    setNewEvent({
      confirmed: false,
      title: "",
      duration: 30,
      price: "",
      categoryKey: newEvent.categoryKey,
      description: "",
      contact: "",
      organization: "",
    });
  };

  const placeEventExact = (dayIndex, time, idToPlace, copy = false) => {
    setConflictMsg("");
    const evToPlace = idToPlace
      ? events.find((e) => e.id === idToPlace)
      : events.find((e) => !e.placed);
    if (!evToPlace) return;
    const candidate = { ...evToPlace, dayIndex, time, placed: true };
    if (hasConflict(candidate)) {
      setConflictMsg(`התנגשות: כבר יש אירוע בזמן הזה ביום ${dayIndex + 1}.`);
      return;
    }
    if (copy) {
      const clone = { ...candidate, id: Date.now() + Math.random() };
      setEvents((prev) => [...prev, { ...clone }]);
    } else {
      setEvents((prev) => prev.map((e) => (e.id === evToPlace.id ? candidate : e)));
    }
  };

  // absolute position & height
  const boxStyleFor = (e) => {
    const startIdx = slotIndex(e.time);
    const blocks = Math.ceil(e.duration / SLOT_MIN);
    return {
      position: "absolute",
      top: startIdx * SLOT_PX,
      height: blocks * SLOT_PX - 2,
      left: 4,
      right: 4,
      borderRadius: 8,
    };
  };

  // search + filters
  const searchMatch = (e) => {
    const q = searchText.trim().toLowerCase();
    if (!q) return true;
    return [e.title, e.contact, e.description, e.organization]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  };
  const matchCategory = (e) => filterCategory === "all" || e.categoryKey === filterCategory;
  const matchOrg = (e) => filterOrg === "all" || normalizeOrg(e.organization) === filterOrg;
  const matchConfirmed = (e) => filterConfirmed === "all" || (filterConfirmed === "yes" && !!e.confirmed) || (filterConfirmed === "no" && !e.confirmed);
  const visibleEventsFilter = (e) => matchCategory(e) && matchOrg(e) && matchConfirmed(e) && searchMatch(e);


  // ===== Auto-save to localStorage on changes =====
  useEffect(() => {
    try {
      const payload = { startDate, events, categories,
        sidebarWidthPx,
        sidebarPos,
        dayColWidthPx,
        sumPlacedOnly,
        filterCategory,
        filterOrg,
        filterConfirmed,
        searchText,
      , showThumbs, showPricesOnExport };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("Failed to save schedule:", e);
    }
  }, [startDate, events, categories, sidebarWidthPx, sidebarPos, dayColWidthPx, sumPlacedOnly, filterCategory, filterOrg, filterConfirmed, searchText]);


  // Export
  const exportJSON = () => {
    const payload = { startDate, events, categories };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "schedule.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  
  
  
  const exportCSV = () => {
    // כותרות בעברית
    let headers = ["כותרת","תאריך","מס׳ יום","שעה","משך (דק׳)","קטגוריה","מחיר","תיאור","איש קשר","טלפון","ארגון","נעוץ","סופי"];
    if (!showPricesOnExport) headers = headers.filter(h => h !== "מחיר");

    // הכנה לשורות
    const rows = events.map((e) => {
      const date = e.dayIndex != null ? days[e.dayIndex]?.dateKey || "" : "";
      const catName = (catByKey[e.categoryKey]?.name) || "כללי";
      const row = [
  e.title ?? "",
  date,
  e.dayIndex ?? "",
  e.time ?? "",
  e.duration ?? "",
  catName,
  (typeof e.price === "number" ? e.price : ""),
  e.description ?? "",
  e.contact ?? "",
  e.phone ?? "",
  e.organization ?? "",
  e.placed ? 1 : 0,
  e.confirmed ? 1 : 0,
];
// הסרת מחיר אם ביקש להסתיר
const idxPrice = headers.indexOf("מחיר");
if (idxPrice === -1) { row.splice(6, 1); }
return row;
});

    // פונקציית ציטוט בטוחה ל-CSV (ללא רג'קסים)
    const needsQuote = (s) => s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r");
    const quoteCell = (val) => {
      const s = String(val ?? "");
      return needsQuote(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const csv = [headers, ...rows]
      .map((arr) => arr.map(quoteCell).join(","))
      .join("\n");

    // הוספת BOM אמיתי ל-UTF-8 כדי למנוע ג'יבריש באקסל
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "schedule.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import (paste)
  const importJSON = () => {
    try {
      const data = JSON.parse(importText);
      if (data && Array.isArray(data.events) && typeof data.startDate === "string") {
        setStartDate(data.startDate);
        if (Array.isArray(data.categories)) setCategories(data.categories);
        setEvents(data.events);
        setConflictMsg(`ייבוא הושלם: נטענו ${data.events.length} אירועים.`);
      } else {
        setConflictMsg("פורמט ייבוא לא תקין.");
      }
    } catch (e) {
      setConflictMsg("שגיאה בפענוח JSON.");
    }
  };

  // Import (file)
  const onImportFile = (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (data && Array.isArray(data.events) && typeof data.startDate === "string") {
          setStartDate(data.startDate);
          if (Array.isArray(data.categories)) setCategories(data.categories);
          setEvents(data.events);
          setConflictMsg(`ייבוא מהקובץ הצליח: ${data.events.length} אירועים נטענו.`);
        } else {
          setConflictMsg("קובץ JSON לא תואם לפורמט צפוי.");
        }
      } catch (err) {
        setConflictMsg("שגיאה בקריאת הקובץ (JSON לא תקין).");
      }
      ev.target.value = ""; // allow importing same file again
    };
    reader.onerror = () => {
      setConflictMsg("שגיאה בקריאת הקובץ.");
      ev.target.value = "";
    };
    reader.readAsText(file, "utf-8");
  };

  const printPDF = // Inject print CSS once
  useEffect(() => {
    if (!document.getElementById("print-hide-prices-css")) {
      const style = document.createElement("style");
      style.id = "print-hide-prices-css";
      style.textContent = "@media print {.hide-prices-print .price-inline{display:none !important;}}";
      document.head.appendChild(style);
    }
  }, []);

  // Toggle body class for print hiding
  useEffect(() => {
    document.body.classList.toggle("hide-prices-print", !showPricesOnExport);
  }, [showPricesOnExport]);

  const printPDF = () => window.print();

  // totals
  const dayTotal = (dayIndex) =>
    events
      .filter((e) => (sumPlacedOnly ? e.placed : true) && e.dayIndex === dayIndex)
      .reduce((acc, e) => acc + (typeof e.price === "number" ? e.price : 0), 0);

  const categoryTotals = useMemo(() => {
    const map = Object.fromEntries(categories.map((c) => [c.key, 0]));
    events.forEach((e) => {
      if (!sumPlacedOnly || e.placed) {
        const p = typeof e.price === "number" ? e.price : 0;
        const key = e.categoryKey ?? "general";
        map[key] = (map[key] || 0) + p;
      }
    });
    return map;
  }, [events, sumPlacedOnly, categories]);

  const orgTotals = useMemo(() => {
    const map = {};
    events.forEach((e) => {
      if (!sumPlacedOnly || e.placed) {
        const p = typeof e.price === "number" ? e.price : 0;
        const org = normalizeOrg(e.organization);
        map[org] = (map[org] || 0) + p;
      }
    });
    return map;
  }, [events, sumPlacedOnly]);
  const categoriesGrandTotal = useMemo(() => Object.values(categoryTotals).reduce((a, b) => a + (b || 0), 0), [categoryTotals]);
  const orgGrandTotal = useMemo(() => Object.values(orgTotals).reduce((a, b) => a + (b || 0), 0), [orgTotals]);


  const selectedEvent = events.find((e) => e.id === selectedEventId) || null;

  const updateSelectedEvent = (patch) => {
    if (!selectedEvent) return;
    const candidate = { ...selectedEvent, ...patch };
    if (candidate.price !== undefined) candidate.price = safeNumber(candidate.price);
    if (candidate.placed && hasConflict(candidate)) {
      setConflictMsg("לא ניתן לעדכן – יש חפיפה עם אירוע אחר.");
      return;
    }
    setEvents((prev) => prev.map((e) => (e.id === selectedEvent.id ? candidate : e)));
  };

  const deleteEvent = (id) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    if (selectedEventId === id) setSelectedEventId(null);
  };
  const toggleConfirmed = (id) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, confirmed: !e.confirmed } : e)));
  };


  // sidebar resizer handlers
  const onResizeStart = (e) => {
    isResizingSidebar.current = true;
    startX.current = e.clientX;
    startW.current = sidebarWidthPx;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };
  useEffect(() => {
    const onMove = (e) => {
      if (!isResizingSidebar.current) return;
      const dx = e.clientX - startX.current;
      const dir = sidebarPos === "left" ? 1 : -1; // dragging to right expands when left; opposite when right
      const newW = Math.max(240, Math.min(520, startW.current + dir * dx));
      setSidebarWidthPx(newW);
    };
    const onUp = () => {
      if (!isResizingSidebar.current) return;
      isResizingSidebar.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [sidebarPos, sidebarWidthPx]);

  /* =====================
     UI
     ===================== */
  const isSidebarLeft = sidebarPos === "left";

  return (
    <div className="p-4 space-y-3 print:block print-page">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <label className="text-sm">תאריך התחלה:
          <input type="date" className="border p-1 ml-2" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={sumPlacedOnly} onChange={(e) => setSumPlacedOnly(e.target.checked)} />
          חשב סכומים רק לאירועים שננעצו
        </label>
        <label className="text-sm flex items-center gap-2">
          קטגוריה לתצוגה:
          <select className="border p-1" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="all">הכל</option>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm flex items-center gap-2">
          ארגון לתצוגה:
          <select className="border p-1" value={filterOrg} onChange={(e) => setFilterOrg(e.target.value)}>
            <option value="all">הכל</option>
            {orgOptions.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>
        <label className="text-sm flex items-center gap-2">
          סטטוס:
          <select className="border p-1" value={filterConfirmed} onChange={(e) => setFilterConfirmed(e.target.value)}>
            <option value="all">הכל</option>
            <option value="yes">סופיים</option>
            <option value="no">לא סופיים</option>
          </select>
        </label>
        <label className="text-sm flex items-center gap-2">
          חיפוש:
          <input type="text" className="border p-1" placeholder="שם / איש קשר / ארגון / תיאור" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
          {searchText && <button className="text-xs border rounded px-2 py-1" onClick={() => setSearchText("")}>נקה</button>}
        </label>

        {/* Day width control */}
        <label className="text-sm flex items-center gap-2">
          רוחב יום (px):
          <input
            type="range"
            min={120}
            max={280}
            step={4}
            value={dayColWidthPx}
            onChange={(e) => setDayColWidthPx(Number(e.target.value))}
          />
          <span className="text-xs text-gray-600">{dayColWidthPx}px</span>
        </label>

        {/* Sidebar position */}
        <label className="text-sm flex items-center gap-2">
          מיקום סיידבר:
          <select className="border p-1" value={sidebarPos} onChange={(e) => setSidebarPos(e.target.value)}>
            <option value="left">שמאל</option>
            <option value="right">ימין</option>
          </select>
        </label>

        <button className="bg-gray-800 text-white px-3 py-1 rounded" onClick={printPDF}>הדפס / ייצא PDF</button>
        <button className="bg-gray-700 text-white px-3 py-1 rounded" onClick={exportCSV}>ייצא CSV</button>
        <button className="px-3 py-1 rounded border" title="נקה את הנתונים השמורים בדפדפן" onClick={() => { localStorage.removeItem(STORAGE_KEY); }}>נקה שמירה מקומית</button>
        {conflictMsg && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded">{conflictMsg}</div>
        )}
      </div>

      {/* Main two-column layout with draggable splitter */}
      <div className="w-full flex gap-0 select-none" dir="ltr">
        {/* Sidebar */}
        <aside
          className="shrink-0 print:hidden"
          style={{ width: sidebarWidthPx, minWidth: 240, order: isSidebarLeft ? 0 : 2 }}
          dir="rtl"
        >
          <div className="sticky top-4 space-y-4 p-2">
            <div>
              <h2 className="font-bold mb-2">פתקים של אירועים</h2>
              <input type="text" placeholder="שם האירוע" className="border p-1 mb-2 w-full" value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <select className="border p-1 mb-2 w-full" value={newEvent.duration} onChange={(e) => setNewEvent({ ...newEvent, duration: Number(e.target.value) })}>
                  {DURATIONS.map((m) => (
                    <option key={m} value={m}>{durationLabel(m)}</option>
                  ))}
                </select>
                <input type="number" min="0" step="0.01" placeholder="מחיר ₪" className="border p-1 mb-2 w-full" value={newEvent.price} onChange={(e) => setNewEvent({ ...newEvent, price: e.target.value })} />
              </div>
              <input type="text" placeholder="איש קשר" className="border p-1 mb-2 w-full" value={newEvent.contact} onChange={(e) => setNewEvent({ ...newEvent, contact: e.target.value })} />
              <input type="text" placeholder="ארגון" className="border p-1 mb-2 w-full" value={newEvent.organization} onChange={(e) => setNewEvent({ ...newEvent, organization: e.target.value })} />
              <textarea placeholder="תיאור" className="border p-1 mb-2 w-full h-16" value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} />
              <select className="border p-1 mb-2 w-full" value={newEvent.categoryKey} onChange={(e) => setNewEvent({ ...newEvent, categoryKey: e.target.value })}>
                {categories.map((c) => (<option key={c.key} value={c.key}>{c.name}</option>))}
              </select>
              <button className="bg-green-600 text-white px-3 py-1 rounded w-full" onClick={addEvent}>הוסף פתק</button>

              <div className="flex items-center justify-between mt-4">
                <h3 className="font-bold">פתקים שלא ננעצו</h3>
              </div>
              {events.filter((e) => !e.placed && visibleEventsFilter(e)).length === 0 && (
                <div className="text-xs text-gray-500">אין פתקים ממתינים (או שלא נמצאו בחיפוש/פילטרים)</div>
              )}
              {events.filter((e) => !e.placed).filter(visibleEventsFilter).map((e) => (
                <div
                  key={e.id}
                  className="p-2 rounded mb-2 relative text-right"
                  style={{ background: catByKey[e.categoryKey]?.color || "#93c5fd" }}
                  draggable
                  onDragStart={(ev) => {
                    ev.dataTransfer.setData("text/event-id", String(e.id));
                    ev.dataTransfer.effectAllowed = "copyMove";
                    setDraggedEventId(e.id);
                  }}
                  onDragEnd={() => setDraggedEventId(null)}
                  dir="rtl"
                >
                  
                      
                      <div className="absolute top-1 left-1">
                        <button
                          type="button"
                          className="w-4 h-4 rounded-full border flex items-center justify-center text-[10px]"
                          style={{ background: e.confirmed ? "#16a34a" : "white", color: e.confirmed ? "white" : "#16a34a", borderColor: "#16a34a" }}
                          title={e.confirmed ? "אירוע סופי (לחץ לביטול)" : "סמן כסופי"}
                          onClick={(ev) => { ev.stopPropagation(); toggleConfirmed(e.id); }}
                        >
                          {e.confirmed ? "✓" : ""}
                        </button>
                      </div>
    <div className="absolute top-1 left-1">
                        <button
                          type="button"
                          className="w-4 h-4 rounded-full border flex items-center justify-center text-[10px]"
                          style={{ background: e.confirmed ? "#16a34a" : "white", color: e.confirmed ? "white" : "#16a34a", borderColor: "#16a34a" }}
                          title={e.confirmed ? "אירוע סופי (לחץ לביטול)" : "סמן כסופי"}
                          onClick={(ev) => { ev.stopPropagation(); toggleConfirmed(e.id); }}
                        >
                          {e.confirmed ? "✓" : ""}
                        </button>
                      </div>
    <div className="absolute top-1 right-1 flex gap-1">
                    <button className="bg-white/80 rounded px-1 text-[10px]" onClick={() => setSelectedEventId(e.id)} title="עריכה">✎</button>
                    <button className="bg-white/80 rounded px-1 text-[10px] text-red-600" onClick={() => deleteEvent(e.id)} title="מחיקה">✕</button>
                  </div>
{showThumbs && e.imageDataUrl ? (
  <img src={e.imageDataUrl} alt="" className="absolute top-1 right-7 w-5 h-5 rounded object-cover shadow pointer-events-none" />
) : null}

                  <div className="mt-5 text-base font-bold leading-5">{e.title || "ללא כותרת"}</div>
                  <div className="text-xs text-gray-800 mt-1">משך: {e.duration} דק' {typeof e.price === "number" || e.price ? `• ₪${e.price}` : ""}</div>
                  {e.organization && <div className="text-xs mt-1">ארגון: {e.organization}</div>}
                </div>
              ))}
            </div>

            {/* Editor */}
            {selectedEvent && (
              <div className="p-3 rounded border">
                <div className="font-bold mb-2">עריכת אירוע</div>
                <label className="block text-sm mb-1">שם האירוע</label>
                <input type="text" className="border p-1 w-full mb-2" value={selectedEvent.title} onChange={(e) => updateSelectedEvent({ title: e.target.value })} />

                <label className="block text-sm mb-1">משך</label>
                <select className="border p-1 w-full mb-2" value={selectedEvent.duration} onChange={(e) => updateSelectedEvent({ duration: Number(e.target.value) })}>
                  {DURATIONS.map((m) => (<option key={m} value={m}>{durationLabel(m)}</option>))}
                </select>

                <label className="block text-sm mb-1">מחיר (₪)</label>
                <input type="number" min="0" step="0.01" className="border p-1 w-full mb-2" value={selectedEvent.price} onChange={(e) => updateSelectedEvent({ price: e.target.value })} />

                <label className="block text-sm mb-1">איש קשר</label>
                <input type="text" className="border p-1 w-full mb-2" value={selectedEvent.contact || ""} onChange={(e) => updateSelectedEvent({ contact: e.target.value })} />

                <label className="block text-sm mb-1">ארגון</label>
                <input type="text" className="border p-1 w-full mb-2" value={selectedEvent.organization || ""} onChange={(e) => updateSelectedEvent({ organization: e.target.value })} />

                <label className="block text-sm mb-1">תיאור</label>
                <textarea className="border p-1 w-full h-20 mb-3" value={selectedEvent.description || ""} onChange={(e) => updateSelectedEvent({ description: e.target.value })} />

                <label className="block text-sm mb-1">קטגוריה</label>
                <select className="border p-1 w-full mb-3" value={selectedEvent.categoryKey || "general"} onChange={(e) => updateSelectedEvent({ categoryKey: e.target.value })}>
                  {categories.map((c) => (<option key={c.key} value={c.key}>{c.name}</option>))}
                </select>

                <div className="text-xs text-gray-600 mb-2">
                  {selectedEvent.placed && selectedEvent.dayIndex != null && selectedEvent.time ? `ממוקם: יום ${selectedEvent.dayIndex + 1} • ${selectedEvent.time}` : "עדיין לא ננעץ בלוח"}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="bg-indigo-600 text-white px-3 py-1 rounded" onClick={() => setSelectedEventId(null)}>סיום עריכה</button>
                  <button className="bg-red-600 text-white px-3 py-1 rounded" onClick={() => deleteEvent(selectedEvent.id)}>מחק אירוע</button>
                </div>
              </div>
            )}

            {/* Export / Import */}
            <div className="p-3 rounded border">
              <div className="font-bold mb-2">ייצוא / ייבוא</div>
              <label className="text-sm mb-2 flex items-center gap-2">
  <input type="checkbox" checked={showPricesOnExport} onChange={(e) => setShowPricesOnExport(e.target.checked)} />
  להציג מחירים ביצוא
</label>
<div className="grid grid-cols-2 gap-2 mb-2">
                <button className="bg-gray-800 text-white px-3 py-1 rounded w-full" onClick={exportJSON}>ייצא JSON</button>
                <button className="bg-gray-700 text-white px-3 py-1 rounded w-full" onClick={exportCSV}>ייצא CSV</button>
              </div>

              {/* File import */}
              <label className="text-sm mb-2 block">ייבוא מקובץ JSON:</label>
              <input type="file" accept="application/json,.json" onChange={onImportFile} className="mb-3" />

              {/* Paste import */}
              <label className="text-sm mb-1 block">או הדבק כאן JSON ולחץ ייבוא:</label>
              <textarea className="border p-2 w-full h-24 mb-2" placeholder='הדבק כאן JSON של לוח כדי לייבא' value={importText} onChange={(e) => setImportText(e.target.value)} />
              <button className="bg-gray-600 text-white px-3 py-1 rounded w-full" onClick={importJSON}>ייבא JSON מהטקסט</button>

              <div className="text-xs text-gray-600 mt-2">טיפ: בזמן גרירה אפשר ללחוץ ALT כדי <span className="font-medium">להעתיק</span> במקום להזיז.</div>
            </div>

            {/* Totals */}
                        <div className="p-3 rounded border">
              <div className="font-bold mb-2">סיכומי קטגוריות {sumPlacedOnly ? "(נעוצים בלבד)" : "(כולל פתקים)"}</div>
              <ul className="text-sm space-y-1">
                {categories.map((c) => (
                  <li key={c.key} className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded" style={{ background: c.color }} />
                      {c.name}
                    </span>
                    <span>₪{(categoryTotals[c.key] || 0).toLocaleString()}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between border-t pt-1 mt-2 font-semibold">
                  <span>סה״כ</span>
                  <span>₪{categoriesGrandTotal.toLocaleString()}</span>
                </li>
              </ul>
            </div>

                        <div className="p-3 rounded border">
              <div className="font-bold mb-2">סיכומי ארגונים {sumPlacedOnly ? "(נעוצים בלבד)" : "(כולל פתקים)"}</div>
              <ul className="text-sm space-y-1">
                {Object.entries(orgTotals).map(([org, sum]) => (
                  <li key={org} className="flex items-center justify-between">
                    <span className="truncate max-w-[12rem]" title={org}>{org}</span>
                    <span>₪{sum.toLocaleString()}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between border-t pt-1 mt-2 font-semibold">
                  <span>סה״כ</span>
                  <span>₪{orgGrandTotal.toLocaleString()}</span>
                </li>
              </ul>
            </div>

            {/* Category manager */}
            <div className="p-3 rounded border">
              <div className="font-bold mb-2">ניהול קטגוריות</div>
              <div className="space-y-2">
                {categories.map((c) => (
                  <div key={c.key} className="flex items-center gap-2">
                    <input className="border p-1 flex-1" value={c.name} onChange={(e) => setCategories((prev) => prev.map((x) => x.key === c.key ? { ...x, name: e.target.value } : x))} />
                    <input type="color" className="w-10 h-8 p-0 border rounded" value={c.color} onChange={(e) => setCategories((prev) => prev.map((x) => x.key === c.key ? { ...x, color: e.target.value } : x))} />
                    <button className="px-2 py-1 text-red-700 border rounded" onClick={() => {
                      setEvents((prev) => prev.map((e) => (e.categoryKey === c.key ? { ...e, categoryKey: "general" } : e)));
                      setCategories((prev) => prev.filter((x) => x.key !== c.key));
                    }} disabled={c.key === "general"}>מחק</button>
                  </div>
                ))}
              </div>
              <button className="mt-3 bg-emerald-600 text-white px-3 py-1 rounded" onClick={() => {
                const key = `cat_${Math.random().toString(36).slice(2, 7)}`;
                setCategories((prev) => [...prev, { key, name: "קטגוריה חדשה", color: "#93c5fd" }]);
              }}>הוסף קטגוריה</button>
              <div className="text-xs text-gray-500 mt-1">מחיקת קטגוריה מעבירה את האירועים שלה ל"כללי".</div>
            </div>
          </div>
        </aside>

        {/* Resizer handle */}
        <div
          onMouseDown={onResizeStart}
          style={{ cursor: "col-resize", width: 6, background: "#e5e7eb", order: 1 }}
          className="print:hidden hover:bg-gray-400 transition-colors"
          title="גרור כדי לשנות רוחב סיידבר"
        />

        {/* Schedule area */}
        <main className="flex-1 overflow-x-auto print-main" style={{ order: isSidebarLeft ? 2 : 0 }} dir="rtl">
          {/* Day headers */}
          <div className="grid grid-headers print-grid" style={{ gridTemplateColumns: `6rem repeat(${days.length}, ${dayColWidthPx}px)` }} dir="rtl">
            <div className="p-2 text-right text-sm font-bold bg-gray-50 border">שעה</div>
            {days.map((d, idx) => (
              <div key={d.dateKey} className="p-2 text-center bg-gray-50 border">
                <button className="font-bold underline underline-offset-4 hover:no-underline" onClick={() => setZoomDay(idx)} title="תקריב ליום זה">
                  {d.labelTop}
                </button>
                <div className="text-xs text-gray-600">{d.labelBottom}</div>
                {getHolidayLabel(d.dateKey) && (
                  <div className="text-[11px] text-rose-700 mt-0.5">{getHolidayLabel(d.dateKey)}</div>
                )}
                <div className="text-xs mt-1">סה"כ: <span className="font-medium">₪{dayTotal(idx).toLocaleString()}</span></div>
              </div>
            ))}
          </div>

          {/* Grid body */}
          <div className="grid grid-body border border-gray-300 bg-white print-grid" style={{ gridTemplateColumns: `6rem repeat(${days.length}, ${dayColWidthPx}px)` }} dir="rtl">
            {/* Hours column */}
            <div className="relative border-l border-gray-300">
              <div style={{ height: timeSlots.length * SLOT_PX }} className="relative">
                {timeSlots.map((t, i) => (
                  <div key={t} className="absolute right-0 pr-2 text-xs text-gray-700" style={{ top: i * SLOT_PX - 7 }}>
                    {t}
                  </div>
                ))}
              </div>
            </div>

            {/* Day columns */}
            {days.map((_, dayIndex) => (
              <div
                key={dayIndex}
                className="relative border-l border-gray-300 cursor-pointer"
                style={{ height: timeSlots.length * SLOT_PX, backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px)`, backgroundSize: `100% ${SLOT_PX}px` }}
                onClick={(ev) => {
                  const time = timeFromClientY(ev.currentTarget, ev.clientY);
                  placeEventExact(dayIndex, time);
                }}
                onDragOver={(ev) => {
                  ev.preventDefault();
                  ev.dataTransfer.dropEffect = ev.altKey ? "copy" : "move";
                }}
                onDrop={(ev) => {
                  ev.preventDefault();
                  const idStr = ev.dataTransfer.getData("text/event-id");
                  const id = idStr ? Number(idStr) : draggedEventId;
                  if (id == null) return;
                  const time = timeFromClientY(ev.currentTarget, ev.clientY);
                  placeEventExact(dayIndex, time, id, !!ev.altKey);
                  setDraggedEventId(null);
                }}
              >
                {/* Placed events */}
                {events
                  .filter((e) => e.placed && e.dayIndex === dayIndex)
                  .filter(visibleEventsFilter)
                  .map((e) => (
                    <div
                      key={e.id}
                      className={`shadow-sm text-xs text-right ${selectedEventId === e.id ? "ring-2 ring-indigo-500" : ""} ${e.confirmed ? "ring-1 ring-emerald-600" : ""}`}
                      style={{ ...boxStyleFor(e), background: catByKey[e.categoryKey]?.color ?? "#93c5fd" }}
                      onClick={(event) => { event.stopPropagation(); setSelectedEventId(e.id); }}
                      draggable
                      onDragStart={(ev) => {
                        ev.dataTransfer.setData("text/event-id", String(e.id));
                        ev.dataTransfer.effectAllowed = "copyMove";
                        setDraggedEventId(e.id);
                      }}
                      onDragEnd={() => setDraggedEventId(null)}
                      dir="rtl"
                    >
                      
                      <div className="absolute top-1 left-1 z-10">
                        <button
                          type="button"
                          className="w-4 h-4 rounded-full border flex items-center justify-center text-[10px]"
                          style={{ background: e.confirmed ? "#16a34a" : "white", color: e.confirmed ? "white" : "#16a34a", borderColor: "#16a34a" }}
                          title={e.confirmed ? "אירוע סופי (לחץ לביטול)" : "סמן כסופי"}
                          onClick={(ev) => { ev.stopPropagation(); toggleConfirmed(e.id); }}
                        >
                          {e.confirmed ? "✓" : ""}
                        </button>
                      </div>
<div className="absolute top-1 right-1 flex gap-1">
                        <button title="עריכה" className="bg-white/80 rounded px-1 text-[10px]" onClick={(ev) => { ev.stopPropagation(); setSelectedEventId(e.id); }}>✎</button>
                        <button title="מחיקה" className="bg-white/80 rounded px-1 text-[10px] text-red-600" onClick={(ev) => { ev.stopPropagation(); deleteEvent(e.id); }}>✕</button>
                      </div>
                      <div className="px-2 pt-5 truncate font-semibold text-[13px]">{e.title || "ללא כותרת"}</div>
                      {e.organization && (
                        <div className="absolute bottom-5 right-2 text-[10px] opacity-85 truncate max-w-[10rem]">ארגון: {e.organization}</div>
                      )}
                      <div className="absolute bottom-1 right-2 text-[10px] opacity-85">
                        {e.time} • {e.duration} דק' {typeof e.price === "number" && e.price > 0 ? <span className="price-inline">• ₪{e.price}</span> : ""}
                      </div>
                      {/* Resize handle */}
                      <div
                        className="absolute left-2 right-2 h-2 bottom-0 cursor-ns-resize bg-black/20 rounded"
                        onMouseDown={(ev) => startResize(e, ev.clientY)}
                        onDragStart={(ev) => ev.preventDefault()}
                        title="גרור לשינוי משך"
                      />
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* Zoom modal: single-day canvas with absolute events + resize handle */}
      {zoomDay != null && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-6 z-50 print:hidden" onClick={() => setZoomDay(null)}>
          <div className="bg-white rounded-xl shadow-xl w-[980px] max-w-full overflow-hidden" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between border-b p-3">
              <div className="font-bold">תקריב • {days[zoomDay]?.labelTop} – {days[zoomDay]?.labelBottom}</div>
              <button className="px-3 py-1" onClick={() => setZoomDay(null)}>סגור ✕</button>
            </div>
            <div className="max-h-[75vh] overflow-auto p-3">
              <div className="grid" style={{ gridTemplateColumns: "6rem 1fr" }} dir="rtl">
                {/* Hours gutter */}
                <div className="relative border-l border-gray-300">
                  <div style={{ height: timeSlots.length * SLOT_PX }} className="relative">
                    {timeSlots.map((t, i) => (
                      <div key={t} className="absolute right-0 pr-2 text-xs text-gray-700" style={{ top: i * SLOT_PX - 7 }}>
                        {t}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Day canvas */}
                <div
                  className="relative border-l border-gray-300 cursor-pointer"
                  style={{ height: timeSlots.length * SLOT_PX, backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px)`, backgroundSize: `100% ${SLOT_PX}px` }}
                  onClick={(ev) => {
                    const time = timeFromClientY(ev.currentTarget, ev.clientY);
                    placeEventExact(zoomDay, time);
                  }}
                  onDragOver={(ev) => {
                    ev.preventDefault();
                    ev.dataTransfer.dropEffect = ev.altKey ? "copy" : "move";
                  }}
                  onDrop={(ev) => {
                    ev.preventDefault();
                    const idStr = ev.dataTransfer.getData("text/event-id");
                    const id = idStr ? Number(idStr) : draggedEventId;
                    if (id == null) return;
                    const time = timeFromClientY(ev.currentTarget, ev.clientY);
                    placeEventExact(zoomDay, time, id, !!ev.altKey);
                    setDraggedEventId(null);
                  }}
                >
                  {events
                    .filter((e) => e.placed && e.dayIndex === zoomDay)
                    .filter(visibleEventsFilter)
                    .map((e) => (
                      <div
                        key={e.id}
                        className={`shadow-sm text-xs text-right ${selectedEventId === e.id ? "ring-2 ring-indigo-500" : ""} ${e.confirmed ? "ring-1 ring-emerald-600" : ""}`}
                        style={{ ...boxStyleFor(e), background: catByKey[e.categoryKey]?.color ?? "#93c5fd" }}
                        onClick={(event) => { event.stopPropagation(); setSelectedEventId(e.id); }}
                        draggable
                        onDragStart={(ev) => {
                          ev.dataTransfer.setData("text/event-id", String(e.id));
                          ev.dataTransfer.effectAllowed = "copyMove";
                          setDraggedEventId(e.id);
                        }}
                        onDragEnd={() => setDraggedEventId(null)}
                        dir="rtl"
                      >
                        
                      <div className="absolute top-1 left-1 z-10">
                        <button
                          type="button"
                          className="w-4 h-4 rounded-full border flex items-center justify-center text-[10px]"
                          style={{ background: e.confirmed ? "#16a34a" : "white", color: e.confirmed ? "white" : "#16a34a", borderColor: "#16a34a" }}
                          title={e.confirmed ? "אירוע סופי (לחץ לביטול)" : "סמן כסופי"}
                          onClick={(ev) => { ev.stopPropagation(); toggleConfirmed(e.id); }}
                        >
                          {e.confirmed ? "✓" : ""}
                        </button>
                      </div>
<div className="absolute top-1 right-1 flex gap-1">
                          <button title="עריכה" className="bg-white/80 rounded px-1 text-[10px]" onClick={(ev) => { ev.stopPropagation(); setSelectedEventId(e.id); }}>✎</button>
                          <button title="מחיקה" className="bg-white/80 rounded px-1 text-[10px] text-red-600" onClick={(ev) => { ev.stopPropagation(); deleteEvent(e.id); }}>✕</button>
                        </div>
                        <div className="px-2 pt-5 truncate font-semibold text-[13px]">{e.title || "ללא כותרת"}</div>
                        {e.organization && (
                          <div className="absolute bottom-5 right-2 text-[10px] opacity-85 truncate max-w-[12rem]">ארגון: {e.organization}</div>
                        )}
                        <div className="absolute bottom-1 right-2 text-[10px] opacity-85">
                          {e.time} • {e.duration} דק' {typeof e.price === "number" && e.price > 0 ? `• ₪${e.price}` : ""}
                        </div>
                        {/* Resize handle */}
                        <div
                          className="absolute left-2 right-2 h-2 bottom-0 cursor-ns-resize bg-black/20 rounded"
                          onMouseDown={(ev) => startResize(e, ev.clientY)}
                          onDragStart={(ev) => ev.preventDefault()}
                          title="גרור לשינוי משך"
                        />
                      </div>
                    ))}
                </div>
              </div>
              <div className="text-right mt-3 font-medium">סה"כ יום: ₪{dayTotal(zoomDay).toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}

      {/* print styles */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          html, body { width: 100%; margin: 0; padding: 0; }
          .print-page { padding: 0 !important; }
          .print-main { overflow: visible !important; }
          .print-grid { grid-template-columns: 6rem repeat(9, 1fr) !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

          .print:hidden { display: none !important; }
          .print:block { display: block !important; }
          table { page-break-inside: avoid; }
          th, td { font-size: 10px; padding: 4px; }
        }
      `}</style>
    </div>
  );
}
