import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronUp,
  ClipboardList,
  FlaskConical,
  Home,
  LayoutGrid,
  LogOut,
  Moon,
  Plus,
  Settings,
  Sun,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

function pageTitle(pathname: string): string {
  if (pathname === "/") return "Home";
  if (pathname.startsWith("/surveys/new")) return "New Survey";
  if (pathname.startsWith("/surveys")) return "Surveys";
  if (pathname.startsWith("/test-plans/new")) return "New Test Plan";
  if (pathname.startsWith("/test-plans")) return "Test Plans";
  if (pathname.startsWith("/configuration")) return "Configuration";
  if (pathname.startsWith("/scan")) return "Variance Scan";
  return "Copenhagen Conjoint";
}

function Brand() {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      onClick={toggleSidebar}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent"
    >
      <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
        <FlaskConical className="size-4" />
      </div>
      <div className="flex flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
        <span className="truncate text-sm font-semibold leading-tight text-foreground">
          Copenhagen Conjoint
        </span>
        <span className="truncate text-xs text-muted-foreground">
          Pairwise analysis
        </span>
      </div>
    </button>
  );
}

function UserMenu() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto w-full justify-start gap-3 p-2 hover:bg-sidebar-accent"
        >
          <Avatar className="size-8 shrink-0 rounded-md">
            <AvatarFallback className="rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              R
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col overflow-hidden text-left group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-medium leading-tight text-foreground">
              Rune
            </span>
            <span className="truncate text-xs text-muted-foreground">
              rfs@skardhamar.com
            </span>
          </div>
          <ChevronUp className="ml-auto size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align="start"
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
      >
        <DropdownMenuItem onClick={() => navigate("/")}>
          <Home />
          Home
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <LayoutGrid />
            Surveys
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => navigate("/surveys/new")}>
                <Plus />
                New
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/surveys")}>
                <LayoutGrid />
                Completed
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FlaskConical />
            Test Plans
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => navigate("/test-plans/new")}>
                <Plus />
                New
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/test-plans")}>
                <ClipboardList />
                List
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => navigate("/configuration")}>
          <Settings />
          Configuration
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            toggleTheme();
          }}
        >
          {theme === "dark" ? <Sun /> : <Moon />}
          Theme
          <DropdownMenuShortcut className="capitalize">
            {theme}
          </DropdownMenuShortcut>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => navigate("/")}>
          <LogOut />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppLayout() {
  const location = useLocation();

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Brand />
        </SidebarHeader>
        <SidebarContent />
        <SidebarFooter>
          <UserMenu />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <h1 className="text-sm font-semibold">{pageTitle(location.pathname)}</h1>
        </header>

        <main className="flex-1">
          <Outlet />
        </main>

        <footer className="border-t px-6 py-4">
          <p className={cn("text-center text-sm text-muted-foreground")}>
            © 2026 Copenhagen Conjoint. All rights reserved.
          </p>
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
