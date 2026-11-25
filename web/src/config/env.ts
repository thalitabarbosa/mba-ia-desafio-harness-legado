// Único lugar do front que lê import.meta.env (G5).
// O `npm run up` passa VITE_API_URL com a API da própria cópia.
export const API_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:4000'
