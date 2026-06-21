import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ConfigurationPage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Workspace and appearance settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Switch between light and dark themes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <span className="text-sm capitalize text-muted-foreground">
            Current theme: {theme}
          </span>
          <Button variant="outline" size="sm" onClick={toggleTheme}>
            Toggle theme
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
