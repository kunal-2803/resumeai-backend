// Controllers exports
export * from './resumeController';
export * from './jobController';
export * from './authController';
export * from './adminController';
// Export dashboardController with explicit names to avoid conflicts
export { getResumes as getDashboardResumes } from './dashboardController';
