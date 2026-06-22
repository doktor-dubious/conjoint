import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FlaskConical,
  Home,
  LayoutGrid,
  LogOut,
  Plus,
  Search,
  Settings,
  Users,
} from "lucide-react";

import sidebarBgVideo from "../../media/sidebar-12-bg.mp4";
import { cn } from "@/lib/utils";
import { useActiveSurvey } from "@/components/providers/active-survey-provider";
import { useTheme } from "@/components/theme-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
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
  if (pathname.startsWith("/organizations/new")) return "New Organization";
  if (pathname.startsWith("/organizations")) return "Organizations";
  if (pathname.startsWith("/users/new")) return "New User";
  if (pathname.startsWith("/users")) return "Users";
  if (pathname.startsWith("/configuration")) return "Configuration";
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

// Animated theme icon (mirrors gorm.ai): the moon wobbles on hover when dark,
// the sun's rays stagger-fade in on hover when light. Pure CSS — the parent
// menu item carries `group/theme` to trigger the hover animations.
const SUN_RAYS = [
  "M12 2v2",
  "m19.07 4.93-1.41 1.41",
  "M20 12h2",
  "m17.66 17.66 1.41 1.41",
  "M12 20v2",
  "m6.34 17.66-1.41 1.41",
  "M2 12h2",
  "m4.93 4.93 1.41 1.41",
];

function ThemeIcon({
  dark,
  className,
}: {
  dark: boolean;
  className?: string;
}) {
  const common = {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (dark) {
    return (
      <svg
        {...common}
        className={cn(
          "size-4 origin-center group-hover/theme:animate-theme-wobble",
          className,
        )}
      >
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    );
  }
  return (
    <svg {...common} className={cn("size-4", className)}>
      <circle cx="12" cy="12" r="4" />
      {SUN_RAYS.map((d, i) => (
        <path
          key={d}
          d={d}
          className="group-hover/theme:animate-theme-ray"
          style={{ animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </svg>
  );
}

// Muted, greyscale looping video behind the sidebar content.
function SidebarBackground() {
  return (
    <video
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover opacity-[0.16] grayscale"
      src={sidebarBgVideo}
      autoPlay
      loop
      muted
      playsInline
      aria-hidden="true"
    />
  );
}

// Active-survey selector in the sidebar (mirrors gorm.ai's customer switcher):
// a primary-coloured bar showing the active survey, opening a searchable list.
function SurveySwitcher() {
  const navigate = useNavigate();
  const { surveys, activeSurvey, setActiveSurvey, loading } = useActiveSurvey();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? surveys.filter((s) => s.name.toLowerCase().includes(q))
    : surveys;

  function select(s: (typeof surveys)[number]) {
    setActiveSurvey(s);
    setOpen(false);
    setQuery("");
    navigate(`/surveys/${s.id}`);
  }

  const label =
    activeSurvey?.name ??
    (loading ? "Loading…" : surveys.length ? "Select survey…" : "No surveys");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 border-b border-sidebar-border bg-primary px-3 py-2 text-left text-primary-foreground outline-none transition-colors hover:bg-primary/90 group-data-[collapsible=icon]:justify-center"
      >
        <ClipboardList className="size-4 shrink-0" />
        <span className="flex-1 truncate text-xs group-data-[collapsible=icon]:hidden">
          {label}
        </span>
        <ChevronDown className="size-3 shrink-0 group-data-[collapsible=icon]:hidden" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center gap-2 border-b px-2.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search surveys…"
              className="h-9 w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                {loading ? "Loading…" : "No surveys found."}
              </p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => select(s)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground",
                    s.id === activeSurvey?.id && "font-medium",
                  )}
                >
                  <span className="flex-1 truncate">{s.name}</span>
                  {s.id === activeSurvey?.id && (
                    <Check className="size-3.5 shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
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
                <ClipboardList />
                List
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

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Building2 />
            Organizations
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => navigate("/organizations/new")}>
                <Plus />
                New
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/organizations")}>
                <ClipboardList />
                List
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Users />
            Users
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => navigate("/users/new")}>
                <Plus />
                New
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/users")}>
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
          className="group/theme"
          onSelect={(event) => {
            event.preventDefault();
            toggleTheme();
          }}
        >
          Theme
          <ThemeIcon dark={theme === "dark"} className="ml-auto" />
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
        <SidebarBackground />
        <SidebarHeader className="h-[72px] justify-center">
          <Brand />
        </SidebarHeader>
        <SurveySwitcher />
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
