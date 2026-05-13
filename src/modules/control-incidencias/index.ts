/**
 * Control de Incidencias - Main Module Entry Point
 * 
 * XVIII Convenio Colectivo Estatal para las Empresas del Comercio de Flores y Plantas
 * BOE-A-2025-21424
 * 
 * Architecture:
 * ├── core/          → Types, constants, shared utilities
 * ├── legal/         → Legal service (convenio consultation, sanction validation)
 * ├── ia/            → AI service (classification, drafts, summaries)
 * ├── disciplina/    → Disciplinary workflow orchestration
 * ├── incidencias/   → Incident CRUD and data access
 * ├── dashboards/    → Statistics and reporting
 * └── notifications/ → Email alerts and communications
 */

export * from './core';
export * from './legal';
export * from './ia';
