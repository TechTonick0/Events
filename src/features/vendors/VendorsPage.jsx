import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Trash2, User, Phone, Mail } from 'lucide-react';
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

    const [isAdding, setIsAdding] = useState(false);
    const [newVendor, setNewVendor] = useState({ name: '', email: '', phone: '' });

    // Helpers
    const updateEventVendors = (newVendors) => {
        const updatedEvents = [...events];
        updatedEvents[eventIndex] = { ...event, vendors: newVendors };
        setEvents(updatedEvents);
    };

    const handleAdd = () => {
        if (!newVendor.name) return;
        updateEventVendors([...vendors, { ...newVendor, id: uuidv4(), joinedAt: new Date().toISOString() }]);
        setNewVendor({ name: '', email: '', phone: '' });
        setIsAdding(false);
    };

    const handleDelete = (id) => {
        if (window.confirm('Are you sure you want to delete this vendor?')) {
            updateEventVendors(vendors.filter(v => v.id !== id));
        }
    };

    if (!event) return <div className="page-container" style={{ marginTop: '50px' }}>Loading...</div>;

    return (
        <div className="page-container" style={{ marginTop: '50px', paddingBottom: '100px' }}>
            <header style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="text-gradient" style={{ fontSize: '28px' }}>Vendors</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>{event.name}</p>
                </div>
                <Button variant="primary" icon={Plus} onClick={() => setIsAdding(!isAdding)}>
                    {isAdding ? 'Cancel' : 'Add Vendor'}
                </Button>
            </header>

            {isAdding && (
                <div className="glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-md)', marginBottom: '24px', animation: 'fadeIn 0.3s' }}>
                    <h3 style={{ marginBottom: '16px' }}>New Vendor</h3>
                    <div style={{ display: 'grid', gap: '12px' }}>
                        <Input
                            label="Name"
                            placeholder="Store or Person Name"
                            value={newVendor.name}
                            onChange={e => setNewVendor({ ...newVendor, name: e.target.value })}
                        />
                        <Input
                            label="Email"
                            placeholder="contact@example.com"
                            value={newVendor.email}
                            onChange={e => setNewVendor({ ...newVendor, email: e.target.value })}
                        />
                        <Input
                            label="Phone"
                            placeholder="(555) 123-4567"
                            value={newVendor.phone}
                            onChange={e => setNewVendor({ ...newVendor, phone: e.target.value })}
                        />
                        <Button style={{ marginTop: '8px' }} onClick={handleAdd}>Save Vendor</Button>
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gap: '12px' }}>
                {vendors.length === 0 && !isAdding && (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No vendors added yet.
                    </div>
                )}
                {vendors.map(vendor => (
                    <Card key={vendor.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '50%',
                                background: 'linear-gradient(135deg, var(--bg-card), var(--bg-panel))',
                                border: '1px solid var(--glass-border)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <User size={20} color="var(--primary)" />
                            </div>
                            <div>
                                <h3 style={{ fontSize: '16px', fontWeight: 600 }}>{vendor.name}</h3>
                                <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                    {vendor.email && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={12} /> {vendor.email}</span>}
                                    {vendor.phone && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={12} /> {vendor.phone}</span>}
                                </div>
                            </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(vendor.id)}><Trash2 size={18} /></Button>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default VendorsPage;
