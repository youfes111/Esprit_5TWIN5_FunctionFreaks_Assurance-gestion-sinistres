import express from 'express';
import { apiRoutes } from './routes/api.routes.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import type { OntologySummary } from './services/ontology.service.js';
import { env } from './config/env.js';
import { SparqlClient } from './sparql/client.js';
import { SparqlService } from './services/sparql.service.js';
import { ClaimsService } from './services/claims.service.js';
import { ClaimsRepository } from './services/claims.repository.js';
import { claimsRoutes } from './routes/claims.routes.js';
import { nlpRoutes } from './routes/nlp.routes.js';
import { NlpService } from './services/nlp.service.js';
import { DashboardService } from './services/dashboard.service.js';
import { OntologyGraphService } from './services/ontology-graph.service.js';
import { visualizationRoutes } from './routes/visualization.routes.js';
import { AuthDatabase } from './auth/database.js';
import { AuthService } from './auth/service.js';
import { authConfig } from './auth/config.js';
import { authMiddleware, securityHeaders, csrfProtection, requireAuth } from './auth/middleware.js';
import { authRoutes, userRoutes } from './auth/routes.js';
import { health } from './controllers/system.controller.js';
import { ResourcesRepository } from './services/resources.repository.js';
import { ResourcesService } from './services/resources.service.js';
import { resourcesRoutes } from './routes/resources.routes.js';

export function createApp(summary: Readonly<OntologySummary>, sparql = new SparqlService(new SparqlClient(env.fusekiQueryEndpoint, env.sparqlTimeoutMs)), authentication?:AuthService) {
  const app = express();
  app.disable('x-powered-by');
  const config = authentication?.config??authConfig();
  const auth = authentication??new AuthService(new AuthDatabase(config.databasePath),config);
  app.locals.closeAuth = () => auth.store.close();
  app.use('/api',securityHeaders(config));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api',authMiddleware(auth),csrfProtection(config));
  app.get('/api/health',health);
  app.use('/api/auth',authRoutes(auth));
  app.use('/api',requireAuth);
  app.use('/api/admin/users',userRoutes(auth));
  app.use('/api', apiRoutes(summary, sparql));
  const claims = new ClaimsService(new ClaimsRepository({
    queryEndpoint: env.fusekiQueryEndpoint,
    updateEndpoint: env.mutationsEnabled ? env.fusekiUpdateEndpoint : env.fusekiQueryEndpoint.replace(/\/query$/, '/update'),
    timeoutMs: env.sparqlTimeoutMs, enabled: env.mutationsEnabled,
    username: env.fusekiUpdateUsername, password: env.fusekiUpdatePassword,
  }));
  app.use('/api/claims', claimsRoutes(claims, { enabled: env.mutationsEnabled }));
  const resources=new ResourcesService(new ResourcesRepository({
    queryEndpoint:env.fusekiQueryEndpoint,updateEndpoint:env.mutationsEnabled?env.fusekiUpdateEndpoint:env.fusekiQueryEndpoint.replace(/\/query$/,'/update'),
    timeoutMs:env.sparqlTimeoutMs,enabled:env.mutationsEnabled,username:env.fusekiUpdateUsername,password:env.fusekiUpdatePassword,
  }),env.mutationsEnabled);
  app.use('/api/insured',resourcesRoutes(resources,'insured',{enabled:env.mutationsEnabled}));
  app.use('/api/contracts',resourcesRoutes(resources,'contract',{enabled:env.mutationsEnabled}));
  app.use('/api/experts',resourcesRoutes(resources,'expert',{enabled:env.mutationsEnabled}));
  app.use('/api/damages',resourcesRoutes(resources,'damage',{enabled:env.mutationsEnabled}));
  app.use('/api/nlp', nlpRoutes(new NlpService(new SparqlClient(env.fusekiQueryEndpoint, env.sparqlTimeoutMs))));
  const visualizationReader = new SparqlClient(env.fusekiQueryEndpoint, env.sparqlTimeoutMs);
  app.use('/api', visualizationRoutes(new DashboardService(visualizationReader), new OntologyGraphService(visualizationReader)));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
