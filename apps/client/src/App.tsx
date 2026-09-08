import '@xyflow/react/dist/style.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing from '@/pages/Landing';
import Auth from '@/pages/Auth';
import Dashboard from '@/pages/Dashboard';
import CreateWorkflow from '@/pages/CreateWorkflow';
import WorkflowDetail from '@/pages/WorkflowDetail';
import WorkflowExecutions from '@/pages/WorkflowExecutions';
import { getAuthToken } from '@/lib/http';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return getAuthToken() ? children : <Navigate to="/auth" replace />;
}

export default function App() {

  return <div className="min-h-screen bg-secondary/40">
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/create-workflow" element={<ProtectedRoute><CreateWorkflow /></ProtectedRoute>} />
        <Route path="/workflow/:workflowId" element={<ProtectedRoute><WorkflowDetail /></ProtectedRoute>} />
        <Route path="/workflow/:workflowId/executions" element={<ProtectedRoute><WorkflowExecutions /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  </div>
}
