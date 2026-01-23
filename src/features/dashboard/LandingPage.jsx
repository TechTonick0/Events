import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ArrowRight, Lock } from 'lucide-react';
import useLocalStorage from '../../hooks/useLocalStorage';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';

const LandingPage = () => {
    const [events] = useLocalStorage('cardshow_events', []);
    const navigate = useNavigate();

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-app)', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

            {/* Header */}
            <header style={{ width: '100%', maxWidth: '800px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', paddingTop: '20px' }}>
                <h1 className="text-gradient" style={{ fontSize: '24px' }}>EventHub</h1>
                <Button variant="ghost" size="sm" icon={Lock} onClick={() => navigate('/admin')}>
                    Admin Login
                </Button>
            </header>

            {/* Hero / Intro */}
            <div style={{ textAlign: 'center', maxWidth: '600px', marginBottom: '40px' }}>
                <h2 style={{ fontSize: '32px', marginBottom: '16px', color: 'white' }}>Find Your Next Event</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '18px' }}>
                    Browse upcoming card shows and events. Select an event to view the floor plan and book your table instantly.
                </p>
            </div>

            {/* Event List */}
            <div style={{ width: '100%', maxWidth: '800px', display: 'grid', gap: '20px' }}>
                {events.length === 0 ? (
                    <Card style={{ textAlign: 'center', padding: '40px' }}>
                        <p style={{ color: 'var(--text-muted)' }}>No upcoming events found.</p>
                    </Card>
                ) : (
                    events.map(event => (
                        <Card key={event.id} style={{
                            display: 'flex', flexDirection: 'column', gap: '16px',
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>{event.name}</h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                                        <Calendar size={14} />
                                        <span>{new Date(event.date || Date.now()).toLocaleDateString()}</span>
                                        {event.location && <span>• {event.location}</span>}
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                <Button
                                    variant="primary"
                                    style={{ flex: 1, justifyContent: 'center' }}
                                    onClick={() => navigate(`/book/${event.id}`)}
                                    icon={ArrowRight}
                                >
                                    Book a Table
                                </Button>
                            </div>
                        </Card>
                    ))
                )}
            </div>

            <footer style={{ marginTop: 'auto', padding: '40px', color: 'var(--text-muted)', fontSize: '12px' }}>
                &copy; {new Date().getFullYear()} EventHub Platform (v1.1)
            </footer>
        </div>
    );
};

export default LandingPage;
