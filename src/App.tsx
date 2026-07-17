import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import './App.css';
import { RepairProvider } from './state/RepairStore';
import { LicenseProvider } from './state/LicenseStore';
import { CloudSyncProvider } from './app/cloud/CloudSync';
import { AppRoutes } from './app/AppRoutes';
import { UpsellModal } from './app/billing/UpsellModal';

function App() {
  return (
    <BrowserRouter>
      <LicenseProvider>
        <RepairProvider>
          <CloudSyncProvider>
            <AppRoutes />
            <UpsellModal />
          </CloudSyncProvider>
        </RepairProvider>
      </LicenseProvider>
    </BrowserRouter>
  );
}

export default App;
