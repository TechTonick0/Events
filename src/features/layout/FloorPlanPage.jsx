import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Trash2, X, ZoomIn, ZoomOut, Maximize, RotateCcw, Settings, ArrowLeft, Download, Layers, Grid } from 'lucide-react';
import useLocalStorage from '../../hooks/useLocalStorage';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import html2canvas from 'html2canvas';
import { v4 as uuidv4 } from 'uuid';

// UNIT CONVERSION
// 1 Grid Unit = 1 Foot
// Visually, 1 Foot = 10 Pixels (REDUCED from 20 to fit better)
const PX_PER_FT = 10;

// Default "Standard" Table Size in Feet
const DEFAULT_TABLE_W_FT = 8;
const DEFAULT_TABLE_H_FT = 3;

const FloorPlanPage = () => {
    const { eventId } = useParams();
    const navigate = useNavigate();
    const [events, setEvents] = useLocalStorage('cardshow_events', []);

    // Derived State
    const eventIndex = events.findIndex(e => e.id === eventId);
    const event = events[eventIndex];
    const tables = event?.tables || [];
    const vendors = event?.vendors || [];
    const zones = event?.zones || []; // New: Zones Array { id, name, color, price }

    // stored in Feet
    const roomWidthFt = event?.settings?.width || 100;
    const roomHeightFt = event?.settings?.height || 100;

    // Boundary: Array of {x, y} in feet. Default to rectangle if missing.
    const boundary = event?.settings?.boundary || [
        { x: 0, y: 0 },
        { x: roomWidthFt, y: 0 },
        { x: roomWidthFt, y: roomHeightFt },
        { x: 0, y: roomHeightFt }
    ];

    // Converted to Pixels for CSS
    const canvasWidthPx = roomWidthFt * PX_PER_FT;
    const canvasHeightPx = roomHeightFt * PX_PER_FT;

    // Viewport State
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });

    // Interaction State
    const [selectedTableId, setSelectedTableId] = useState(null);
    const [showEventSettings, setShowEventSettings] = useState(false);
    const [isDraggingTable, setIsDraggingTable] = useState(false);
    const [isPanning, setIsPanning] = useState(false);

    const [isZooming, setIsZooming] = useState(false); // For Pinch Zoom
    const [isRoomEditing, setIsRoomEditing] = useState(false); // New Edit Mode
    const [isZoneEditing, setIsZoneEditing] = useState(false); // New Zone Mode
    const [draggingVertexIndex, setDraggingVertexIndex] = useState(null); // Track which vertex is moving
    const [snapLines, setSnapLines] = useState([]); // Array of lines to draw {x1,y1,x2,y2}

    // State Mirrors for Event Handlers (Prevents Stale Closures during rapid events)
    const scaleRef = useRef(1);
    const panRef = useRef({ x: 0, y: 0 });
    const isDraggingTableRef = useRef(false); // Validates drag state synchronously
    const draggingTableIdRef = useRef(null); // Track WHICH table is dragging synchronously

    // Sync Refs with State
    useEffect(() => {
        scaleRef.current = scale;
        panRef.current = pan;
    }, [scale, pan]);

    const dragStart = useRef({ x: 0, y: 0 });
    const initialObjPos = useRef({ x: 0, y: 0 });
    const hasMoved = useRef(false);
    const lastTouchDistance = useRef(null); // For Pinch
    const containerRef = useRef(null);

    // --- AUTO-FIT LOGIC ---
    const fitToScreen = () => {
        if (!containerRef.current || !roomWidthFt || !roomHeightFt) return;

        const rect = containerRef.current.getBoundingClientRect();
        const viewportW = rect.width;
        const viewportH = rect.height;

        const margin = 40;
        const availableW = viewportW - margin;
        const availableH = viewportH - margin;

        const scaleW = availableW / canvasWidthPx;
        const scaleH = availableH / canvasHeightPx;

        const newScale = Math.min(scaleW, scaleH);

        const scaledCanvasW = canvasWidthPx * newScale;
        const scaledCanvasH = canvasHeightPx * newScale;

        const offsetX = (viewportW - scaledCanvasW) / 2;
        const offsetY = (viewportH - scaledCanvasH) / 2;

        setScale(newScale);
        setPan({ x: offsetX, y: offsetY });
    };

    useEffect(() => {
        const timer = setTimeout(fitToScreen, 100);
        return () => clearTimeout(timer);
    }, [eventId, roomWidthFt, roomHeightFt]);

    // --- Data Helpers ---
    const updateEventTables = (newTables) => {
        const updatedEvents = [...events];
        updatedEvents[eventIndex] = { ...event, tables: newTables };
        setEvents(updatedEvents);
    };

    const updateEventSettings = (updates) => {
        const updatedEvents = [...events];
        if (updates.width || updates.height) {
            updatedEvents[eventIndex].settings = {
                ...updatedEvents[eventIndex].settings,
                width: updates.width || updatedEvents[eventIndex].settings.width,
                height: updates.height || updatedEvents[eventIndex].settings.height
        if(updates.boundary) {
                updatedEvents[eventIndex].settings.boundary = updates.boundary;
            }
            if (updates.zones) updatedEvents[eventIndex].zones = updates.zones; // Save Zones

            setEvents(updatedEvents);
        };

        const addZone = () => {
            const newZone = {
                id: uuidv4(),
                name: `Zone ${zones.length + 1}`,
                color: '#3b82f6',
                price: 100
            };
            updateEventSettings({ zones: [...zones, newZone] });
        };

        const deleteZone = (id) => {
            if (window.confirm('Delete zone? Tables will revert to no zone.')) {
                updateEventSettings({ zones: zones.filter(z => z.id !== id) });
                // Cleanup table references
                const cleanedTables = tables.map(t => t.zoneId === id ? { ...t, zoneId: null } : t);
                updateEventTables(cleanedTables);
            }
        };

        const handleExport = async () => {
            if (!containerRef.current) return;
            setIsRoomEditing(false);
            setIsZoneEditing(false);
            setSelectedTableId(null);

            // Wait for render
            setTimeout(async () => {
                const canvas = await html2canvas(containerRef.current, {
                    useCORS: true,
                    scale: 2 // High Resolution
                });
                const link = document.createElement('a');
                link.download = `${event.name}-Layout.png`;
                link.href = canvas.toDataURL();
                link.click();
            }, 100);
        };

        // --- Vertex Interaction ---
        const handleVertexDown = (e, index) => {
            e.stopPropagation(); // prevent panning
            if (e.button === 2) return; // Ignore right click

            setDraggingVertexIndex(index);
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            dragStart.current = { x: clientX, y: clientY };
            initialObjPos.current = { ...boundary[index] };
        };

        const insertVertex = (indexAfter) => {
            const newBoundary = [...boundary];
            const p1 = boundary[indexAfter];
            const p2 = boundary[(indexAfter + 1) % boundary.length];

            // Midpoint
            const midX = Math.round((p1.x + p2.x) / 2);
            const midY = Math.round((p1.y + p2.y) / 2);

            // Insert at indexAfter + 1
            newBoundary.splice(indexAfter + 1, 0, { x: midX, y: midY });
            updateEventSettings({ boundary: newBoundary });
        };

        const deleteVertex = (index) => {
            if (boundary.length <= 3) return; // Minimum triangle
            const newBoundary = boundary.filter((_, i) => i !== index);
            updateEventSettings({ boundary: newBoundary });
        };

        const getSelectedTable = () => tables.find(t => t.id === selectedTableId);



        const updateTable = (id, updates) => {
            const newTables = tables.map(t => {
                if (t.id === id) {
                    let newLabel = updates.label !== undefined ? updates.label : t.label;
                    if (updates.vendorId) {
                        const vendor = vendors.find(v => v.id === updates.vendorId);
                        if (vendor) newLabel = vendor.name;
                    }
                    return { ...t, ...updates, label: newLabel };
                }
                return t;
            });
            updateEventTables(newTables);
        };

        const updateSelectedTable = (updates) => {
            if (!selectedTableId) return;
            updateTable(selectedTableId, updates);
        };

        const addTable = () => {
            if (!containerRef.current) return;

            const rect = containerRef.current.getBoundingClientRect();
            const viewportCenterCanvasPxX = ((rect.width / 2) - pan.x) / scale;
            const viewportCenterCanvasPxY = ((rect.height / 2) - pan.y) / scale;

            const centerFtX = viewportCenterCanvasPxX / PX_PER_FT;
            const centerFtY = viewportCenterCanvasPxY / PX_PER_FT;

            const newTable = {
                id: uuidv4(),
                label: `T-${tables.length + 1}`,
                x: Math.max(0, Math.min(roomWidthFt - DEFAULT_TABLE_W_FT, centerFtX - DEFAULT_TABLE_W_FT / 2)),
                y: Math.max(0, Math.min(roomHeightFt - DEFAULT_TABLE_H_FT, centerFtY - DEFAULT_TABLE_H_FT / 2)),
                width: DEFAULT_TABLE_W_FT,
                height: DEFAULT_TABLE_H_FT,
                status: 'available',
                vendorId: ''
            };

            newTable.x = Math.round(newTable.x);
            newTable.y = Math.round(newTable.y);

            updateEventTables([...tables, newTable]);
            setSelectedTableId(newTable.id);
            setShowEventSettings(false);
        };

        const deleteTable = () => {
            if (!selectedTableId) return;
            updateEventTables(tables.filter(t => t.id !== selectedTableId));
            setSelectedTableId(null);
        };

        const rotateTable = () => {
            const t = getSelectedTable();
            if (!t) return;
            const newW = t.height || DEFAULT_TABLE_H_FT;
            const newH = t.width || DEFAULT_TABLE_W_FT;
            updateSelectedTable({ width: newW, height: newH });
        };

        const deleteEvent = () => {
            if (window.confirm('Are you sure you want to delete this event? This cannot be undone.')) {
                const newEvents = events.filter(e => e.id !== eventId);
                setEvents(newEvents);
                navigate('/');
            }
        };

        // --- Interaction ---

        // -- Desktop: Wheel Zoom --
        // -- Desktop: Wheel Zoom (Native Listener attached in useEffect) --
        // -- Desktop: Wheel Zoom (Native Listener attached in useEffect) --
        const handleNativeWheel = (e) => {
            e.preventDefault();
            if (e.ctrlKey) { }

            const el = containerRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const sensitivity = 0.001;
            const delta = -e.deltaY * sensitivity;

            // Use Refs for fresh state during rapid scrolling
            const oldScale = scaleRef.current || 1;
            const currentPan = panRef.current || { x: 0, y: 0 };

            let newScale = Math.min(Math.max(0.1, oldScale + delta * oldScale * 5), 5);
            if (isNaN(newScale)) newScale = oldScale;

            // Zoom to Point Math
            const worldX = (mouseX - currentPan.x) / oldScale;
            const worldY = (mouseY - currentPan.y) / oldScale;

            let newPanX = mouseX - worldX * newScale;
            let newPanY = mouseY - worldY * newScale;

            // NaN Safety
            if (isNaN(newPanX) || isNaN(newPanY)) {
                newPanX = currentPan.x;
                newPanY = currentPan.y;
            }

            // Update Refs immediately for next event (before render)
            scaleRef.current = newScale;
            panRef.current = { x: newPanX, y: newPanY };

            // Update React State
            setScale(newScale);
            setPan({ x: newPanX, y: newPanY });
        };

        // -- Mobile/Touch Logic --

        const getTouchDistance = (touches) => {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            return Math.sqrt(dx * dx + dy * dy);
        };

        const handleTableDown = (e, table) => {
            e.stopPropagation();
            if (e.touches && e.touches.length > 1) return; // Allow pinch via container handler if mult-touch

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            setIsDraggingTable(true);
            isDraggingTableRef.current = true; // Sync update

            // Track Drag Target separate from Selection
            // Don't set selectedTableId here.
            draggingTableIdRef.current = table.id;

            setShowEventSettings(false); // Close settings panel on start (optional preference)

            hasMoved.current = false;
            dragStart.current = { x: clientX, y: clientY };
            initialObjPos.current = { x: table.x, y: table.y };
        };

        const handleCanvasDown = (e) => {
            if (e.touches && e.touches.length === 2) {
                // Pinch Start
                setIsZooming(true);
                setIsPanning(false);
                setIsDraggingTable(false);
                isDraggingTableRef.current = false;
                lastTouchDistance.current = getTouchDistance(e.touches);
                return;
            }

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            setIsPanning(true);
            hasMoved.current = false;
            dragStart.current = { x: clientX, y: clientY };
            initialObjPos.current = { x: pan.x, y: pan.y };
        };

        const handleMove = (e) => {
            // Pinch Zoom
            if (isZooming && e.touches && e.touches.length === 2) {
                e.preventDefault(); // Stop browser pinch

                const el = containerRef.current;
                if (!el) return;
                const rect = el.getBoundingClientRect();

                // Calculate center of pinch (screen coords)
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                const centerX = ((t1.clientX + t2.clientX) / 2) - rect.left;
                const centerY = ((t1.clientY + t2.clientY) / 2) - rect.top;

                const dist = getTouchDistance(e.touches);

                if (lastTouchDistance.current) {
                    const ratio = dist / lastTouchDistance.current;

                    // Use Refs
                    const oldScale = scaleRef.current || 1;
                    const currentPan = panRef.current || { x: 0, y: 0 };

                    let newScale = Math.min(Math.max(0.1, oldScale * ratio), 5);
                    if (isNaN(newScale)) newScale = oldScale;

                    // Zoom to Point Math (Pinch Center)
                    const worldX = (centerX - currentPan.x) / oldScale;
                    const worldY = (centerY - currentPan.y) / oldScale;

                    let newPanX = centerX - worldX * newScale;
                    let newPanY = centerY - worldY * newScale;

                    // NaN Safety
                    if (isNaN(newPanX) || isNaN(newPanY)) {
                        newPanX = currentPan.x;
                        newPanY = currentPan.y;
                    }

                    // Update Refs
                    scaleRef.current = newScale;
                    panRef.current = { x: newPanX, y: newPanY };

                    setScale(newScale);
                    setPan({ x: newPanX, y: newPanY });

                    lastTouchDistance.current = dist;
                }
                return;
            }

            if (!isDraggingTableRef.current && !isPanning && draggingVertexIndex === null) return;

            if (e.touches && e.touches.length > 1) return; // Don't pan if multi-touch

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const deltaPxX = clientX - dragStart.current.x;
            const deltaPxY = clientY - dragStart.current.y;

            if (Math.abs(deltaPxX) > 2 || Math.abs(deltaPxY) > 2) hasMoved.current = true;
            if (Math.abs(deltaPxX) > 2 || Math.abs(deltaPxY) > 2) hasMoved.current = true;

            if (draggingVertexIndex !== null) {
                e.preventDefault();
                const deltaFtX = (deltaPxX / scale) / PX_PER_FT;
                const deltaFtY = (deltaPxY / scale) / PX_PER_FT;

                let newX = initialObjPos.current.x + deltaFtX;
                let newY = initialObjPos.current.y + deltaFtY;

                // --- SNAP LOGIC ---
                let activeSnapLines = [];
                const SNAP_THRESHOLD = 0.5; // Feet

                // Find neighbors
                const prevIndex = (draggingVertexIndex - 1 + boundary.length) % boundary.length;
                const nextIndex = (draggingVertexIndex + 1) % boundary.length;
                const pPrev = boundary[prevIndex];
                const pNext = boundary[nextIndex];

                // Snap X
                if (Math.abs(newX - pPrev.x) < SNAP_THRESHOLD) {
                    newX = pPrev.x; // Snap to prev X
                    activeSnapLines.push({ x1: newX, y1: newY, x2: pPrev.x, y2: pPrev.y });
                } else if (Math.abs(newX - pNext.x) < SNAP_THRESHOLD) {
                    newX = pNext.x; // Snap to next X
                    activeSnapLines.push({ x1: newX, y1: newY, x2: pNext.x, y2: pNext.y });
                } else {
                    newX = Math.round(newX); // Default: Snap to 1ft Grid
                }

                // Snap Y
                if (Math.abs(newY - pPrev.y) < SNAP_THRESHOLD) {
                    newY = pPrev.y;
                    activeSnapLines.push({ x1: newX, y1: newY, x2: pPrev.x, y2: pPrev.y });
                } else if (Math.abs(newY - pNext.y) < SNAP_THRESHOLD) {
                    newY = pNext.y;
                    activeSnapLines.push({ x1: newX, y1: newY, x2: pNext.x, y2: pNext.y });
                } else {
                    newY = Math.round(newY); // Default: Snap to 1ft Grid
                }

                setSnapLines(activeSnapLines);

                const newBoundary = [...boundary];
                newBoundary[draggingVertexIndex] = { x: newX, y: newY };
                updateEventSettings({ boundary: newBoundary });
                return; // Done
            } else if (isDraggingTableRef.current && draggingTableIdRef.current) {
                e.preventDefault(); // Stop scroll when dragging table
                const t = tables.find(t => t.id === draggingTableIdRef.current);
                const w = t.width || DEFAULT_TABLE_W_FT;
                const h = t.height || DEFAULT_TABLE_H_FT;

                const deltaFtX = (deltaPxX / scale) / PX_PER_FT;
                const deltaFtY = (deltaPxY / scale) / PX_PER_FT;

                let newX = initialObjPos.current.x + deltaFtX;
                let newY = initialObjPos.current.y + deltaFtY;

                newX = Math.round(newX);
                newY = Math.round(newY);

                // Bounding box check (simple rect check for now, upgrade to poly check later if needed)
                newX = Math.max(0, Math.min(newX, roomWidthFt - w));
                newY = Math.max(0, Math.min(newY, roomHeightFt - h));

                updateTable(t.id, { x: newX, y: newY });
            } else if (isPanning) {
                setPan({
                    x: initialObjPos.current.x + deltaPxX,
                    y: initialObjPos.current.y + deltaPxY
                });
            }
        };

        const handleUp = () => {
            if (isDraggingTable) {
                // If we were dragging a table, but we didn't actually move it > 2px, treat as a CLICK.
                if (!hasMoved.current && draggingTableIdRef.current) {
                    setSelectedTableId(draggingTableIdRef.current); // Select it now
                    setShowEventSettings(true); // Open menu on clean click
                }
                // If moved, we do nothing. The drag is done. 
                // selectedTableId remains whatever it was (or null).
            }

            setIsDraggingTable(false);
            isDraggingTableRef.current = false;
            draggingTableIdRef.current = null;
            setIsPanning(false);
            setIsZooming(false);
            setDraggingVertexIndex(null); // Stop vertex drag
            setSnapLines([]); // Clear guides
            lastTouchDistance.current = null;
            if (isPanning && !hasMoved.current) {
                setSelectedTableId(null);
                setShowEventSettings(false);
            }
        };

        const getStatusColor = (status, isSelected) => {
            if (isSelected) return 'var(--primary)';
            switch (status) {
                case 'paid': return 'var(--success)';
                case 'booked': return 'var(--warning)';
                default: return 'var(--bg-card)';
            }
        };

        // --- Event Listeners with Fresh Refs ---
        const handleNativeWheelRef = useRef(handleNativeWheel);

        useEffect(() => {
            handleNativeWheelRef.current = handleNativeWheel;
        });

        useEffect(() => {
            const el = containerRef.current;
            if (!el) return;

            const onWheel = (e) => handleNativeWheelRef.current(e);

            // Non-passive listener to allow preventDefault()
            el.addEventListener('wheel', onWheel, { passive: false });

            return () => {
                el.removeEventListener('wheel', onWheel);
            };
        }, []);

        // --- NON-PASSIVE TOUCH LISTENERS (Fixes "Unable to preventDefault" error) ---
        const handleCanvasDownRef = useRef(handleCanvasDown);
        const handleMoveRef = useRef(handleMove);
        const handleUpRef = useRef(handleUp);

        // Keep refs current
        useEffect(() => {
            handleCanvasDownRef.current = handleCanvasDown;
            handleMoveRef.current = handleMove;
            handleUpRef.current = handleUp;
        });

        useEffect(() => {
            const el = containerRef.current;
            if (!el) return;

            const onTouchStart = (e) => handleCanvasDownRef.current(e);
            const onTouchMove = (e) => handleMoveRef.current(e);
            const onTouchEnd = (e) => handleUpRef.current(e);

            el.addEventListener('touchstart', onTouchStart, { passive: false });
            el.addEventListener('touchmove', onTouchMove, { passive: false });
            el.addEventListener('touchend', onTouchEnd, { passive: false });

            return () => {
                el.removeEventListener('touchstart', onTouchStart);
                el.removeEventListener('touchmove', onTouchMove);
                el.removeEventListener('touchend', onTouchEnd);
            };
        }, []);

        if (!event) return <div className="page-container">Loading...</div>;

        const selectedTable = getSelectedTable();

        return (
            <div
                className="page-container"
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    paddingTop: '50px', // Space for Fixed Header
                    paddingBottom: '80px', // Space for Fixed Nav
                    paddingLeft: 0,
                    paddingRight: 0,
                    zIndex: 1, // Below header(90)/nav(100)
                    maxWidth: 'none', // Override index.css .page-container limit
                    margin: 0 // Override index.css margin
                }}
            >
                {/* Toolbar */}
                <div className="glass-panel" style={{
                    padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderBottom: '1px solid var(--glass-border)', zIndex: 20, flexShrink: 0
                }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button variant="ghost" size="sm" onClick={() => navigate('/')} title="Back to Events"><ArrowLeft size={18} /></Button>
                        <div style={{ width: '1px', height: '20px', background: 'var(--glass-border)', margin: '0 8px' }}></div>
                        <Button variant="ghost" size="sm" onClick={() => setScale(s => Math.min(s * 1.2, 5))}><ZoomIn size={18} /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setScale(s => Math.max(s / 1.2, 0.1))}><ZoomOut size={18} /></Button>
                        <Button variant="ghost" size="sm" onClick={fitToScreen} title="Fit to Screen"><Maximize size={18} /></Button>
                        <Button variant="primary" size="sm" onClick={addTable}><Plus size={18} /><span className="hide-mobile" style={{ marginLeft: '6px' }}>Add Table</span></Button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className="hide-mobile" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {roomWidthFt}ft x {roomHeightFt}ft
                        </div>

                        <Button
                            variant={isRoomEditing ? 'primary' : 'outline'}
                            size="sm"
                            onClick={() => { setIsRoomEditing(!isRoomEditing); setShowEventSettings(false); setSelectedTableId(null); }}
                            title="Edit Room Shape"
                        >
                            <Maximize size={18} /> <span className="hide-mobile" style={{ marginLeft: '6px' }}>{isRoomEditing ? 'Done' : 'Edit Room'}</span>
                        </Button>
                        <Button
                            variant={showEventSettings ? 'primary' : 'ghost'}
                            size="sm"
                            onClick={() => { setShowEventSettings(!showEventSettings); setSelectedTableId(null); }}
                        >
                            <Settings size={18} /> <span className="hide-mobile" style={{ marginLeft: '6px' }}>Settings</span>
                        </Button>
                    </div>
                </div>

                {/* Canvas Container (Viewport) */}
                <div
                    ref={containerRef}
                    style={{
                        flex: 1, position: 'relative', overflow: 'hidden', cursor: isPanning ? 'grabbing' : 'grab',
                        touchAction: 'none', backgroundColor: '#1a1a1e',
                        // Infinite Grid Effect:
                        backgroundImage: `linear-gradient(#2a2a30 1px, transparent 1px), linear-gradient(90deg, #2a2a30 1px, transparent 1px)`,
                        backgroundSize: `${PX_PER_FT * scale}px ${PX_PER_FT * scale}px`,
                        backgroundPosition: `${pan.x}px ${pan.y}px`,
                    }}
                    onMouseDown={handleCanvasDown}
                    onMouseMove={handleMove}
                    onMouseUp={handleUp}
                    onMouseLeave={handleUp}
                >
                    {/* SVG Layer for Room Boundary */}
                    {/* SVG Layer for Room Boundary */}
                    <svg
                        style={{
                            position: 'absolute', left: 0, top: 0,
                            width: '100%', height: '100%',
                            pointerEvents: 'none', // Let clicks pass through empty areas
                            zIndex: 0 // SVG Layer behind legacy div
                        }}
                    >
                        <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
                            {/* Room Floor (Polygon) */}
                            <polygon
                                points={boundary.map(p => `${p.x * PX_PER_FT},${p.y * PX_PER_FT}`).join(' ')}
                                fill="rgba(255, 255, 255, 0.03)"
                                stroke={isRoomEditing ? "var(--primary)" : "var(--primary-glow)"}
                                strokeWidth={isRoomEditing ? 4 / scale : 2 / scale}
                                strokeLinejoin="round"
                                style={{ pointerEvents: isRoomEditing ? 'visiblePainted' : 'none' }}
                            />

                            {/* Snap Guides */}
                            {isRoomEditing && snapLines.map((line, i) => (
                                <line
                                    key={i}
                                    x1={line.x1 * PX_PER_FT} y1={line.y1 * PX_PER_FT}
                                    x2={line.x2 * PX_PER_FT} y2={line.y2 * PX_PER_FT}
                                    stroke="var(--primary)"
                                    strokeWidth={1 / scale}
                                    strokeDasharray={`${4 / scale}, ${4 / scale}`}
                                />
                            ))}

                            {/* Wall Measurements */}
                            {isRoomEditing && boundary.map((p, i) => {
                                const nextP = boundary[(i + 1) % boundary.length];
                                const midX = (p.x + nextP.x) / 2;
                                const midY = (p.y + nextP.y) / 2;
                                const len = Math.sqrt(Math.pow(nextP.x - p.x, 2) + Math.pow(nextP.y - p.y, 2));

                                return (
                                    <text
                                        key={i}
                                        x={midX * PX_PER_FT}
                                        y={midY * PX_PER_FT}
                                        fill="white"
                                        fontSize={12 / scale}
                                        textAnchor="middle"
                                        dy={-5 / scale}
                                        style={{ pointerEvents: 'none', userSelect: 'none', textShadow: '0 0 2px black' }}
                                    >
                                        {Math.round(len * 10) / 10}ft
                                    </text>
                                );
                            })}

                            {/* Vertex Handles (Only in Edit Mode) */}
                            {isRoomEditing && boundary.map((p, i) => {
                                const nextP = boundary[(i + 1) % boundary.length];
                                const midX = (p.x + nextP.x) / 2;
                                const midY = (p.y + nextP.y) / 2;

                                return (
                                    <React.Fragment key={i}>
                                        {/* Real Vertex */}
                                        <circle
                                            cx={p.x * PX_PER_FT}
                                            cy={p.y * PX_PER_FT}
                                            r={10 / scale} // Reduced size (was 20 - too huge)
                                            fill="var(--primary)"
                                            stroke="white"
                                            strokeWidth={2 / scale}
                                            onMouseDown={(e) => handleVertexDown(e, i)}
                                            onTouchStart={(e) => handleVertexDown(e, i)}
                                            onDoubleClick={(e) => { e.stopPropagation(); deleteVertex(i); }}
                                            style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                                        />

                                        {/* Ghost Handle (Add Vertex) */}
                                        <circle
                                            cx={midX * PX_PER_FT}
                                            cy={midY * PX_PER_FT}
                                            r={6 / scale}
                                            fill="rgba(255, 255, 255, 0.5)"
                                            stroke="var(--primary)"
                                            strokeWidth={1 / scale}
                                            onClick={(e) => { e.stopPropagation(); insertVertex(i); }}
                                            onTouchEnd={(e) => { e.stopPropagation(); insertVertex(i); }}
                                            style={{ cursor: 'copy', pointerEvents: 'auto' }}
                                        >
                                            <title>Add Corner</title>
                                        </circle>
                                    </React.Fragment>
                                );
                            })}
                        </g>
                    </svg>

                    {/* Legacy Object Layer (Tables) */}
                    <div
                        style={{
                            position: 'absolute', left: pan.x, top: pan.y,
                            transform: `scale(${scale})`, transformOrigin: '0 0',
                            // width/height don't matter as much now that boundary handles visual, 
                            // but used for "Relative" calculations if needed?
                            // We can remove the visual box styles now
                            width: 0, height: 0
                        }}
                    >
                        {tables.map(table => {
                            if (isRoomEditing) return null; // Hide tables while editing room
                            const isSelected = selectedTableId === table.id;
                            const wFt = table.width || DEFAULT_TABLE_W_FT;
                            const hFt = table.height || DEFAULT_TABLE_H_FT;
                            const isVertical = hFt > wFt;

                            return (
                                <div
                                    key={table.id}
                                    onMouseDown={(e) => handleTableDown(e, table)}
                                    onTouchStart={(e) => handleTableDown(e, table)}
                                    style={{
                                        position: 'absolute',
                                        left: table.x * PX_PER_FT,
                                        top: table.y * PX_PER_FT,
                                        width: wFt * PX_PER_FT,
                                        height: hFt * PX_PER_FT,
                                        backgroundColor: table.zoneId
                                            ? (zones.find(z => z.id === table.zoneId)?.color || getStatusColor(table.status, isSelected))
                                            : getStatusColor(table.status, isSelected),
                                        border: `1px solid ${isSelected ? 'var(--text-primary)' : 'rgba(255,255,255,0.2)'}`,
                                        borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'white', fontSize: Math.max(10, 10 / scale) + 'px', fontWeight: 600, cursor: 'grab',
                                        boxShadow: isSelected ? '0 0 0 2px rgba(255,255,255,0.4)' : '0 2px 4px rgba(0,0,0,0.2)',
                                        zIndex: isSelected ? 100 : 1, userSelect: 'none'
                                    }}
                                >
                                    <span style={{
                                        pointerEvents: 'none',
                                        position: 'absolute',
                                        top: '50%',
                                        left: '50%',
                                        transform: isVertical
                                            ? 'translate(-50%, -50%) rotate(-90deg)'
                                            : 'translate(-50%, -50%)',
                                        width: isVertical ? `${hFt * PX_PER_FT - 4}px` : `${wFt * PX_PER_FT - 4}px`,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        textAlign: 'center',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        {table.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Right Side Panel: Table Edit */}
                {selectedTable && !isDraggingTable && !isPanning && !isZooming && (
                    <div
                        className="glass-panel mobile-edit-panel"
                        onTouchStart={(e) => e.stopPropagation()}
                        style={{
                            position: 'absolute',
                            top: '60px', bottom: '80px', right: '0',
                            width: '320px', padding: '20px', borderRadius: 'var(--radius-md) 0 0 var(--radius-md)',
                            animation: 'slideLeft 0.3s', zIndex: 50, borderRight: 'none',
                            display: 'flex', flexDirection: 'column'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '16px' }}>Edit Table</h3>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <Button variant="ghost" size="sm" onClick={rotateTable} title="Rotate (Swap Dimensions)"><RotateCcw size={18} /></Button>
                                <Button variant="ghost" size="sm" onClick={() => setSelectedTableId(null)}><X size={18} /></Button>
                            </div>
                        </div>

                        <div className="mobile-scroll-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <Input
                                label="Label"
                                value={selectedTable.label}
                                onChange={(e) => updateSelectedTable({ label: e.target.value })}
                            />

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <Input
                                    label="Width (ft)" type="number"
                                    value={selectedTable.width || DEFAULT_TABLE_W_FT}
                                    onChange={(e) => updateSelectedTable({ width: parseInt(e.target.value) || DEFAULT_TABLE_W_FT })}
                                />
                                <Input
                                    label="Height (ft)" type="number"
                                    value={selectedTable.height || DEFAULT_TABLE_H_FT}
                                    onChange={(e) => updateSelectedTable({ height: parseInt(e.target.value) || DEFAULT_TABLE_H_FT })}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginBottom: '6px' }}>Status</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {['available', 'booked', 'paid'].map(status => (
                                        <button
                                            key={status}
                                            onClick={() => updateSelectedTable({ status })}
                                            style={{
                                                padding: '6px 10px', fontSize: '12px', borderRadius: 'var(--radius-sm)',
                                                border: selectedTable.status === status ? `1px solid var(--primary)` : '1px solid var(--glass-border)',
                                                background: selectedTable.status === status ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                                                color: selectedTable.status === status ? 'var(--primary)' : 'var(--text-muted)',
                                                textTransform: 'capitalize', flex: 1
                                            }}
                                        >
                                            {status}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ marginBottom: 'auto' }}>
                                <label style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginBottom: '6px' }}>Vendor</label>
                                <select
                                    width: '100%', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--glass-border)',
                                padding: '10px', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none'
                                }}
                            >
                                <option value="">(None)</option>
                                {vendors.map(v => (
                                    <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Zone Assignment */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginBottom: '6px' }}>Zone</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                <button
                                    onClick={() => updateSelectedTable({ zoneId: null })}
                                    style={{
                                        padding: '6px 10px', fontSize: '12px', borderRadius: '4px',
                                        border: !selectedTable.zoneId ? '1px solid white' : '1px solid var(--glass-border)',
                                        background: 'transparent', color: 'white'
                                    }}
                                >
                                    None
                                </button>
                                {zones.map(z => (
                                    <button
                                        key={z.id}
                                        onClick={() => updateSelectedTable({ zoneId: z.id })}
                                        style={{
                                            padding: '6px 10px', fontSize: '12px', borderRadius: '4px',
                                            border: selectedTable.zoneId === z.id ? '1px solid white' : '1px solid transparent',
                                            background: z.color, color: 'white'
                                        }}
                                    >
                                        {z.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <Button variant="danger" onClick={deleteTable} icon={Trash2}>Delete Table</Button>
                    </div>
                </div>
        )
    }

    {/* Zone Manager Panel */ }
    {
        isZoneEditing && (
            <div
                className="glass-panel mobile-edit-panel"
                onTouchStart={(e) => e.stopPropagation()}
                style={{
                    position: 'absolute',
                    top: '60px', bottom: '80px', right: '0',
                    width: '320px', padding: '20px', borderRadius: 'var(--radius-md) 0 0 var(--radius-md)',
                    animation: 'slideLeft 0.3s', zIndex: 50, borderRight: 'none',
                    display: 'flex', flexDirection: 'column'
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '16px' }}>Manage Zones</h3>
                    <Button variant="ghost" size="sm" onClick={() => setIsZoneEditing(false)}><X size={18} /></Button>
                </div>

                <div className="mobile-scroll-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <Button variant="primary" onClick={addZone} icon={Plus}>Add New Zone</Button>

                    {zones.map((zone, i) => (
                        <div key={zone.id} style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <Input
                                    value={zone.name}
                                    onChange={(e) => {
                                        const newZones = [...zones];
                                        newZones[i].name = e.target.value;
                                        updateEventSettings({ zones: newZones });
                                    }}
                                />
                                <input
                                    type="color"
                                    value={zone.color}
                                    onChange={(e) => {
                                        const newZones = [...zones];
                                        newZones[i].color = e.target.value;
                                        updateEventSettings({ zones: newZones });
                                    }}
                                    style={{ width: '40px', height: '40px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <Input
                                    type="number" label="Price"
                                    value={zone.price}
                                    onChange={(e) => {
                                        const newZones = [...zones];
                                        newZones[i].price = e.target.value;
                                        updateEventSettings({ zones: newZones });
                                    }}
                                />
                                <Button variant="danger" size="sm" onClick={() => deleteZone(zone.id)}><Trash2 size={16} /></Button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    {/* Right Side Panel: Event Settings */ }
    {
        showEventSettings && !selectedTable && !isDraggingTable && (
            <div
                className="glass-panel mobile-edit-panel"
                onTouchStart={(e) => e.stopPropagation()}
                style={{
                    position: 'absolute',
                    top: '60px', bottom: '80px', right: '0',
                    width: '320px', padding: '20px', borderRadius: 'var(--radius-md) 0 0 var(--radius-md)',
                    animation: 'slideLeft 0.3s', zIndex: 50, borderRight: 'none',
                    display: 'flex', flexDirection: 'column'
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '16px' }}>Event Settings</h3>
                    <Button variant="ghost" size="sm" onClick={() => setShowEventSettings(false)}><X size={18} /></Button>
                </div>

                <div className="mobile-scroll-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <Input
                        label="Event Name"
                        value={event.name}
                        onChange={(e) => updateEventSettings({ name: e.target.value })}
                    />

                    <Input
                        label="Date"
                        type="date"
                        value={event.date}
                        onChange={(e) => updateEventSettings({ date: e.target.value })}
                    />

                    <div style={{ display: 'flex', gap: '12px' }}>
                        <Input
                            label="Venue Width (ft)" type="number"
                            value={event.settings.width}
                            onChange={(e) => updateEventSettings({ width: parseInt(e.target.value) || 1 })}
                        />
                        <Input
                            label="Venue Height (ft)" type="number"
                            value={event.settings.height}
                            onChange={(e) => updateEventSettings({ height: parseInt(e.target.value) || 1 })}
                        />
                    </div>

                    <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid var(--glass-border)' }}>
                        <Button variant="danger" onClick={deleteEvent} icon={Trash2}>Delete Event</Button>
                    </div>
                </div>
            </div>
        )
    }

    {/* Bottom Toolbar */ }
            <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0,
                height: '60px', background: 'var(--glass-bg)', borderTop: '1px solid var(--glass-border)',
                backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'space-around',
                zIndex: 100, paddingBottom: 'env(safe-area-inset-bottom)'
            }}>
                <Button variant={isRoomEditing ? 'primary' : 'ghost'} onClick={() => { setIsRoomEditing(!isRoomEditing); setIsZoneEditing(false); }} icon={Grid} title="Edit Room Shape" />
                <Button variant={isZoneEditing ? 'primary' : 'ghost'} onClick={() => { setIsZoneEditing(!isZoneEditing); setIsRoomEditing(false); }} icon={Layers} title="Edit Zones" />
                <Button variant="ghost" onClick={addTable} icon={Plus} title="Add Table" />
                <Button variant="ghost" onClick={fitToScreen} icon={Maximize} title="Fit to Screen" />
                <Button variant="ghost" onClick={handleExport} icon={Download} title="Export Layout" />
            </div>

    <style>{`
                @keyframes slideLeft {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                @media (max-width: 600px) {
                    .mobile-edit-panel {
                         position: fixed !important;
                         width: 100% !important;
                         top: auto !important;
                         bottom: calc(90px + env(safe-area-inset-bottom)) !important;
                         left: 0 !important;
                         right: 0 !important;
                         height: 50vh !important;
                         border-radius: var(--radius-lg) var(--radius-lg) 0 0 !important;
                         animation: slideUp 0.3s !important;
                         touch-action: none !important; /* Shell handles touch, passes to child */
                         pointer-events: auto !important;
                         animation-name: slideUp !important;
                         overflow: hidden !important; /* Hide shell overflow, scroll inner */
                         z-index: 200 !important; /* Above fixed nav (100) */
                         box-shadow: 0 -4px 20px rgba(0,0,0,0.4) !important;
                    }
                    .mobile-scroll-content {
                        flex: 1;
                        overflow-y: auto;
                        min-height: 0; /* Helper for flex scrolling */
                        padding-right: 4px;
                        -webkit-overflow-scrolling: touch;
                        touch-action: pan-y;
                    }
                    .hide-mobile {
                        display: none !important;
                    }
                    /* Ensure buttons are large enough to tap but compact layout */
                    button {
                        padding: 8px !important; 
                    }
                }
                @keyframes slideUp {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
            `}</style>
        </div >
    );
};

export default FloorPlanPage;
