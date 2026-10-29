import { BrowserRouter, Route, Routes, Outlet } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppLayout } from './layouts/AppLayout';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { ChatbotProvider } from './features/chatbot/ChatbotProvider';
import { GlobalChatbot } from './features/chatbot/GlobalChatbot';
import { LegacyAssistantRedirect } from './features/chatbot/LegacyAssistantRedirect';
import { nlpApi } from './services/nlp';
import {AuthProvider} from './features/auth/AuthProvider';
import {RequireAuth} from './features/auth/RequireAuth';
import {DataState} from './components/DataState';
const LoginPage=lazy(()=>import('./pages/AuthPages').then(module=>({default:module.LoginPage})));
const ActivationPage=lazy(()=>import('./pages/AuthPages').then(module=>({default:module.ActivationPage})));
const ProfilePage=lazy(()=>import('./pages/ProfilePage').then(module=>({default:module.ProfilePage})));
const UsersPage=lazy(()=>import('./pages/UsersPage').then(module=>({default:module.UsersPage})));
const ClaimsPage = lazy(() => import('./pages/ClaimsPage').then((module) => ({ default: module.ClaimsPage })));
const OverviewPage = lazy(() => import('./pages/OverviewPage').then((module) => ({ default: module.OverviewPage })));
const OntologyPage = lazy(() => import('./pages/OntologyPage').then((module) => ({ default: module.OntologyPage })));
const SparqlPage = lazy(() => import('./pages/SparqlPage').then((module) => ({ default: module.SparqlPage })));
const ResourcesPage = lazy(() => import('./pages/ResourcesPage').then((module) => ({ default: module.ResourcesPage })));

function AuthenticatedWorkspace(){return <ChatbotProvider client={nlpApi}><Outlet/><GlobalChatbot/></ChatbotProvider>;}
export default function App() {
  return <BrowserRouter><AuthProvider><Suspense fallback={<DataState loading/>}><Routes>
    <Route path="login" element={<LoginPage/>}/><Route path="activate" element={<ActivationPage/>}/>
    <Route element={<RequireAuth/>}><Route element={<AuthenticatedWorkspace/>}><Route element={<AppLayout/>}>
      <Route index element={<OverviewPage/>}/><Route path="sinistres" element={<ClaimsPage/>}/><Route path="assistant" element={<LegacyAssistantRedirect/>}/>
      <Route path="sparql" element={<SparqlPage/>}/><Route path="ontologie" element={<OntologyPage/>}/><Route path="profile" element={<ProfilePage/>}/>
      <Route element={<RequireAuth admin/>}><Route path="admin/users" element={<UsersPage/>}/></Route>
      <Route path="contrats" element={<ResourcesPage kind="contract"/>}/><Route path="assures" element={<ResourcesPage kind="insured"/>}/><Route path="experts" element={<ResourcesPage kind="expert"/>}/><Route path="dommages" element={<ResourcesPage kind="damage"/>}/><Route path="*" element={<PlaceholderPage title="Page introuvable"/>}/>
    </Route></Route></Route>
  </Routes></Suspense></AuthProvider></BrowserRouter>;
}
