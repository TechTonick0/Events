import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Trash2, X, ZoomIn, ZoomOut, Maximize, RotateCcw, Settings, ArrowLeft } from 'lucide-react';
import useLocalStorage from '../../hooks/useLocalStorage';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
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

    // stored in Feet
    const roomWidthFt = event?.settings?.width || 100;
    const roomHeightFt = event?.settings?.height || 100;

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
            };
        }
        if (updates.name) updatedEvents[eventIndex].name = updates.name;
        if (updates.date) updatedEvents[eventIndex].date = updates.date;

        setEvents(updatedEvents);
    };

    const getSelectedTable = () => tables.find(t => t.id === selectedTableId);

    const updateSelectedTable = (updates) => {
        const newTables = tables.map(t => {
            if (t.id === selectedTableId) {
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
    const handleWheel = (e) => {
        e.preventDefault();
        if (e.ctrlKey) { } // Prevent standard zoom

        const sensitivity = 0.001;
        const delta = -e.deltaY * sensitivity;
        const newScale = Math.min(Math.max(0.1, scale + delta * scale * 5), 5); // Use relative zoom

        setScale(newScale);
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
        setSelectedTableId(table.id);
        setShowEventSettings(false);
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
            e.preventDefault(); // Stop browser pinch on this element
            const dist = getTouchDistance(e.touches);
            if (lastTouchDistance.current) {
                const ratio = dist / lastTouchDistance.current;
                const newScale = Math.min(Math.max(0.1, scale * ratio), 5);
                setScale(newScale);
                lastTouchDistance.current = dist;
            }
            return;
        }

        if (!isDraggingTable && !isPanning) return;

        if (e.touches && e.touches.length > 1) return; // Don't pan if multi-touch

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaPxX = clientX - dragStart.current.x;
        const deltaPxY = clientY - dragStart.current.y;

        if (Math.abs(deltaPxX) > 2 || Math.abs(deltaPxY) > 2) hasMoved.current = true;

        if (isDraggingTable && selectedTableId) {
            e.preventDefault(); // Stop scroll when dragging table
            const t = tables.find(t => t.id === selectedTableId);
            const w = t.width || DEFAULT_TABLE_W_FT;
            const h = t.height || DEFAULT_TABLE_H_FT;

            const deltaFtX = (deltaPxX / scale) / PX_PER_FT;
            const deltaFtY = (deltaPxY / scale) / PX_PER_FT;

            let newX = initialObjPos.current.x + deltaFtX;
            let newY = initialObjPos.current.y + deltaFtY;

            newX = Math.round(newX);
            newY = Math.round(newY);

            newX = Math.max(0, Math.min(newX, roomWidthFt - w));
            newY = Math.max(0, Math.min(newY, roomHeightFt - h));

            updateSelectedTable({ x: newX, y: newY });
        } else if (isPanning) {
            setPan({
                x: initialObjPos.current.x + deltaPxX,
                y: initialObjPos.current.y + deltaPxY
            });
        }
    };

    const handleUp = () => {
        setIsDraggingTable(false);
        setIsPanning(false);
        setIsZooming(false);
        lastTouchDistance.current = null;
        if (isPanning && !hasMoved.current) {
            setSelectedTableId(null);
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

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const handleNativeWheel = (e) => {
            e.preventDefault();
            if (e.ctrlKey) { } // Prevent standard zoom if needed

            const sensitivity = 0.001;
            const delta = -e.deltaY * sensitivity;

            setScale(prevScale => {
                const newScale = Math.min(Math.max(0.1, prevScale + delta * prevScale * 5), 5);
                return newScale;
            });
        };

        // Non-passive listener to allow preventDefault()
        el.addEventListener('wheel', handleNativeWheel, { passive: false });

        return () => {
            el.removeEventListener('wheel', handleNativeWheel);
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
                onMouseUp={handleUp} onMouseLeave={handleUp}
            >
                {/* Venue Boundary (The "Room") */}
                <div
                    style={{
                        position: 'absolute', left: pan.x, top: pan.y,
                        transform: `scale(${scale})`, transformOrigin: '0 0',
                        width: canvasWidthPx, height: canvasHeightPx,
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        // Use box-shadow instead of border to prevent layout shift (border takes up space)
                        boxShadow: '0 0 0 2px var(--primary-glow), 0 0 50px rgba(0,0,0,0.5)'
                    }}
                >
                    {tables.map(table => {
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
                                    backgroundColor: getStatusColor(table.status, isSelected),
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
                                value={selectedTable.vendorId || ''}
                                onChange={(e) => updateSelectedTable({ vendorId: e.target.value })}
                                style={{
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

                        <Button variant="danger" onClick={deleteTable} icon={Trash2}>Delete Table</Button>
                    </div>
                </div>
            )}

            {/* Right Side Panel: Event Settings */}
            {showEventSettings && !selectedTable && !isDraggingTable && (
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
            )}

            <style>{`
                @keyframes slideLeft {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                @media (max-width: 600px) {
                    .mobile-edit-panel {
                         width: 100% !important;
                         top: auto !important;
                         bottom: 80px !important;
                         left: 0 !important;
                         right: 0 !important;
                         height: 50vh !important;
                         border-radius: var(--radius-lg) var(--radius-lg) 0 0 !important;
                         animation: slideUp 0.3s !important;
                         touch-action: none !important; /* Shell handles touch, passes to child */
                         pointer-events: auto !important;
                         animation-name: slideUp !important;
                         overflow: hidden !important; /* Hide shell overflow, scroll inner */
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
        </div>
    );
};

export default FloorPlanPage;
