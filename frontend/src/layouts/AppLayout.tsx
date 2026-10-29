import { Suspense, useEffect, useState } from "react";
import { NavLink, Link, useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  LayoutDashboard,
  FileWarning,
  FileText,
  BadgeCheck,
  CarFront,
  Code2,
  Network,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  Users,
} from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "../components/ui/sheet";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "../components/ui/tooltip";
import { ThemeControl } from "../components/ThemeControl";
import { DataState } from "../components/DataState";
import { entrance } from "../design/motion";
import {useAuth} from '../features/auth/AuthProvider';
import {UserMenu} from '../components/UserMenu';

const navigation = [
  {
    to: "/",
    label: "Tableau de bord",
    description: "Une lecture claire de votre activité RDF.",
    icon: LayoutDashboard,
    group: "Pilotage",
  },
  {
    to: "/sinistres",
    label: "Sinistres",
    description: "Dossiers, relations et suivi des déclarations.",
    icon: FileWarning,
    group: "Pilotage",
  },
  {to:"/contrats",label:"Contrats",description:"Polices, titulaires et périodes de couverture.",icon:FileText,group:"Pilotage"},
  {to:"/assures",label:"Assurés",description:"Personnes assurées et dossiers associés.",icon:BadgeCheck,group:"Pilotage"},
  {to:"/experts",label:"Experts",description:"Expertises et dossiers affectés.",icon:Users,group:"Pilotage"},
  {to:"/dommages",label:"Dommages",description:"Évaluations et dommages liés aux sinistres.",icon:CarFront,group:"Pilotage"},
  {
    to: "/ontologie",
    label: "Ontologie",
    description: "Explorez la structure et les relations du domaine.",
    icon: Network,
    group: "Intelligence",
  },
  {
    to: "/sparql",
    label: "SPARQL Explorer",
    description: "Des requêtes approuvées, des résultats vérifiables.",
    icon: Code2,
    group: "Intelligence",
  },
];
export function SidebarContent({
  collapsed = false,
  onNavigate,
  channel,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  channel: string;
}) {
  const reduce = useReducedMotion();
  const {user}=useAuth();
  const items=user?.role==='ADMIN'?[...navigation,{to:'/admin/users',label:'Utilisateurs',description:'Administration des comptes applicatifs.',icon:Users,group:'Administration'}]:navigation;
  return (
    <>
      <Link
        to="/"
        onClick={onNavigate}
        className="brand"
        aria-label="Assurance — Dashboard"
      >
        <span className="brand-mark">
          <ShieldCheck size={25} />
        </span>
        <span className="brand-copy">
          assurance<span>INTELLIGENCE WORKSPACE</span>
        </span>
      </Link>
      <nav aria-label="Navigation principale">
        {["Pilotage", "Intelligence",...(user?.role==='ADMIN'?['Administration']:[])].map((group) => (
          <div className="nav-group" key={group}>
            <p className="nav-group-label" aria-hidden={collapsed}>{group}</p>
            {items
              .filter((item) => item.group === group)
              .map(({ to, label, icon: Icon }) => {
                // Radix Slot requires a string className. NavLink appends its
                // own active class, preserving route highlighting in tooltips.
                const link = (
                  <NavLink
                    to={to}
                    end={to === "/"}
                    onClick={onNavigate}
                    aria-label={collapsed ? label : undefined}
                    className="nav-item"
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span
                            className="nav-active"
                            layoutId={`navigation-${channel}`}
                            transition={{ duration: reduce ? 0 : 0.22 }}
                          />
                        )}
                        <Icon size={19} />
                        <span className="nav-copy">{label}</span>
                        {isActive && !collapsed && (
                          <span className="nav-active-dot" />
                        )}
                      </>
                    )}
                  </NavLink>
                );
                return collapsed ? (
                  <Tooltip key={to}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{label}</TooltipContent>
                  </Tooltip>
                ) : (
                  <div key={to}>{link}</div>
                );
              })}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <UserMenu collapsed={collapsed}/>
      </div>
    </>
  );
}
export function AppLayout() {
  const location = useLocation();
  const outlet = useOutlet();
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const page = navigation.find((item) => item.to === location.pathname);
  useEffect(() => {
    setMobile(false);
  }, [location.pathname]);
  return (
    <div className="app-shell" data-collapsed={collapsed}>
      <a href="#main-content" className="skip-link">
        Aller au contenu
      </a>
      <aside
        id="desktop-sidebar"
        className="sidebar desktop-sidebar"
        data-collapsed={collapsed}
        aria-label="Espace de travail"
      >
        <SidebarContent collapsed={collapsed} channel="desktop" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              className="sidebar-collapse"
              type="button"
              size={collapsed ? "icon" : "default"}
              onClick={() => setCollapsed((value) => !value)}
              aria-label={
                collapsed ? "Développer la navigation" : "Réduire la navigation"
              }
              aria-expanded={!collapsed}
              aria-controls="desktop-sidebar"
            >
              {collapsed ? (
                <PanelLeftOpen />
              ) : (
                <>
                  <PanelLeftClose />
                  <span>Réduire le menu</span>
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? "Développer" : "Réduire"} la navigation
          </TooltipContent>
        </Tooltip>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <Sheet open={mobile} onOpenChange={setMobile}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mobile-menu"
                  aria-label="Ouvrir la navigation"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="mobile-sidebar">
                <SheetHeader className="sr-only">
                  <SheetTitle>Navigation du projet</SheetTitle>
                  <SheetDescription>
                    Navigation des espaces et accès à l’assistant global.
                  </SheetDescription>
                </SheetHeader>
                <SidebarContent
                  channel="mobile"
                  onNavigate={() => setMobile(false)}
                />
              </SheetContent>
            </Sheet>
            <div className="topbar-context">
              <p>
                Workspace <span>/</span>{" "}
                <strong>{page?.label ?? "Page"}</strong>
              </p>
              <small>
                {page?.description ?? "Assurance & Gestion des Sinistres"}
              </small>
            </div>
          </div>
          <div className="topbar-right">
            <span className="academic-chip">
              PROJET ESPRIT <span>26—27</span>
            </span>
            <span className="topbar-divider" />
            <ThemeControl />
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              className="page-stage"
              {...entrance(reduce)}
            >
              <Suspense fallback={<DataState loading />}>{outlet}</Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
        <footer className="page-footer">
          <span>Assurance & Gestion des Sinistres</span>
          <span>
            Semantic Web Project <span className="footer-dot" /> Function Freaks
          </span>
        </footer>
      </div>
    </div>
  );
}
