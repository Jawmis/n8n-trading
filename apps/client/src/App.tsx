import '@xyflow/react/dist/style.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from '@/pages/Landing';
import Auth from '@/pages/Auth';
import Dashboard from '@/pages/Dashboard';
import CreateWorkflow from '@/pages/CreateWorkflow';
import WorkflowDetail from '@/pages/WorkflowDetail';
import WorkflowExecutions from '@/pages/WorkflowExecutions';

export default function App() {

  return <div className="min-h-screen bg-secondary/40">
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/create-workflow" element={<CreateWorkflow />} />
        <Route path="/workflow/:workflowId" element={<WorkflowDetail />} />
        <Route path="/workflow/:workflowId/executions" element={<WorkflowExecutions />} />
      </Routes>
    </BrowserRouter>
  </div>
}