import React from 'react';
import { useParams } from 'react-router-dom';
import useLocalStorage from '../../hooks/useLocalStorage';

const PublicBookingPage = () => {
    const { eventId } = useParams();
    const [events] = useLocalStorage('cardshow_events', []);
    const event = events.find(e => e.id === eventId); // Read-only access

    if (!event) return <div style={{ padding: '40px' }}>Event not found.</div>;

    return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
            <h1>Book a Table at {event.name}</h1>
            <p>Select a table on the map to begin.</p>
            {/* Map Component will go here */}
            <div style={{
                margin: '40px auto',
                width: '100%', maxWidth: '800px',
                height: '400px', background: '#eee',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
                [Interactive Map Placeholder]
            </div>
        </div>
    );
};

export default PublicBookingPage;
