import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider, useSession, type Role } from "./app/SessionContext";
import { AppShell, LoadingState } from "./components/AppShell";
import {
  AdminDashboardPage,
  AdminPharmaciesPage,
  AdminReportsPage,
  AdminRequestTracePage,
  AdminRequestsPage,
  AdminUsersPage,
  VerificationDetailPage,
  VerificationQueuePage,
} from "./pages/AdminPages";
import {
  MedicineSearchPage,
  NearbyPharmaciesPage,
  NewRequestPage,
  NotificationsPage,
  PatientHomePage,
  PatientProfilePage,
  RequestDetailPage,
  RequestHistoryPage,
  ReservationPage,
  SavedPharmaciesPage,
} from "./pages/PatientPages";
import {
  PharmacyDashboardPage,
  PharmacyGate,
  PharmacyInboxPage,
  PharmacyRequestPage,
  PharmacyReservationsPage,
  PharmacySettingsPage,
} from "./pages/PharmacyPages";
import { AuthPage, WelcomePage } from "./pages/PublicPages";

function RequireRole({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  const { session, loading } = useSession();
  if (loading) return <LoadingState label="نستعيد جلستك الآمنة…" />;
  if (!session) {
    const rolePath = role.toLowerCase();
    return <Navigate to={`/auth/${rolePath}/login`} replace />;
  }
  if (session.user.role !== role) {
    const target =
      session.user.role === "PATIENT"
        ? "/patient"
        : session.user.role === "PHARMACY"
          ? "/pharmacy"
          : "/admin";
    return <Navigate to={target} replace />;
  }
  return <AppShell role={role}>{children}</AppShell>;
}

function PatientRoute({ children }: { children: React.ReactNode }) {
  return <RequireRole role="PATIENT">{children}</RequireRole>;
}

function PharmacyRoute({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="PHARMACY">
      <PharmacyGate>{children}</PharmacyGate>
    </RequireRole>
  );
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  return <RequireRole role="ADMIN">{children}</RequireRole>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route path="/auth/:role/:mode" element={<AuthPage />} />

      <Route path="/patient" element={<PatientRoute><PatientHomePage /></PatientRoute>} />
      <Route path="/patient/search" element={<PatientRoute><MedicineSearchPage /></PatientRoute>} />
      <Route path="/patient/requests/new" element={<PatientRoute><NewRequestPage /></PatientRoute>} />
      <Route path="/patient/requests/:requestId" element={<PatientRoute><RequestDetailPage /></PatientRoute>} />
      <Route path="/patient/reservations/:reservationId" element={<PatientRoute><ReservationPage /></PatientRoute>} />
      <Route path="/patient/history" element={<PatientRoute><RequestHistoryPage /></PatientRoute>} />
      <Route path="/patient/pharmacies" element={<PatientRoute><NearbyPharmaciesPage /></PatientRoute>} />
      <Route path="/patient/saved-pharmacies" element={<PatientRoute><SavedPharmaciesPage /></PatientRoute>} />
      <Route path="/patient/profile" element={<PatientRoute><PatientProfilePage /></PatientRoute>} />
      <Route path="/patient/notifications" element={<PatientRoute><NotificationsPage /></PatientRoute>} />

      <Route path="/pharmacy" element={<PharmacyRoute><PharmacyDashboardPage /></PharmacyRoute>} />
      <Route path="/pharmacy/inbox" element={<PharmacyRoute><PharmacyInboxPage /></PharmacyRoute>} />
      <Route path="/pharmacy/inbox/:requestId" element={<PharmacyRoute><PharmacyRequestPage /></PharmacyRoute>} />
      <Route path="/pharmacy/reservations" element={<PharmacyRoute><PharmacyReservationsPage /></PharmacyRoute>} />
      <Route path="/pharmacy/settings" element={<PharmacyRoute><PharmacySettingsPage /></PharmacyRoute>} />
      <Route path="/pharmacy/notifications" element={<PharmacyRoute><NotificationsPage /></PharmacyRoute>} />

      <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
      <Route path="/admin/verifications" element={<AdminRoute><VerificationQueuePage /></AdminRoute>} />
      <Route path="/admin/verifications/:pharmacyId" element={<AdminRoute><VerificationDetailPage /></AdminRoute>} />
      <Route path="/admin/pharmacies" element={<AdminRoute><AdminPharmaciesPage /></AdminRoute>} />
      <Route path="/admin/requests" element={<AdminRoute><AdminRequestsPage /></AdminRoute>} />
      <Route path="/admin/requests/:requestId" element={<AdminRoute><AdminRequestTracePage /></AdminRoute>} />
      <Route path="/admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
      <Route path="/admin/reports" element={<AdminRoute><AdminReportsPage /></AdminRoute>} />
      <Route path="/admin/notifications" element={<AdminRoute><NotificationsPage /></AdminRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <AppRoutes />
      </SessionProvider>
    </BrowserRouter>
  );
}
