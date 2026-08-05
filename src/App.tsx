/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { createBrowserRouter, RouterProvider, Outlet, RouteObject } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { AppStateProvider } from './context/AppStateContext';
import { 
  ProtectedRoute, 
  DashboardRoute, 
  MonthlyRoute, 
  ConceptsRoute, 
  ConceptDetailsRoute, 
  AnnualRoute, 
  SettingsRoute,
  ImportRoute,
  NotFoundRoute
} from './routes/Routes';

const routes: RouteObject[] = [
  {
    path: "/",
    element: <ProtectedRoute />,
    children: [
      {
        path: "/",
        element: <DashboardRoute />,
      },
      {
        path: "calendario",
        element: <MonthlyRoute />,
      },
      {
        path: "conceptos",
        element: <ConceptsRoute />,
      },
      {
        path: "conceptos/:id",
        element: <ConceptDetailsRoute />,
      },
      {
        path: "resumen",
        element: <AnnualRoute />,
      },
      {
        path: "configuracion",
        element: <SettingsRoute />,
      },
      {
        path: "importar",
        element: <ImportRoute />,
      },
      {
        path: "*",
        element: <NotFoundRoute />,
      },
    ],
  },
];

const router = createBrowserRouter(routes);

export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <AppStateProvider>
          <RouterProvider router={router} />
        </AppStateProvider>
      </DataProvider>
    </AuthProvider>
  );
}
