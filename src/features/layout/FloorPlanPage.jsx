import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Trash2, X, ZoomIn, ZoomOut, Maximize, RotateCcw, Settings, ArrowLeft, Download, Layers, Grid } from 'lucide-react';
import useLocalStorage from '../../hooks/useLocalStorage';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
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

    if (!event) {
        return (
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                <div style={{ textAlign: 'center' }}>
                    <h2>Event Not Found</h2>
                    <Button variant="ghost" onClick={() => navigate('/admin/events')} icon={ArrowLeft}>Back to Events</Button>
                </div>
            </div>
        );
    }

    const tables = event?.tables || [];
    const vendors = event?.vendors || [];
    const zones = event?.zones || [];

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
    const [showEventSettings, setShowEventSettings] = useState(false);
    const [isDraggingTable, setIsDraggingTable] = useState(false);
    const [isPanning, setIsPanning] = useState(false);

    // Selection State
    const [selectedTableIds, setSelectedTableIds] = useState([]);
    const [selectionBox, setSelectionBox] = useState(null); // { startX, startY, currentX, currentY }
    const [isBoxSelecting, setIsBoxSelecting] = useState(false);

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
    const selectedTableIdsRef = useRef([]); // Sync Ref

    // Sync Refs with State
    useEffect(() => {
        scaleRef.current = scale;
        panRef.current = pan;
        selectedTableIdsRef.current = selectedTableIds;
    }, [scale, pan, selectedTableIds]);

    const dragStart = useRef({ x: 0, y: 0 });
    const initialObjPos = useRef({ x: 0, y: 0 }); // Primary object
    const initialSelectedPositions = useRef({}); // Map of { id: {x,y} } for all selected
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

    const autoLabelTables = (tableList) => {
        if (!tableList || tableList.length === 0) return tableList;

        // --- Math Helpers for Polygon Path ---
        const distSq = (p1, p2) => (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
        const dist = (p1, p2) => Math.sqrt(distSq(p1, p2));

        const projectToSegment = (p, a, b) => {
            const l2 = distSq(a, b);
            if (l2 === 0) return { point: a, t: 0, d: dist(p, a) };
            let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
            t = Math.max(0, Math.min(1, t));
            const proj = {
                x: a.x + t * (b.x - a.x),
                y: a.y + t * (b.y - a.y)
            };
            return { point: proj, t, d: dist(p, proj) };
        };

        const getPathMetrics = (t) => {
            let minD = Infinity;
            let pathLen = 0;
            let bestPathLen = 0;

            // Iterate boundary segments
            for (let i = 0; i < boundary.length; i++) {
                const a = boundary[i];
                const b = boundary[(i + 1) % boundary.length];
                const segLen = dist(a, b);

                const proj = projectToSegment(t, a, b);
                if (proj.d < minD) {
                    minD = proj.d;
                    bestPathLen = pathLen + (segLen * proj.t);
                }
                pathLen += segLen;
            }
            return { dist: minD, pathPos: bestPathLen };
        };

        // 1. Classify Tables
        const WALL_THRESHOLD = 8; // ft
        const wallTables = [];
        const innerTables = [];

        tableList.forEach(t => {
            const metrics = getPathMetrics(t);
            // Store metrics for sorting
            t._tempMetrics = metrics;

            if (metrics.dist <= WALL_THRESHOLD) {
                wallTables.push(t);
            } else {
                innerTables.push(t);
            }
        });

        // 2. Sort Wall Tables by Path Position (Walking the perimeter)
        wallTables.sort((a, b) => a._tempMetrics.pathPos - b._tempMetrics.pathPos);

        // 3. Sort Inner Tables by Reading Order (Top-Down, Left-Right)
        // Add row tolerance
        innerTables.sort((a, b) => {
            const ROW_H = 4; // ft tolerance
            const rowA = Math.floor(a.y / ROW_H);
            const rowB = Math.floor(b.y / ROW_H);
            if (rowA !== rowB) return rowA - rowB;
            return a.x - b.x;
        });

        // 4. Merge & Relabel
        const finalOrder = [...wallTables, ...innerTables];

        return finalOrder.map((t, i) => {
            const { _tempMetrics, ...cleanTable } = t; // Cleanup temp prop
            return {
                ...cleanTable,
                label: `T-${i + 1}`
            };
        });
    };

    const updateEventTables = (newTables) => {
        const updatedEvents = [...events];
        updatedEvents[eventIndex] = { ...event, tables: newTables };
        setEvents(updatedEvents);
    };

    const updateEventSettings = (updates) => {
        const updatedEvents = [...events];

        if (updates.name) updatedEvents[eventIndex].name = updates.name;
        if (updates.date) updatedEvents[eventIndex].date = updates.date;

        if (updates.width || updates.height) {
            updatedEvents[eventIndex].settings = {
                ...updatedEvents[eventIndex].settings,
                width: updates.width || updatedEvents[eventIndex].settings.width,
                height: updates.height || updatedEvents[eventIndex].settings.height
            };
        }
        if (updates.boundary) {
            updatedEvents[eventIndex].settings.boundary = updates.boundary;
        }
        if (updates.zones) {
            updatedEvents[eventIndex].zones = updates.zones;
        }

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

    // --- Advanced Export Logic ---
    const [exportMenuOpen, setExportMenuOpen] = useState(false);

    const handleAdvancedExport = async (type, vendorId = null) => {
        if (!containerRef.current) return;

        // Close menus
        setExportMenuOpen(false);
        setIsRoomEditing(false);
        setIsZoneEditing(false);
        setSelectedTableIds([]);

        // Wait for UI to clear
        await new Promise(r => setTimeout(r, 100));

        try {
            // 1. Prepare View (Hide/Show items based on type)
            const originalTables = JSON.parse(JSON.stringify(tables));

            // For Tenant View: Mask other vendors
            if (type === 'tenant' && vendorId) {
                const maskedTables = tables.map(t => {
                    if (t.vendorId === vendorId) return t; // Keep own
                    return { ...t, vendorId: null }; // Hide others (Renderer will just show label)
                });
                updateEventTables(maskedTables);
                await new Promise(r => setTimeout(r, 100)); // Render Wait
                await new Promise(r => setTimeout(r, 100)); // Render Wait
            }

            // Auto-Fit View for Capture
            const originalScale = scaleRef.current;
            const originalPan = panRef.current;
            fitToScreen();
            await new Promise(r => setTimeout(r, 200)); // Wait for zoom/pan

            // Print Mode (Light Background)
            if (containerRef.current) {
                containerRef.current.classList.add('print-map');
                // Only show pop-out labels for individual vendor view
                if (type === 'tenant') {
                    containerRef.current.classList.add('with-labels');
                }
            }
            // Wait for styles to apply
            await new Promise(r => setTimeout(r, 100));

            const canvas = await html2canvas(containerRef.current, {
                useCORS: true,
                scale: 2, // High Res
                backgroundColor: '#ffffff', // White for Print
                logging: false
            });

            // Revert styles & view
            if (containerRef.current) {
                containerRef.current.classList.remove('print-map');
                containerRef.current.classList.remove('with-labels');
            }
            setScale(originalScale);
            setPan(originalPan);

            // Revert State if Tenant View
            if (type === 'tenant') {
                updateEventTables(originalTables);
            }

            // 2. Generate PDF (Auto-Rotate to fit Map)
            const isLandscape = canvas.width >= canvas.height;
            const pdf = new jsPDF({
                orientation: isLandscape ? 'landscape' : 'portrait',
                unit: 'pt',
                format: 'letter'
            });

            const docWidth = pdf.internal.pageSize.getWidth();
            const docHeight = pdf.internal.pageSize.getHeight();
            const margin = 30;

            // Header Space
            const headerHeight = 60;
            const contentWidth = docWidth - (margin * 2);
            const contentHeight = docHeight - (margin * 2) - headerHeight;

            // Image Scaling
            const imgRatio = canvas.width / canvas.height;

            let finalW = contentWidth;
            let finalH = contentWidth / imgRatio;

            if (finalH > contentHeight) {
                finalH = contentHeight;
                finalW = contentHeight * imgRatio;
            }

            // Center Image
            const x = (docWidth - finalW) / 2;
            const y = headerHeight + margin;

            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, finalW, finalH);

            // Add Banner Info (Scaled)
            pdf.setFontSize(24);
            pdf.setTextColor(0, 0, 0);
            pdf.text(event.name, margin, margin + 20);

            pdf.setFontSize(14);
            pdf.setTextColor(80, 80, 80);
            if (type === 'tenant') {
                const vName = vendors.find(v => v.id === vendorId)?.name;
                const vTables = tables.filter(t => t.vendorId === vendorId).map(t => t.label).join(', ');
                pdf.text(`Vendor Map: ${vName} (${vTables})`, margin, margin + 45);
            } else {
                pdf.text('Overall Floor Plan', margin, margin + 45);

                // --- GENERATE VENDOR DIRECTORY PAGE ---
                pdf.addPage();
                pdf.setFontSize(18);
                pdf.text("Vendor Directory", margin, margin + 20);

                pdf.setFontSize(12);
                let currentY = margin + 50;
                const lineHeight = 18;

                // Sort Vendors A-Z
                const sortedVendors = [...vendors].sort((a, b) => a.name.localeCompare(b.name));

                sortedVendors.forEach((v) => {
                    const vTables = tables.filter(t => t.vendorId === v.id).map(t => t.label).join(', ');
                    if (!vTables) return; // Skip unassigned vendors

                    if (currentY > docHeight - margin) {
                        pdf.addPage();
                        currentY = margin + 50;
                    }

                    // Draw dots leader
                    const nameText = v.name + " ";
                    const tableText = " " + vTables;
                    const nameWidth = pdf.getTextWidth(nameText);
                    const tableWidth = pdf.getTextWidth(tableText);
                    const dotsWidth = docWidth - (margin * 2) - nameWidth - tableWidth;

                    let dots = "";
                    if (dotsWidth > 0) {
                        const dotWidth = pdf.getTextWidth(".");
                        const numDots = Math.floor(dotsWidth / dotWidth);
                        dots = ".".repeat(numDots);
                    }

                    pdf.text(nameText + dots + tableText, margin, currentY);
                    currentY += lineHeight;
                });
            }

            pdf.save(`${event.name}_FloorPlan_${type}.pdf`);

        } catch (err) {
            console.error(err);
            alert("Export failed: " + err.message);
        }
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

    const getSelectedTables = () => tables.filter(t => selectedTableIds.includes(t.id));

    const updateTable = (id, updates) => {
        const newTables = tables.map(t => {
            if (t.id === id) {
                return { ...t, ...updates };
            }
            return t;
        });
        updateEventTables(newTables);
    };

    const updateSelectedTables = (updates) => {
        if (selectedTableIds.length === 0) return;
        const newTables = tables.map(t => {
            if (selectedTableIds.includes(t.id)) {
                return { ...t, ...updates };
            }
            return t;
        });
        updateEventTables(newTables);
    };

    const addTable = () => {
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const viewportCenterCanvasPxX = ((rect.width / 2) - pan.x) / scale;
        const viewportCenterCanvasPxY = ((rect.height / 2) - pan.y) / scale;

        const centerFtX = viewportCenterCanvasPxX / PX_PER_FT;
        const centerFtY = viewportCenterCanvasPxY / PX_PER_FT;

        // Auto-Name: Find max "T-X" and increment
        const usedNumbers = tables
            .map(t => {
                const match = t.label.match(/^T-(\d+)$/);
                return match ? parseInt(match[1]) : 0;
            });
        const nextNum = usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1;

        const newTable = {
            id: uuidv4(),
            label: `T-${nextNum}`,
            x: Math.max(0, Math.min(roomWidthFt - DEFAULT_TABLE_W_FT, centerFtX - DEFAULT_TABLE_W_FT / 2)),
            y: Math.max(0, Math.min(roomHeightFt - DEFAULT_TABLE_H_FT, centerFtY - DEFAULT_TABLE_H_FT / 2)),
            status: 'available',
            vendorId: ''
        };

        newTable.x = Math.round(newTable.x);
        newTable.y = Math.round(newTable.y);

        newTable.x = Math.round(newTable.x);
        newTable.y = Math.round(newTable.y);

        // Add then Auto-Label
        updateEventTables(autoLabelTables([...tables, newTable]));
        setSelectedTableIds([newTable.id]);
        setShowEventSettings(false);
    };

    const deleteTable = () => {
        if (selectedTableIds.length === 0) return;
        if (!window.confirm(`Delete ${selectedTableIds.length} tables?`)) return;

        const remaining = tables.filter(t => !selectedTableIds.includes(t.id));
        updateEventTables(autoLabelTables(remaining));
        setSelectedTableIds([]);
    };

    const rotateTable = () => {
        // Rotate all selected tables
        if (selectedTableIds.length === 0) return;

        const newTables = tables.map(t => {
            if (selectedTableIds.includes(t.id)) {
                const newW = t.height || DEFAULT_TABLE_H_FT;
                const newH = t.width || DEFAULT_TABLE_W_FT;
                return { ...t, width: newW, height: newH };
            }
            return t;
        });
        updateEventTables(newTables);
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

        // Multi-Select Logic
        let currentSelection = selectedTableIds;
        if (!selectedTableIds.includes(table.id)) {
            setSelectedTableIds([table.id]);
            currentSelection = [table.id];
        } else {
            currentSelection = selectedTableIds; // Keep existing group
        }

        // Snapshot positions for ALL selected tables
        const posMap = {};
        tables.forEach(t => {
            if (currentSelection.includes(t.id)) {
                posMap[t.id] = { x: t.x, y: t.y };
            }
        });
        initialSelectedPositions.current = posMap;

        // Track the "Primary" drag target for offset ref
        draggingTableIdRef.current = table.id;

        setShowEventSettings(false); // Close settings panel on start (optional preference)

        hasMoved.current = false;
        dragStart.current = { x: clientX, y: clientY };
        initialObjPos.current = { x: table.x, y: table.y };
    };

    const handleCanvasDown = (e) => {
        // Handle Mobile Pinch/Pan (2 fingers)
        if (e.touches && e.touches.length === 2) {
            setIsZooming(true);
            setIsPanning(false); // Pinch handles pan too usually, but let's keep separate for now
            setIsDraggingTable(false);
            isDraggingTableRef.current = false;
            lastTouchDistance.current = getTouchDistance(e.touches);
            return;
        }

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        // Determine Action
        // Right Click (2) OR Middle Click (1) -> Pan
        // Left Click (0) -> Box Select (if on background)
        const isRightClick = e.button === 2 || e.button === 1;
        const isTouchPan = e.touches && e.touches.length === 2; // Handled above, but just in case

        if (isRightClick || isTouchPan) {
            setIsPanning(true);
            setIsBoxSelecting(false);
        } else {
            // Left Click / Single Touch -> Box Select
            // Only if NOT clicking a table (handled by handleTableDown propagation stop)
            setIsBoxSelecting(true);
            setIsPanning(false);
            setSelectionBox({ startX: clientX, startY: clientY, currentX: clientX, currentY: clientY });

            // Clear selection on start of new box select (unless Shift?)
            if (!e.shiftKey) {
                setSelectedTableIds([]);
            }
        }

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

        if (isBoxSelecting) {
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            setSelectionBox(prev => ({ ...prev, currentX: clientX, currentY: clientY }));
            return;
        }

        if (!isDraggingTableRef.current && !isPanning && draggingVertexIndex === null) return;

        if (e.touches && e.touches.length > 1) return; // Don't pan if multi-touch

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaPxX = clientX - dragStart.current.x;
        const deltaPxY = clientY - dragStart.current.y;

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
        }

        // --- TABLE DRAG LOGIC ---
        if (isDraggingTableRef.current) {
            e.preventDefault();
            const deltaFtX = (deltaPxX / scale) / PX_PER_FT;
            const deltaFtY = (deltaPxY / scale) / PX_PER_FT;

            // Move ALL selected tables
            const curSelectedIds = selectedTableIdsRef.current;
            const initPosMap = initialSelectedPositions.current;

            const newTables = tables.map(t => {
                // If we have a snapshot for this table, calculate its specific new pos
                if (curSelectedIds.includes(t.id) && initPosMap[t.id]) {
                    let nextX = initPosMap[t.id].x + deltaFtX;
                    let nextY = initPosMap[t.id].y + deltaFtY;

                    // Simple integer rounding for grid snap
                    nextX = Math.round(nextX);
                    nextY = Math.round(nextY);

                    // Boundary Clamp (optional, based on room size)
                    // nextX = Math.max(0, Math.min(nextX, roomWidthFt - (t.width||8)));
                    // nextY = Math.max(0, Math.min(nextY, roomHeightFt - (t.height||3)));

                    return { ...t, x: nextX, y: nextY };
                }
                return t;
            });
            updateEventTables(newTables);
        }

        if (isPanning) {
            e.preventDefault();
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
                setSelectedTableIds([draggingTableIdRef.current]); // Select it now (Array)
                // Close other menus to prevent overlap
                setIsZoneEditing(false);
                setIsRoomEditing(false);
                setShowEventSettings(false);
            }
            // If moved, we do nothing. The drag is done. 
            // selectedTableIds remains whatever it was.
        }

        if (isBoxSelecting && selectionBox && containerRef.current) {
            const boxX = Math.min(selectionBox.startX, selectionBox.currentX);
            const boxY = Math.min(selectionBox.startY, selectionBox.currentY);
            const boxW = Math.abs(selectionBox.currentX - selectionBox.startX);
            const boxH = Math.abs(selectionBox.currentY - selectionBox.startY);

            const rect = containerRef.current.getBoundingClientRect();

            const newSelection = [];
            tables.forEach(t => {
                // Table Screen Coords = Container Offset + Pan + (Local * Scale)
                const tx = rect.left + pan.x + (t.x * PX_PER_FT * scale);
                const ty = rect.top + pan.y + (t.y * PX_PER_FT * scale);
                const tw = (t.width || DEFAULT_TABLE_W_FT) * PX_PER_FT * scale;
                const th = (t.height || DEFAULT_TABLE_H_FT) * PX_PER_FT * scale;

                const overlaps = (
                    tx < boxX + boxW &&
                    tx + tw > boxX &&
                    ty < boxY + boxH &&
                    ty + th > boxY
                );

                if (overlaps) newSelection.push(t.id);
            });

            if (newSelection.length > 0) {
                // Determine Logic: Shift to Add? Default Replace.
                setSelectedTableIds(newSelection);
            }
        }

        // Auto-Label on Drag End (if moved)
        if (isDraggingTable && hasMoved.current) {
            // We need to trigger a rewrite of the tables with new labels
            // logic: current state 'tables' is already updated with positions by handleMove
            // we just need to re-sort and re-save them.
            updateEventTables(autoLabelTables(tables));
        }

        setIsDraggingTable(false);
        isDraggingTableRef.current = false;
        draggingTableIdRef.current = null;
        setIsPanning(false);
        setIsZooming(false);
        setIsBoxSelecting(false);
        setSelectionBox(null);
        setDraggingVertexIndex(null); // Stop vertex drag
        setSnapLines([]); // Clear guides
        lastTouchDistance.current = null;
        if (isPanning && !hasMoved.current) {
            setSelectedTableIds([]);
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
                flexDirection: 'column',
                overflow: 'hidden',
                // Removed padding to align coordinate system (Visual vs Logic)
                // Header/Nav will overlay the map, which is desired behavior for full-screen maps
                paddingTop: 0,
                paddingBottom: 0,
                paddingLeft: 0,
                paddingRight: 0,
                zIndex: 1, // Below header(90)/nav(100)
                maxWidth: 'none', // Override index.css .page-container limit
                margin: 0 // Override index.css margin
            }}
        >
            {/* Context Aware Top Bar */}
            <div style={{
                height: '64px',
                padding: '0 16px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                backgroundColor: 'var(--bg-app)', // Solid background to hide global nav
                borderBottom: '1px solid var(--glass-border)',
                zIndex: 100, // High z-index to sit on top
                flexShrink: 0,
                boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
            }}>
                {/* LEFT: Back & Context Title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/')} title="Back to Events">
                        <ArrowLeft size={18} />
                    </Button>

                    <div style={{ height: '24px', width: '1px', background: 'var(--glass-border)' }} />

                    {isRoomEditing ? (
                        <div style={{ fontWeight: 'bold', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Grid size={18} /> Editing Room Shape
                        </div>
                    ) : isZoneEditing ? (
                        <div style={{ fontWeight: 'bold', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Layers size={18} /> Editing Zones
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{event.name}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                {roomWidthFt}ft x {roomHeightFt}ft
                            </span>
                        </div>
                    )}
                </div>

                {/* CENTER: Tools (Zoom) - Moved to Center for balance */}
                <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '8px' }}>
                    <Button variant="ghost" size="sm" onClick={() => setScale(s => Math.min(s * 1.2, 5))}><ZoomIn size={16} /></Button>
                    <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', fontSize: '12px', color: 'var(--text-secondary)', minWidth: '40px', justifyContent: 'center' }}>
                        {Math.round(scale * 100)}%
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setScale(s => Math.max(s / 1.2, 0.1))}><ZoomOut size={16} /></Button>
                    <Button variant="ghost" size="sm" onClick={fitToScreen} title="Fit to Screen"><Maximize size={16} /></Button>
                </div>

                {/* RIGHT: Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {isRoomEditing || isZoneEditing ? (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => { setIsRoomEditing(false); setIsZoneEditing(false); }}
                        >
                            <Check size={18} /> <span style={{ marginLeft: '6px' }}>Done</span>
                        </Button>
                    ) : (
                        <>
                            <div className="hide-mobile" style={{ display: 'flex', gap: '8px' }}>
                                <Button variant="outline" size="sm" onClick={() => { setIsZoneEditing(true); setIsRoomEditing(false); setShowEventSettings(false); }}>
                                    <Layers size={16} /> <span style={{ marginLeft: '6px' }}>Zones</span>
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => { setIsRoomEditing(true); setIsZoneEditing(false); setShowEventSettings(false); }}>
                                    <Grid size={16} /> <span style={{ marginLeft: '6px' }}>Room</span>
                                </Button>
                            </div>

                            <Button variant="primary" size="sm" onClick={addTable}>
                                <Plus size={18} /> <span className="hide-mobile" style={{ marginLeft: '6px' }}>Add Table</span>
                            </Button>

                            {/* Export Menu */}
                            <div style={{ position: 'relative' }}>
                                <Button variant={exportMenuOpen ? 'primary' : 'ghost'} size="sm" onClick={() => setExportMenuOpen(!exportMenuOpen)}>
                                    <Download size={18} />
                                </Button>
                                {exportMenuOpen && (
                                    <div className="glass-panel" style={{
                                        position: 'absolute', top: '100%', right: 0, marginTop: '8px',
                                        width: '220px', padding: '8px', zIndex: 110, display: 'flex', flexDirection: 'column', gap: '4px',
                                        backgroundColor: 'var(--bg-card)'
                                    }}>
                                        <button className="menu-item" onClick={() => handleAdvancedExport('public')}>Full Map (PDF)</button>
                                        <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '4px 0' }} />
                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '4px 8px' }}>VENDOR PACKETS</div>
                                        {vendors.length === 0 && <div style={{ padding: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>No vendors added</div>}
                                        {vendors.map(v => (
                                            <button key={v.id} className="menu-item" onClick={() => handleAdvancedExport('tenant', v.id)} style={{ fontSize: '12px', padding: '6px 8px' }}>
                                                {v.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <Button variant={showEventSettings ? 'primary' : 'ghost'} size="sm" onClick={() => setShowEventSettings(!showEventSettings)}>
                                <Settings size={18} />
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Canvas Container (Viewport) */}
            <div
                ref={containerRef}
                style={{
                    flex: 1, position: 'relative', overflow: 'hidden', cursor: isPanning ? 'grabbing' : 'grab',
                    touchAction: 'none', backgroundColor: 'var(--bg-app)',
                    // Infinite Grid Effect:
                    backgroundImage: `linear-gradient(var(--grid-color) 1px, transparent 1px), linear-gradient(90deg, var(--grid-color) 1px, transparent 1px)`,
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
                        const isSelected = selectedTableIds.includes(table.id);
                        const wFt = table.width || DEFAULT_TABLE_W_FT;
                        const hFt = table.height || DEFAULT_TABLE_H_FT;
                        const isVertical = hFt > wFt;

                        return (
                            <div
                                key={table.id}
                                className="map-table"
                                onMouseDown={(e) => handleTableDown(e, table)}
                                onTouchStart={(e) => handleTableDown(e, table)}
                                style={{
                                    position: 'absolute',
                                    left: table.x * PX_PER_FT,
                                    top: table.y * PX_PER_FT,
                                    width: wFt * PX_PER_FT,
                                    height: hFt * PX_PER_FT,
                                    backgroundColor: isSelected ? 'var(--primary)' : (zones.find(z => z.id === table.zoneId)?.color || '#10b981'),
                                    border: isSelected ? '2px solid white' : '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexDirection: 'column',
                                    color: 'white',
                                    fontSize: Math.max(10, 10 / scale) + 'px', fontWeight: 600, cursor: 'grab',
                                    boxShadow: isSelected ? '0 0 0 2px rgba(255,255,255,0.4)' : '0 2px 4px rgba(0,0,0,0.2)',
                                    zIndex: isSelected ? 100 : 1, userSelect: 'none',
                                    textAlign: 'center', lineHeight: 1.2,
                                    transition: isDraggingTableRef.current ? 'none' : 'transform 0.1s'
                                }}
                            >
                                <span className="table-label" style={{ pointerEvents: 'none' }}>{table.label}</span>
                                {table.vendorId && (
                                    <span className="vendor-name" style={{
                                        pointerEvents: 'none',
                                        fontSize: '0.8em',
                                        fontWeight: 400,
                                        opacity: 0.9
                                    }}>
                                        {vendors.find(v => v.id === table.vendorId)?.name}
                                    </span>
                                )}
                            </div>
                        );
                    })}


                </div>
            </div>

            {/* Right Side Panel: Table Edit */}
            {selectedTableIds.length > 0 && !isDraggingTable && !isPanning && !isZooming && (
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
                        {/* Single: Label */}
                        {selectedTableIds.length === 1 && (() => {
                            const t = getSelectedTables()[0];
                            if (!t) return null;
                            return (
                                <>
                                    <Input
                                        label="Label (T-00)"
                                        value={t.label}
                                        onChange={(e) => updateTable(t.id, { label: e.target.value })}
                                    />

                                    {/* Vendor -- Single Only */}
                                    <div style={{ marginTop: '4px' }}>
                                        <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Vendor</label>
                                        <select
                                            value={t.vendorId || ''}
                                            onChange={(e) => updateTable(t.id, { vendorId: e.target.value })}
                                            style={{
                                                width: '100%', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--glass-border)',
                                                padding: '8px', borderRadius: '4px', color: 'white', outline: 'none', marginTop: '4px'
                                            }}
                                        >
                                            <option value="">(None)</option>
                                            {vendors.map(v => (
                                                <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            );
                        })()}

                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                            <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                                {/* Multi-Edit Compatible Inputs (if consistent) or just reset buttons */}
                                {/* For simplicity, if multiple selected, we show buttons. If single, we show inputs? */}
                                {/* The requirement was "What do these fields do?". Explicit is better. */}

                                <Input
                                    label="Width (ft)"
                                    type="number"
                                    value={selectedTableIds.length === 1 ? (getSelectedTables()[0]?.width || DEFAULT_TABLE_W_FT) : ''}
                                    placeholder={selectedTableIds.length > 1 ? "Mix" : "8"}
                                    onChange={(e) => updateSelectedTables({ width: parseFloat(e.target.value) })}
                                />
                                <Input
                                    label="Depth (ft)"
                                    type="number"
                                    value={selectedTableIds.length === 1 ? (getSelectedTables()[0]?.height || DEFAULT_TABLE_H_FT) : ''}
                                    placeholder={selectedTableIds.length > 1 ? "Mix" : "3"}
                                    onChange={(e) => updateSelectedTables({ height: parseFloat(e.target.value) })}
                                />
                            </div>
                            <Button variant="outline" onClick={rotateTable} icon={RotateCcw} title="Rotate">Rotate</Button>
                        </div>

                        {/* Zone Assignment */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginBottom: '6px' }}>Zone</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                <button
                                    onClick={() => updateSelectedTables({ zoneId: null })}
                                    style={{
                                        padding: '6px 10px', fontSize: '12px', borderRadius: '4px',
                                        border: '1px solid var(--glass-border)',
                                        background: 'transparent', color: 'white'
                                    }}
                                >
                                    None
                                </button>
                                {zones.map(z => (
                                    <button
                                        key={z.id}
                                        onClick={() => updateSelectedTables({ zoneId: z.id })}
                                        style={{
                                            padding: '6px 10px', fontSize: '12px', borderRadius: '4px',
                                            border: '1px solid transparent',
                                            background: z.color, color: 'white'
                                        }}
                                    >
                                        {z.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <Button variant="danger" onClick={deleteTable} icon={Trash2}>Delete {selectedTableIds.length > 1 ? 'Tables' : 'Table'}</Button>
                    </div>
                </div>
            )}

            {/* Zone Manager Panel */}
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

            {/* Right Side Panel: Event Settings */}
            {
                showEventSettings && selectedTableIds.length === 0 && !isDraggingTable && (
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



            {/* Bottom Toolbar Removed - Features moved to Top Toolbar */}

            {/* Selection Box Overlay - Moved to Root to avoid Transform Stacking Context issues */}
            {isBoxSelecting && selectionBox && (
                <div style={{
                    position: 'fixed',
                    left: Math.min(selectionBox.startX, selectionBox.currentX),
                    top: Math.min(selectionBox.startY, selectionBox.currentY),
                    width: Math.abs(selectionBox.currentX - selectionBox.startX),
                    height: Math.abs(selectionBox.currentY - selectionBox.startY),
                    border: '1px solid var(--primary)',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    pointerEvents: 'none',
                    zIndex: 9999
                }} />
            )}

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
