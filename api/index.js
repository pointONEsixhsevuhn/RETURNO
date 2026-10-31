import { handleRequest } from "../server.js";

// Vercel routes /api/* to this Node.js function. The application handler is
// shared with the local HTTP server; it does not open a second listening port.
export default handleRequest;
