import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './AppShell';
import { LandingPage } from './marketing/LandingPage';
import { AuthPage } from './auth/AuthPage';
import { AccountPage } from './account/AccountPage';
import { BillingPage } from './billing/BillingPage';
import { CheckoutReturn } from './billing/CheckoutReturn';

// URL scheme. The app screens all render <AppShell/> (which is store-driven and
// mirrored to the URL by useUrlStoreSync); the different paths just carry the
// fileId / issueId / recordId so deep links and back/forward resolve correctly.
//
//   /                                     marketing landing page
//   /login, /signup                       auth (honor ?next=)
//   /account, /account/billing            account + purchase
//   /checkout/return                      post-Stripe confirmation
//   /app                                  start screen (file loader)
//   /app/file/:fileId                     a loaded file
//   /app/file/:fileId/issues/:issueId     issue detail
//   /app/file/:fileId/record/:recordId    record editor

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/account/billing" element={<BillingPage />} />
      <Route path="/checkout/return" element={<CheckoutReturn />} />
      <Route path="/app" element={<AppShell />} />
      <Route path="/app/file/:fileId" element={<AppShell />} />
      <Route path="/app/file/:fileId/issues/:issueId" element={<AppShell />} />
      <Route path="/app/file/:fileId/record/:recordId" element={<AppShell />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
