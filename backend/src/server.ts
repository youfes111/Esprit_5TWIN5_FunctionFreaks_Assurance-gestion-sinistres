import { createApp } from './app.js';
import { env } from './config/env.js';
import { loadOntology } from './services/ontology.service.js';

try {
  const summary = await loadOntology(env.ontologyPath);
  console.log(`Loaded ${summary.name}: ${summary.classCount} classes, ${summary.individualCount} named individuals.`);
  const app=createApp(summary);
  const server = app.listen(env.port, '127.0.0.1', () => {
    console.log(`API ready at http://127.0.0.1:${env.port}/api`);
  });
  server.on('error', (error) => { console.error('API failed to start:', error); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => server.close(() => {app.locals.closeAuth();process.exit(0);}));
  }
} catch (error) {
  console.error('Cannot start API. Check ONTOLOGY_PATH and the OWL file:', error);
  process.exitCode = 1;
}
