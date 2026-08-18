import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-3xl font-bold">Workflow Builder</h1>
      <p className="text-muted-foreground">Automate your trading workflows visually.</p>
      <Link to="/auth" className="px-4 py-2 rounded-md bg-primary text-primary-foreground">
        Get Started
      </Link>
    </div>
  );
}