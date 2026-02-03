import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, MapPin, CreditCard, ChevronRight, ChevronLeft } from 'lucide-react';
import useLocalStorage from '../../hooks/useLocalStorage';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import { v4 as uuidv4 } from 'uuid';

const PX_PER_FT = 10; // Scaling factor matching FloorPlan

const PublicBookingPage = () => {
    const { eventId } = useParams();
    const [events, setEvents] = useLocalStorage('cardshow_events', []);
    const eventIndex = events.findIndex(e => e.id === eventId);
    const event = events[eventIndex];

    const [step, setStep] = useState(1);
    const [selectedTableIds, setSelectedTableIds] = useState([]);
    const [vendorInfo, setVendorInfo] = useState({ name: '', email: '', phone: '' });
    const [isProcessing, setIsProcessing] = useState(false);

    // Map Logic
    const containerRef = useRef(null);
    const [viewBox, setViewBox] = useState({ scale: 1, x: 0, y: 0 });

    // Defined BEFORE useEffect to avoid ReferenceError
    const tables = event?.tables || [];
    const zones = event?.zones || [];
    const roomWidth = (event?.settings?.width || 100) * PX_PER_FT;
    const roomHeight = (event?.settings?.height || 100) * PX_PER_FT;

    // Auto-fit Logic (Zoom to Room Boundary)
    useEffect(() => {
        if (!event || !containerRef.current) return;

        const fit = () => {
            if (!containerRef.current) return;

            // 1. Get Room Dimensions from Settings
            // Default to 100x100 if missing (in PX)
            const contentW = roomWidth;
            const contentH = roomHeight;

            // 2. Measure Container
            const rect = containerRef.current.getBoundingClientRect();
            const availableW = rect.width;
            const availableH = rect.height;

            // 3. Calculate Scale to Fit Room
            // Add slight padding (e.g. 95% of screen)
            const scaleW = availableW / contentW;
            const scaleH = availableH / contentH;
            const newScale = Math.min(scaleW, scaleH) * 0.95;

            // 4. Center the Room
            // We want the room center (roomWidth/2, roomHeight/2) to be at screen center.
            const cx = contentW / 2;
            const cy = contentH / 2;

            setViewBox({ scale: newScale, x: cx, y: cy });
        };

        fit();
        window.addEventListener('resize', fit);
        return () => window.removeEventListener('resize', fit);
    }, [event, roomWidth, roomHeight]);


    if (!event) return <div style={{ padding: '40px', color: 'white' }}>Event not found.</div>;

    // Helpers
    const toggleTable = (id) => {
        if (selectedTableIds.includes(id)) {
            setSelectedTableIds(selectedTableIds.filter(t => t !== id));
        } else {
            setSelectedTableIds([...selectedTableIds, id]);
        }
    };

    const handleBooking = () => {
        setIsProcessing(true);
        setTimeout(() => {
            // 1. Create Vendor
            const vendorId = uuidv4();
            const newVendor = {
                id: vendorId,
                ...vendorInfo,
                joinedAt: new Date().toISOString(),
                isPaid: true // Mark paid for this demo
            };

            // 2. Update Tables
            const updatedTables = tables.map(t => {
                if (selectedTableIds.includes(t.id)) {
                    return { ...t, status: 'reserved', vendorId: vendorId };
                }
                return t;
            });

            // 3. Save
            const updatedEvents = [...events];
            const currentVendors = event.vendors || [];
            updatedEvents[eventIndex] = {
                ...event,
                vendors: [...currentVendors, newVendor],
                tables: updatedTables
            };
            setEvents(updatedEvents);
            setIsProcessing(false);
            setStep(4); // Success Status
        }, 1500);
    };

    // --- STEPS ---

    // Helper: Find which zone a table belongs to (Explicit or Spatial)
    const getZoneForTable = (table) => {
        // 1. Explicit Assignment (Legacy)
        if (table.zoneId) {
            const z = zones.find(z => z.id === table.zoneId);
            if (z) return z;
        }

        // 2. Spatial Lookup (Table center inside Zone Region)
        const regions = event?.settings?.zoneRegions || [];
        const tx = table.x + (table.width || 8) / 2;
        const ty = table.y + (table.height || 3) / 2;

        const region = regions.find(r =>
            tx >= r.x && tx <= r.x + r.width &&
            ty >= r.y && ty <= r.y + r.height
        );

        if (region) return zones.find(z => z.id === region.zoneId);
        return null;
    };

    // Step 1: Map Selection
    if (step === 1) {
        return (
            <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-app)' }}>
                {/* Header */}
                <header style={{ padding: '16px 24px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ fontSize: '20px', fontWeight: 600 }}>{event.name}</h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Select your tables (v1.2)</p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ fontSize: '14px' }}>
                            {selectedTableIds.length} Selected
                        </div>
                        <Button
                            variant="primary"
                            disabled={selectedTableIds.length === 0}
                            onClick={() => setStep(2)}
                            icon={ChevronRight}
                        >
                            Continue
                        </Button>
                    </div>
                </header>

                {/* Map View */}
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden', padding: '0', background: '#18181b' }}>
                    <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{
                            width: roomWidth,
                            height: roomHeight,
                            position: 'relative',
                            // Transform logic
                            transform: `scale(${viewBox.scale}) translate(${-viewBox.x + (roomWidth / 2)}px, ${-viewBox.y + (roomHeight / 2)}px)`,
                            transformOrigin: 'center center',
                            boxShadow: '0 0 50px rgba(0,0,0,0.5)'
                        }}>
                            {/* Room Shape (Mask/Fill) */}
                            <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
                                <defs>
                                    <pattern id="grid" width={PX_PER_FT} height={PX_PER_FT} patternUnits="userSpaceOnUse">
                                        <path d={`M ${PX_PER_FT} 0 L 0 0 0 ${PX_PER_FT}`} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                                    </pattern>
                                    {/* Mask to clip outside the room */}
                                    <mask id="roomMask">
                                        <rect width="100%" height="100%" fill="black" />
                                        <path
                                            d={event.settings?.boundary
                                                ? `M ${event.settings.boundary.map(p => `${p.x * PX_PER_FT},${p.y * PX_PER_FT}`).join(' L ')} Z`
                                                : `M 0,0 L ${roomWidth},0 L ${roomWidth},${roomHeight} L 0,${roomHeight} Z`
                                            }
                                            fill="white"
                                        />
                                    </mask>
                                </defs>

                                {/* Background Fill (Clipped to Room) */}
                                <rect width="100%" height="100%" fill="#27272a" mask="url(#roomMask)" />
                                <rect width="100%" height="100%" fill="url(#grid)" mask="url(#roomMask)" />

                                {/* Room Border */}
                                <path
                                    d={event.settings?.boundary
                                        ? `M ${event.settings.boundary.map(p => `${p.x * PX_PER_FT},${p.y * PX_PER_FT}`).join(' L ')} Z`
                                        : `M 0,0 L ${roomWidth},0 L ${roomWidth},${roomHeight} L 0,${roomHeight} Z`
                                    }
                                    fill="none"
                                    stroke="#52525b"
                                    strokeWidth="2"
                                />
                            </svg>

                            {/* Tables */}
                            {tables.map(table => {
                                const isTaken = table.status === 'reserved' || table.status === 'occupied';
                                const isSelected = selectedTableIds.includes(table.id);
                                const zone = getZoneForTable(table);
                                const color = isTaken ? '#3f3f46' : (isSelected ? 'var(--primary)' : (zone?.color || '#10b981')); // Green avail

                                return (
                                    <div
                                        key={table.id}
                                        onClick={() => !isTaken && toggleTable(table.id)}
                                        style={{
                                            position: 'absolute',
                                            left: table.x * PX_PER_FT,
                                            top: table.y * PX_PER_FT,
                                            width: (table.width || 8) * PX_PER_FT,
                                            height: (table.height || 3) * PX_PER_FT,
                                            backgroundColor: color,
                                            borderRadius: '2px', // Sharper corners for tables
                                            cursor: isTaken ? 'not-allowed' : 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: isTaken ? '#71717a' : 'white', fontWeight: 600, fontSize: '10px',
                                            transition: 'transform 0.1s',
                                            transform: `rotate(${table.rotation || 0}deg)`,
                                            border: isSelected ? '2px solid white' : (isTaken ? '1px solid #27272a' : '1px solid rgba(0,0,0,0.2)'),
                                            boxShadow: isSelected ? '0 0 10px var(--primary)' : 'none',
                                            opacity: 1
                                        }}
                                    >
                                        {isTaken ? 'Taken' : table.label}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Step 2: Vendor Info
    if (step === 2) {
        return (
            <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
                <Button variant="ghost" onClick={() => setStep(1)} icon={ChevronLeft} style={{ marginBottom: '20px' }}>Back to Map</Button>
                <Card title="Vendor Details">
                    <div style={{ display: 'grid', gap: '16px' }}>
                        <Input label="Business / Contact Name" value={vendorInfo.name} onChange={e => setVendorInfo({ ...vendorInfo, name: e.target.value })} autoFocus />
                        <Input label="Email Address" value={vendorInfo.email} onChange={e => setVendorInfo({ ...vendorInfo, email: e.target.value })} type="email" />
                        <Input label="Phone Number" value={vendorInfo.phone} onChange={e => setVendorInfo({ ...vendorInfo, phone: e.target.value })} type="tel" />

                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                            <Button
                                variant="primary"
                                disabled={!vendorInfo.name || !vendorInfo.email}
                                onClick={() => setStep(3)}
                                icon={ChevronRight}
                            >
                                Review & Pay
                            </Button>
                        </div>
                    </div>
                </Card>
            </div>
        );
    }

    // Step 3: Checkout
    if (step === 3) {
        return (
            <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
                <Button variant="ghost" onClick={() => setStep(2)} icon={ChevronLeft} style={{ marginBottom: '20px' }}>Back to Details</Button>
                <Card>
                    <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                        <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Confirm Booking</h2>
                        <p style={{ color: 'var(--text-secondary)' }}>You are booking {selectedTableIds.length} tables.</p>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span>Tables ({selectedTableIds.length})</span>
                            <span>$100.00</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                            {/* Mock Price calculation logic could go here */}
                            <span>(Mock Price: Fixed Demo Rate)</span>
                        </div>
                        <div style={{ height: '1px', background: 'var(--glass-border)', margin: '16px 0' }}></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '18px' }}>
                            <span>Total</span>
                            <span>$100.00</span>
                        </div>
                    </div>

                    <Button
                        variant="primary"
                        size="lg"
                        style={{ width: '100%', justifyContent: 'center' }}
                        onClick={handleBooking}
                        disabled={isProcessing}
                    >
                        {isProcessing ? 'Processing...' : `Pay $100.00`}
                    </Button>
                    <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>
                        <CreditCard size={12} style={{ display: 'inline', marginRight: '4px' }} />
                        Secure Payment processed by Stripe (Demo)
                    </p>
                </Card>
            </div>
        );
    }

    // Success
    return (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: '20px', textAlign: 'center' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                <CheckCircle size={40} color="white" />
            </div>
            <h1 className="text-gradient">Booking Confirmed!</h1>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '16px auto' }}>
                Thank you, {vendorInfo.name}. Your tables have been reserved. A confirmation email has been sent to {vendorInfo.email}.
            </p>
            <Button variant="outline" onClick={() => window.location.reload()}>Book Another</Button>
        </div>
    );
};

export default PublicBookingPage;
