import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar, Map, ChevronRight, Trash2 } from 'lucide-react';
import useLocalStorage from '../../hooks/useLocalStorage';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import { v4 as uuidv4 } from 'uuid';

const EventsPage = () => {
    const navigate = useNavigate();
    const [events, setEvents] = useLocalStorage('cardshow_events', []);
    const [isCreating, setIsCreating] = useState(false);

    // New Event Form State (Units in FEET)
    const [newEvent, setNewEvent] = useState({
        name: '',
        date: '',
        width: 100,
        height: 100
    });

    const handleCreate = () => {
        if (!newEvent.name) return;

        const eventId = uuidv4();
        const event = {
            id: eventId,
            name: newEvent.name,
            date: newEvent.date,
            settings: {
                // Stored in Feet
                width: parseInt(newEvent.width) || 100,
                height: parseInt(newEvent.height) || 100,
            },
            tables: [],
            createdAt: new Date().toISOString()
        };

        setEvents([...events, event]);
        setIsCreating(false);
        setNewEvent({ name: '', date: '', width: 100, height: 100 });
        navigate(`/events/${eventId}/layout`);
    };

    const handleDelete = (e, eventId) => {
        e.stopPropagation();
        if (window.confirm('Are you sure you want to delete this event?')) {
            setEvents(events.filter(ev => ev.id !== eventId));
        }
    };

    return (
        <div className="page-container" style={{ paddingBottom: '40px' }}>
            <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="text-gradient" style={{ fontSize: '32px' }}>My Events</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Manage your card shows</p>
                </div>
                {!isCreating && (
                    <Button variant="primary" icon={Plus} onClick={() => setIsCreating(true)}>
                        New Event
                    </Button>
                )}
            </header>

            {isCreating && (
                <Card title="Create New Event" style={{ marginBottom: '24px', animation: 'fadeIn 0.3s' }}>
                    <div style={{ display: 'grid', gap: '16px' }}>
                        <Input
                            label="Event Name"
                            placeholder="e.g. Winter Card Show 2026"
                            value={newEvent.name}
                            onChange={e => setNewEvent({ ...newEvent, name: e.target.value })}
                        />
                        <Input
                            label="Date"
                            type="date"
                            value={newEvent.date}
                            onChange={e => setNewEvent({ ...newEvent, date: e.target.value })}
                        />

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <Input
                                label="Venue Width (ft)"
                                type="number"
                                value={newEvent.width}
                                onChange={e => setNewEvent({ ...newEvent, width: e.target.value })}
                                placeholder="100"
                            />
                            <Input
                                label="Venue Height (ft)"
                                type="number"
                                value={newEvent.height}
                                onChange={e => setNewEvent({ ...newEvent, height: e.target.value })}
                                placeholder="100"
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                            <Button variant="ghost" onClick={() => setIsCreating(false)}>Cancel</Button>
                            <Button variant="primary" onClick={handleCreate}>Create & Open</Button>
                        </div>
                    </div>
                </Card>
            )}

            <div style={{ display: 'grid', gap: '16px' }}>
                {events.length === 0 && !isCreating && (
                    <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                        <Map size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                        <p>No events found. Create your first show!</p>
                    </div>
                )}

                {events.map(event => (
                    <Card
                        key={event.id}
                        className="event-card"
                        style={{ cursor: 'pointer', transition: 'transform 0.2s', borderLeft: '4px solid var(--primary)' }}
                        onClick={() => navigate(`/events/${event.id}/layout`)}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>{event.name}</h3>
                                <div style={{ display: 'flex', gap: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Calendar size={14} /> {event.date ? new Date(event.date).toLocaleDateString() : 'No Date'}
                                    </span>
                                    <span>
                                        {event.settings ? `${event.settings.width}x${event.settings.height}ft` : 'N/A'} • {event.tables ? event.tables.length : 0} Tables
                                    </span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => handleDelete(e, event.id)}
                                    title="Delete Event"
                                >
                                    <Trash2 size={18} />
                                </Button>
                                <ChevronRight color="var(--text-muted)" />
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default EventsPage;
