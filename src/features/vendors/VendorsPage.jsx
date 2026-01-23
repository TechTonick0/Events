import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Trash2, User, Phone, Mail, CheckCircle, Clock, DollarSign, ArrowUpDown } from 'lucide-react';
import useLocalStorage from '../../hooks/useLocalStorage';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import { v4 as uuidv4 } from 'uuid';

const VendorsPage = () => {
    const { eventId } = useParams();
    const [events, setEvents] = useLocalStorage('cardshow_events', []);

    // Derived State
    const eventIndex = events.findIndex(e => e.id === eventId);
    const event = events[eventIndex];
    const vendors = event?.vendors || [];
    const tables = event?.tables || [];
    const agreements = event?.agreements || [];

    const [isAdding, setIsAdding] = useState(false);
    const [newVendor, setNewVendor] = useState({ name: '', email: '', phone: '' });

    // Sort State
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

    // Helpers
    const updateEventVendors = (newVendors) => {
        const updatedEvents = [...events];
        updatedEvents[eventIndex] = { ...event, vendors: newVendors };
        setEvents(updatedEvents);
    };

    const handleAdd = () => {
        if (!newVendor.name) return;
        updateEventVendors([...vendors, {
            ...newVendor,
            id: uuidv4(),
            joinedAt: new Date().toISOString(),
            isPaid: false // Default
        }]);
        setNewVendor({ name: '', email: '', phone: '' });
        setIsAdding(false);
    };

    const handleDelete = (id) => {
        if (window.confirm('Are you sure you want to delete this vendor?')) {
            updateEventVendors(vendors.filter(v => v.id !== id));
        }
    };

    const togglePaid = (id) => {
        const updated = vendors.map(v =>
            v.id === id ? { ...v, isPaid: !v.isPaid } : v
        );
        updateEventVendors(updated);
    };

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // Process Data
    const processedVendors = useMemo(() => {
        const data = vendors.map(v => {
            const vTables = tables.filter(t => t.vendorId === v.id);
            const tableLabels = vTables.map(t => t.label).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(', ');
            const hasSigned = agreements.some(a => a.vendorId === v.id);

            return {
                ...v,
                tableCount: vTables.length,
                tableLabels,
                hasSigned
            };
        });

        return data.sort((a, b) => {
            if (sortConfig.key === 'tables') {
                return sortConfig.direction === 'asc'
                    ? a.tableCount - b.tableCount
                    : b.tableCount - a.tableCount;
            }
            if (sortConfig.key === 'paid') {
                return sortConfig.direction === 'asc'
                    ? (a.isPaid === b.isPaid ? 0 : a.isPaid ? -1 : 1)
                    : (a.isPaid === b.isPaid ? 0 : a.isPaid ? 1 : -1);
            }
            if (sortConfig.key === 'signed') {
                return sortConfig.direction === 'asc'
                    ? (a.hasSigned === b.hasSigned ? 0 : a.hasSigned ? -1 : 1)
                    : (a.hasSigned === b.hasSigned ? 0 : a.hasSigned ? 1 : -1);
            }
            // Default Name
            const valA = a[sortConfig.key]?.toString().toLowerCase() || '';
            const valB = b[sortConfig.key]?.toString().toLowerCase() || '';
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [vendors, tables, agreements, sortConfig]);

    if (!event) return <div className="page-container" style={{ marginTop: '50px' }}>Loading...</div>;

    return (
        <div className="page-container" style={{ marginTop: '50px', paddingBottom: '100px' }}>
            <header style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="text-gradient" style={{ fontSize: '28px' }}>Vendors</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>{event.name} • {vendors.length} Vendors</p>
                </div>
                <Button variant="primary" icon={Plus} onClick={() => setIsAdding(!isAdding)}>
                    {isAdding ? 'Cancel' : 'Add Vendor'}
                </Button>
            </header>

            {isAdding && (
                <div className="glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-md)', marginBottom: '24px', animation: 'fadeIn 0.3s' }}>
                    <h3 style={{ marginBottom: '16px' }}>New Vendor</h3>
                    <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: '1fr 1fr 1fr auto' }}>
                        <Input
                            placeholder="Name"
                            value={newVendor.name}
                            onChange={e => setNewVendor({ ...newVendor, name: e.target.value })}
                        />
                        <Input
                            placeholder="Email"
                            value={newVendor.email}
                            onChange={e => setNewVendor({ ...newVendor, email: e.target.value })}
                        />
                        <Input
                            placeholder="Phone"
                            value={newVendor.phone}
                            onChange={e => setNewVendor({ ...newVendor, phone: e.target.value })}
                        />
                        <Button onClick={handleAdd}>Save</Button>
                    </div>
                </div>
            )}

            <div className="glass-panel" style={{ overflow: 'hidden', padding: 0 }}>
                {/* Header Row */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(200px, 2fr) 1fr 100px 100px 60px',
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--glass-border)',
                    background: 'rgba(0,0,0,0.2)',
                    fontWeight: 600,
                    fontSize: '13px',
                    color: 'var(--text-secondary)'
                }}>
                    <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => handleSort('name')}>
                        VENDOR <ArrowUpDown size={12} />
                    </div>
                    <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => handleSort('tables')}>
                        TABLES <ArrowUpDown size={12} />
                    </div>
                    <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }} onClick={() => handleSort('signed')}>
                        SIGNED <ArrowUpDown size={12} />
                    </div>
                    <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }} onClick={() => handleSort('paid')}>
                        PAID <ArrowUpDown size={12} />
                    </div>
                    <div></div>
                </div>

                {/* Rows */}
                {processedVendors.length === 0 && (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No vendors found.
                    </div>
                )}

                {processedVendors.map(vendor => (
                    <div key={vendor.id} style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(200px, 2fr) 1fr 100px 100px 60px',
                        padding: '16px',
                        borderBottom: '1px solid var(--glass-border)',
                        alignItems: 'center',
                        transition: 'background 0.2s',
                    }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                        {/* Name & Contact */}
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '15px' }}>{vendor.name}</div>
                            <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                {vendor.email && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={10} /> {vendor.email}</span>}
                                {vendor.phone && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={10} /> {vendor.phone}</span>}
                            </div>
                        </div>

                        {/* Tables */}
                        <div style={{ fontSize: '14px' }}>
                            {vendor.tableLabels ? (
                                <span style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                                    {vendor.tableLabels}
                                </span>
                            ) : (
                                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>None</span>
                            )}
                        </div>

                        {/* Signed Status */}
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            {vendor.hasSigned ? (
                                <div style={{ color: 'var(--success)', display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '10px' }}>
                                    <CheckCircle size={18} />
                                    <span style={{ marginTop: '2px' }}>Signed</span>
                                </div>
                            ) : (
                                <div style={{ color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '10px', opacity: 0.5 }}>
                                    <Clock size={18} />
                                    <span style={{ marginTop: '2px' }}>Pending</span>
                                </div>
                            )}
                        </div>

                        {/* Paid Status (Toggleable) */}
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <button
                                onClick={() => togglePaid(vendor.id)}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '10px',
                                    color: vendor.isPaid ? 'var(--success)' : 'var(--danger)',
                                    transition: 'transform 0.1s'
                                }}
                                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
                                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                <div style={{
                                    width: '24px', height: '24px', borderRadius: '50%',
                                    border: `2px solid ${vendor.isPaid ? 'var(--success)' : 'var(--danger)'}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: vendor.isPaid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                                }}>
                                    <DollarSign size={14} strokeWidth={3} />
                                </div>
                                <span style={{ marginTop: '4px', fontWeight: 600 }}>{vendor.isPaid ? 'PAID' : 'DUE'}</span>
                            </button>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(vendor.id)}>
                                <Trash2 size={16} />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default VendorsPage;
