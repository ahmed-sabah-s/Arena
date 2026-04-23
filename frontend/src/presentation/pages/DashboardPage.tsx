import { useAuth } from '@/application/hooks/useAuth';
import { Button } from '@/presentation/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/presentation/components/ui/card';
import { Link } from 'react-router-dom';

export const DashboardPage = () => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <h1 className="text-xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Welcome, {user?.name}
            </span>
            <Button variant="outline" onClick={logout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Welcome to Your Dashboard</h2>
          <p className="text-muted-foreground">
            Manage your account and access all features
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>View and edit your profile</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm">
                <strong>Email:</strong> {user?.email}
              </p>
              <p className="mb-4 text-sm">
                <strong>Roles:</strong> {user?.roles.map(r => r.name).join(', ')}
              </p>
              <Button asChild>
                <Link to="/settings/profile">View Profile</Link>
              </Button>
            </CardContent>
          </Card>

          {user && user.roles.some(r => 
            r.permissions.some(p => p.resource === 'users' && p.action === 'read')
          ) && (
            <Card>
              <CardHeader>
                <CardTitle>Users</CardTitle>
                <CardDescription>Manage users and permissions</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm">
                  View and manage all users in the system
                </p>
                <Button asChild>
                  <Link to="/users">Manage Users</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {user && user.roles.some(r => 
            r.permissions.some(p => p.resource === 'roles' && p.action === 'read')
          ) && (
            <Card>
              <CardHeader>
                <CardTitle>Roles & Permissions</CardTitle>
                <CardDescription>Manage roles and permissions</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm">
                  Configure roles and permissions
                </p>
                <Button asChild>
                  <Link to="/roles">Manage Roles</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>Security settings and 2FA</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm">
                2FA Status: {user?.twoFactorEnabled ? 'Enabled' : 'Disabled'}
              </p>
              <Button asChild>
                <Link to="/settings/security">Security Settings</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};
