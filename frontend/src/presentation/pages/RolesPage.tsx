import { trpc } from '@/infrastructure/api/trpc';
import { Button } from '@/presentation/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/presentation/components/ui/card';

export const RolesPage = () => {
  const { data: roles, isLoading } = trpc.role.getAll.useQuery();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="container mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Roles & Permissions</CardTitle>
            <CardDescription>Manage roles and their permissions</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div>Loading...</div>
            ) : (
              <div className="space-y-4">
                {roles?.map((role) => (
                  <div
                    key={role.id}
                    className="rounded-lg border p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold">{role.name}</h3>
                        {role.description && (
                          <p className="text-sm text-muted-foreground">
                            {role.description}
                          </p>
                        )}
                        <div className="mt-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Permissions ({role.permissions.length}):
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {role.permissions.map((permission) => (
                              <span
                                key={permission.id}
                                className="rounded-md bg-secondary px-2 py-1 text-xs"
                              >
                                {permission.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div>
                        <Button variant="outline" size="sm">
                          Edit
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
