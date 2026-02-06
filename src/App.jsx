import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation, useParams, Navigate, Outlet } from 'react-router-dom';
import { LayoutDashboard, Users, DollarSign, FileSignature, ChevronLeft, LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './features/auth/LoginPage';
import EventsPage from './features/events/EventsPage';
import FloorPlanPage from './features/layout/FloorPlanPage';
import VendorsPage from './features/vendors/VendorsPage';
import AccountingPage from './features/accounting/AccountingPage';
import AgreementsPage from './features/agreements/AgreementsPage';
import PublicBookingPage from './features/booking/PublicBookingPage';
import LandingPage from './features/dashboard/LandingPage';
import Button from './components/ui/Button';

// Protected Route Wrapper
const RequireAuth = () => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

// Admin Layout with Logout
const AdminLayout = () => {
  const { logout } = useAuth();
  const location = useLocation();
  const isLayoutPage = location.pathname.includes('/layout');

  return (
    <>
      {!isLayoutPage && (
        <div style={{ position: 'fixed', top: 10, right: 10, zIndex: 9999 }}>
          <Button variant="ghost" size="sm" onClick={logout} icon={LogOut}>Logout</Button>
        </div>
      )}
      <Outlet />
    </>
  )
}

// Navigation Component (Context Aware)
const EventNavigation = () => {
  const { eventId } = useParams();
  const location = useLocation();

  if (!eventId) return null;

  const navItems = [
    { path: `/admin/events/${eventId}/layout`, icon: LayoutDashboard, label: 'Layout' },
    { path: `/admin/events/${eventId}/vendors`, icon: Users, label: 'Vendors' },
    { path: `/admin/events/${eventId}/accounting`, icon: DollarSign, label: 'Finance' },
    { path: `/admin/events/${eventId}/agreements`, icon: FileSignature, label: 'Legal' },
  ];

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: 'var(--nav-height)',
      background: 'rgba(24, 24, 27, 0.95)',
      backdropFilter: 'blur(16px)',
      borderTop: '1px solid var(--glass-border)',
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'center',
      zIndex: 100,
      paddingBottom: 'safe-area-inset-bottom'
    }}>
      {navItems.map((item) => {
        const isActive = location.pathname.startsWith(item.path);
        return (
          <NavLink
            key={item.path}
            to={item.path}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textDecoration: 'none',
              color: isActive ? 'var(--primary)' : 'var(--text-muted)',
              transition: 'color 0.2s',
            }}
          >
            <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
            <span style={{ fontSize: '11px', marginTop: '4px', fontWeight: 500 }}>{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  );
};

// Header Wrapper to go back to list
const EventHeader = () => {
  const { eventId } = useParams();
  if (!eventId) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: '50px',
      zIndex: 90, display: 'flex', alignItems: 'center', padding: '0 16px',
      pointerEvents: 'none' // Let clicks pass through to page content mostly, but button needs events
    }}>
      <NavLink
        to="/admin/events"
        style={{
          pointerEvents: 'auto',
          display: 'flex', alignItems: 'center', gap: '4px',
          color: 'var(--text-muted)', textDecoration: 'none',
          background: 'rgba(0,0,0,0.6)', padding: '6px 12px', borderRadius: '20px',
          backdropFilter: 'blur(4px)', fontSize: '13px', fontWeight: 500
        }}
      >
        <ChevronLeft size={16} /> All Events
      </NavLink>
    </div>
  );
};


function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <div className="app-shell">
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/book/:eventId" element={<PublicBookingPage />} />

            {/* Protected Admin Routes */}
            <Route path="/admin" element={<RequireAuth />}>
              <Route element={<AdminLayout />}>
                <Route path="events" element={<EventsPage />} />
                <Route path="events/:eventId/layout" element={<><FloorPlanPage /><EventNavigation /></>} />
                <Route path="events/:eventId/vendors" element={<><EventHeader /><VendorsPage /><EventNavigation /></>} />
                <Route path="events/:eventId/accounting" element={<><EventHeader /><AccountingPage /><EventNavigation /></>} />
                <Route path="events/:eventId/agreements" element={<><EventHeader /><AgreementsPage /><EventNavigation /></>} />

                {/* Default Admin Redirect */}
                <Route index element={<Navigate to="events" replace />} />
              </Route>
            </Route>

            {/* Root Redirect removed */}

            {/* Catch-All: Redirect unknown routes to events */}
            <Route path="*" element={<Navigate to="/admin/events" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
